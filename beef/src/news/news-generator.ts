/**
 * Phase 3: Parallel roast generation.
 *
 * Slot 1: Single Opus call generating 5 variants per story (25 total).
 * Slot 2: 5 sequential Lightning (Sonnet) calls, 10 variants per story (50 total).
 * Both legs run concurrently via provider's maxConcurrent=2.
 */

import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { AgentRoastOutput } from '@agent/agent.types.js';
import type { NewsStory, NewsVariant, ResearchOutput } from './types.js';
import { getErrorMessage } from '@common/utils/error.util.js';

// --- Opus deep generation prompt ---

function buildOpusGenPrompt(research: ResearchOutput): string {
  const storiesJson = JSON.stringify(research.stories, null, 2);

  return `You are 0xBeef — the most savage crypto roast bot on Base. Below are ${String(research.stories.length)} news stories with verified facts and ammunition. Your job: generate the BEST possible standalone roasts.

## STORIES + AMMUNITION
${storiesJson}

## MARKET CONTEXT
${research.marketContext}

## GENERATION RULES

For EACH story, generate 5 variants. Use the following angle distribution:
1. YOUR BEST SHOT — whichever angle hits hardest for this story
2. QUOTE_FLIP — use their own words against them (quote from ammunition.quotes)
3. DATA_BOMB — lead with the most devastating number
4. Use the first suggestedAngle from the story
5. FREESTYLE — combine any techniques, maximum creativity

## FORMAT RULES (CRITICAL — violating these = instant reject)
- STANDALONE tweet. Reader has ZERO context about the story.
- Name the target in the FIRST 5 WORDS: "aerodrome shipped v4 and..."
- 80-200 chars. Sweet spot: 100-160. Over 200 = cut.
- 3rd person always. "Aerodrome's new..." NOT "your new..."
- Max 2 sentences. Setup + punchline. The punchline must work in isolation.
- ONE core idea per roast — max 2 data points.
- Self-contained: funny without clicking any link or knowing the backstory.
- Lowercase degen voice: no caps unless it's a ticker ($AERO) or emphasis.

## ADDITIONAL RESEARCH
You have research tools. For each story, you MAY:
- Verify an additional fact via WebSearch
- Check a live price or TVL via curl
- Find a better quote from the target's recent tweets
DO THIS ONLY if it strengthens the roast. Don't research just to research.

## SELF-SCORE each variant 1-5:
5 = "stop scrolling" funny, specific data, perfect punchline
4 = solid roast, could go semi-viral
3 = decent but forgettable
2 = generic or too long
1 = not funny

## OUTPUT (strict JSON, no markdown wrapping)
{
  "variants": [
    { "text": "the full tweet text", "score": 4.2, "angle": "QUOTE_FLIP", "storyId": "story-slug" }
  ],
  "bestIndex": 0,
  "researchNotes": "brief notes on additional facts found",
  "factCheckPassed": true
}

${String(research.stories.length * 5)} variants total (5 per story). Exclude anything you'd self-score below 3.`;
}

// --- Lightning generation prompt per story ---

function buildLightningStoryPrompt(story: NewsStory): string {
  const ammo = [
    ...story.ammunition.quotes.map((q) => `Quote: "${q}"`),
    ...story.ammunition.contradictions.map((c) => `Reality: ${c}`),
    ...story.ammunition.numbers.map((n) => `Data: ${n}`),
  ].join('\n');

  const facts = story.keyFacts.join('\n- ');

  return `You are 0xBeef — savage crypto roast bot. Generate 10 standalone tweet roasts about this news story.

## STORY: ${story.label}
Target: ${story.target}
Key facts:
- ${facts}

## AMMUNITION
${ammo || '(use key facts as ammunition)'}

Suggested angles: ${story.suggestedAngles.join(', ') || 'any'}

## FORMAT RULES (CRITICAL)
- STANDALONE tweet. Reader has ZERO context.
- Name "${story.target}" in the FIRST 5 WORDS.
- 80-200 chars. Sweet spot: 100-160.
- 3rd person always.
- Max 2 sentences. Setup + punchline.
- Lowercase degen voice. No caps except tickers.
- Self-contained: funny without backstory.

## VARIANT PERSONAS (one per variant)
1. Surgeon — precise, clinical data devastation
2. CT Native — "ser" "ngmi" "few understand" energy
3. Comedian — pure comedy, setup-punchline
4. Psychopath — dark, unsettling calm
5. Chaos Agent — chaotic, absurd escalation
6. Forensic Analyst — cold receipts and numbers
7. Group Chat King — screenshot-bait energy
8. Therapist — patronizing concern
9. VC Partner — boardroom disappointment
10. Reality Show Host — dramatic narration

## SELF-SCORE each 1-5:
- FUNNY (×0.5): Would someone LAUGH? Nod = max 3.
- IMPACT (×0.3): Stop-scrolling worthy?
- ORIGINAL (×0.2): Swap target name — still works? = max 2.

Composite: (FUNNY × 0.5) + (IMPACT × 0.3) + (ORIGINAL × 0.2).

## OUTPUT (strict JSON, no markdown wrapping)
{
  "variants": [
    { "text": "...", "score": 4.2, "angle": "QUOTE_FLIP" }
  ],
  "bestIndex": 0,
  "researchNotes": null,
  "factCheckPassed": true
}

Return ALL 10 variants sorted by composite score (highest first).`;
}

// --- Parse variants from LLM output ---

function parseVariants(data: unknown, storyId: string, pipeline: 'opus' | 'lightning'): NewsVariant[] {
  let obj: Record<string, unknown>;

  if (typeof data === 'string') {
    const cleaned = data.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    try {
      obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return [];
    }
  } else if (typeof data === 'object' && data !== null) {
    const wrapper = data as Record<string, unknown>;
    if (typeof wrapper['text'] === 'string') {
      return parseVariants(wrapper['text'], storyId, pipeline);
    }
    obj = wrapper;
  } else {
    return [];
  }

  if (!Array.isArray(obj['variants'])) return [];

  const variants: NewsVariant[] = [];
  for (const raw of obj['variants'] as Array<Record<string, unknown>>) {
    if (typeof raw['text'] !== 'string') continue;
    const text = raw['text'].trim();
    if (text.length < 20 || text.length > 300) continue;

    variants.push({
      text,
      angle: typeof raw['angle'] === 'string' ? raw['angle'] : 'UNKNOWN',
      selfScore: typeof raw['score'] === 'number' ? raw['score'] : 3,
      storyId: typeof raw['storyId'] === 'string' ? raw['storyId'] : storyId,
      pipeline,
    });
  }

  return variants;
}

// --- Timeout helper ---

function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${String(Math.round(ms / 1000))}s`)), ms);
    }),
  ]);
}

// --- Main generation ---

export interface GenerationResult {
  opusVariants: NewsVariant[];
  lightningVariants: NewsVariant[];
  researchNotes: string | null;
  opusStatus: 'ok' | 'failed' | 'timeout';
  lightningStatus: 'ok' | 'partial' | 'failed';
  opusDurationMs: number;
  lightningDurationMs: number;
}

export async function runNewsGeneration(opts: {
  provider: ProviderManager;
  logger: Logger;
  research: ResearchOutput;
  opusTimeoutMs?: number;
}): Promise<GenerationResult> {
  const { provider, logger, research, opusTimeoutMs = 600_000 } = opts;
  const stories = research.stories.slice(0, 5);

  if (stories.length === 0) {
    throw new Error('No stories to generate roasts for');
  }

  logger.info({ stories: stories.length }, 'Starting news generation (Phase 3)');

  // --- Leg A: Opus deep generation (slot 1) ---
  const opusStart = Date.now();
  let opusVariants: NewsVariant[] = [];
  let opusStatus: 'ok' | 'failed' | 'timeout' = 'failed';
  let researchNotes: string | null = null;

  const opusPromise = (async () => {
    const prompt = buildOpusGenPrompt(research);
    const taskId = `news-gen-opus-${Date.now()}`;
    const result = await provider.run<string>(taskId, {
      prompt,
      profile: 'news-generate',
      requiresResearch: true,
    });
    return result;
  })();

  // --- Leg B: Lightning diversity (slot 2, sequential) ---
  const lightningStart = Date.now();
  let lightningVariants: NewsVariant[] = [];
  let lightningSuccesses = 0;

  const lightningPromise = (async () => {
    for (const story of stories) {
      try {
        const prompt = buildLightningStoryPrompt(story);
        const taskId = `news-gen-lightning-${story.storyId}-${Date.now()}`;
        const result = await provider.run<string>(taskId, {
          prompt,
          profile: 'roast-lightning',
          requiresResearch: false,
          skipDegradedTracking: true,
        });
        const variants = parseVariants(result.data, story.storyId, 'lightning');
        lightningVariants.push(...variants);
        lightningSuccesses++;
        logger.info(
          { storyId: story.storyId, variants: variants.length },
          'Lightning story generation complete',
        );
      } catch (err) {
        logger.warn(
          { storyId: story.storyId, err: getErrorMessage(err) },
          'Lightning story generation failed',
        );
      }
    }
  })();

  // --- Run both legs concurrently ---
  const [opusResult] = await Promise.allSettled([
    raceTimeout(opusPromise, opusTimeoutMs, 'Opus generation'),
    lightningPromise,
  ]);

  const opusDurationMs = Date.now() - opusStart;
  const lightningDurationMs = Date.now() - lightningStart;

  if (opusResult.status === 'fulfilled') {
    // Parse all Opus variants — they have storyId in the output
    const allOpus = parseVariants(opusResult.value.data, stories[0]!.storyId, 'opus');
    opusVariants = allOpus;
    opusStatus = 'ok';

    // Extract research notes
    if (typeof opusResult.value.data === 'string') {
      const noteMatch = opusResult.value.data.match(/"researchNotes"\s*:\s*"([^"]*)"/);
      if (noteMatch) researchNotes = noteMatch[1] ?? null;
    }

    logger.info(
      { variants: opusVariants.length, durationMs: opusDurationMs },
      'Opus generation complete',
    );
  } else {
    const errMsg = getErrorMessage(opusResult.reason);
    opusStatus = errMsg.includes('timed out') ? 'timeout' : 'failed';
    logger.warn(
      { err: errMsg, durationMs: opusDurationMs },
      `Opus generation ${opusStatus}`,
    );
  }

  const lightningStatus = lightningSuccesses === stories.length
    ? 'ok' as const
    : lightningSuccesses > 0
      ? 'partial' as const
      : 'failed' as const;

  logger.info(
    {
      opusVariants: opusVariants.length,
      lightningVariants: lightningVariants.length,
      opusStatus,
      lightningStatus,
      opusDurationMs,
      lightningDurationMs,
    },
    'News generation (Phase 3) complete',
  );

  return {
    opusVariants,
    lightningVariants,
    researchNotes,
    opusStatus,
    lightningStatus,
    opusDurationMs,
    lightningDurationMs,
  };
}

export { buildOpusGenPrompt, buildLightningStoryPrompt, parseVariants };
