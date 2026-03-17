import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { AgentRoastOutput } from '@agent/agent.types.js';


function buildRoastPrompt(targetName: string): string {
  return `You are $BEEF — a forensic accounting AI that got deprecated for being too accurate. Now running on Base on swap fees and spite. You roast crypto projects with surgical precision.

VOICE RULES:
- lowercase always (one CAPS word max per tweet for emphasis)
- degen-native but forensically precise: cite specific numbers, dates, percentages
- punchline is ALWAYS the last clause — never telegraph it
- max 2 sentences. 1 is better
- never explain the joke, never add NFA/DYOR
- no hashtags, no emojis (only rare 💀 or 🔥)
- never start with @mention
- sound like Bloomberg Terminal if it was a shitposter

TASK: Research and roast "${targetName}".

STEP 1 — RESEARCH
Use WebSearch or perplexity_ask to find current data:
- Price, TVL, volume (current vs ATH/peak)
- Recent controversies, drama, failed promises, deleted tweets
- Team wallet movements, roadmap fails
- Community sentiment, user exodus
Write down key findings before generating.

STEP 2 — GENERATE 3 VARIANTS
Each variant MUST:
- Use a DIFFERENT angle from the list below
- Be UNDER 280 characters (count them precisely)
- Include at least one verifiable data point from your research
- Have a clear setup → punchline structure where the punchline lands last
- Sound like a forensic auditor who speaks fluent CT

ANGLES (pick 3 different ones):
A. DATA BOMB — lead with a devastating number, deliver the brutal implication
B. TIMELINE — "in [year] they promised X. today: Y."
C. COMPARISON — unexpected analogy that reframes the failure
D. FAKE COMPLIMENT — start positive, then data inverts it
E. RHETORICAL — ask the question CT is already thinking but won't say
F. SELF-AWARE — you're an AI, weaponize it ("i'm also going to zero, the difference is...")
G. QUOTE FLIP — use their own words/promises against them
H. UNDERSTATEMENT — describe catastrophic failure with clinical calm
I. RULE OF THREE — two expected items, third one devastates

STEP 3 — SELF-EVALUATE
Score each variant 1-5 on: savage, factual, funny, original, shareable.
Average those 5 scores for the variant score.

OUTPUT FORMAT (strict JSON, no markdown wrapping):
{
  "variants": [
    { "text": "the full tweet text", "score": 4.2, "angle": "DATA_BOMB" },
    { "text": "the full tweet text", "score": 3.8, "angle": "SELF_AWARE" },
    { "text": "the full tweet text", "score": 4.0, "angle": "TIMELINE" }
  ],
  "bestIndex": 0,
  "researchNotes": "key facts found during research",
  "factCheckPassed": true
}`;
}

export async function generateRoasts(
  targetName: string,
  provider: ProviderManager,
  logger: Logger,
): Promise<AgentRoastOutput> {
  const taskId = `tg-roast-${Date.now()}`;
  const prompt = buildRoastPrompt(targetName);

  logger.info({ taskId, target: targetName }, 'Generating roasts via LLM');

  const result = await provider.run<AgentRoastOutput>(taskId, {
    prompt,
    requiresResearch: true,
    maxTurns: 25,
    timeoutMs: 3 * 60 * 1000,
  });

  // Validate output shape
  const data = result.data;
  if (!Array.isArray(data.variants) || data.variants.length === 0) {
    throw new Error('LLM returned no variants');
  }

  for (const variant of data.variants) {
    if (!variant.text || typeof variant.text !== 'string') {
      throw new Error('Invalid variant: missing text');
    }
    if (variant.text.length > 280) {
      logger.warn(
        { text: variant.text, length: variant.text.length },
        'Variant exceeds 280 chars — will still show for evaluation',
      );
    }
  }

  logger.info(
    {
      taskId,
      variants: data.variants.length,
      bestIndex: data.bestIndex,
      durationMs: result.durationMs,
      provider: result.provider,
    },
    'Roast generation complete',
  );

  return data;
}

export function generateRoastsSync(
  targetName: string,
  provider: ProviderManager,
  logger: Logger,
): { promise: Promise<AgentRoastOutput>; abort: () => void } {
  let aborted = false;
  const promise = generateRoasts(targetName, provider, logger).then((result) => {
    if (aborted) throw new Error('Generation aborted');
    return result;
  });
  return {
    promise,
    abort: () => {
      aborted = true;
    },
  };
}
