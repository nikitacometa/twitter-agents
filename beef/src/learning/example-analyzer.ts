import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { ExampleAnalysis, ExternalExampleType } from '@common/types/index.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import type { FetchedTweet } from './tweet-fetcher.js';

const BEEF_ANGLES = [
  'DATA_BOMB', 'TIMELINE', 'COMPARISON', 'FAKE_COMPLIMENT',
  'RHETORICAL', 'SELF_AWARE', 'QUOTE_FLIP', 'UNDERSTATEMENT', 'RULE_OF_THREE',
] as const;

export interface RawExampleInput {
  text?: string;
  imagePath?: string;
  resolvedTweets?: FetchedTweet[];
}

export interface ExampleParseResult {
  parsed: {
    type: ExternalExampleType;
    originalText: string;
    originalAuthor: string | null;
    roastText: string;
    roastAuthor: string | null;
    context: string | null;
    score: number;
  };
  analysis: ExampleAnalysis;
}

function buildParsePrompt(input: RawExampleInput): string {
  const sections: string[] = [];

  sections.push(`You are an expert crypto Twitter analyst. A human curator submitted an example of a high-quality roast.
Your job: UNDERSTAND what was submitted, EXTRACT structured data, ANALYZE why it works, and RATE the quality.`);

  // Input section
  sections.push('\n## INPUT');

  if (input.text) {
    sections.push(`\nUser's message:\n"""\n${input.text}\n"""`);
  }

  if (input.imagePath) {
    sections.push(`\nThe user also attached a screenshot. Read it with the Read tool at: ${input.imagePath}`);
    sections.push('Examine the image carefully — it likely contains a tweet, a roast reply, or a conversation thread.');
  }

  if (input.resolvedTweets && input.resolvedTweets.length > 0) {
    sections.push('\nResolved tweet URLs:');
    for (const tweet of input.resolvedTweets) {
      sections.push(`  - @${tweet.authorName}: "${tweet.text}" (${tweet.tweetUrl})`);
    }
  }

  if (!input.text && !input.imagePath && (!input.resolvedTweets || input.resolvedTweets.length === 0)) {
    sections.push('\n(Empty input — this should not happen)');
  }

  // Instructions
  sections.push(`
## EXTRACTION RULES

The input can be ANYTHING: a screenshot of tweets, raw text, tweet URLs, a description, or any combination.
Your job is to figure out what's the "original" (thing being roasted) and what's the "roast" (the burn/comeback).

- **type**: classify as one of:
  - "post_roast" — a specific tweet/post and a roast reply to it
  - "person_roast" — a crypto personality/project being roasted (no specific original post)
  - "news_roast" — a news event/announcement and a roast about it
- **originalText**: the content being roasted (original tweet, news headline, description of person/project)
- **originalAuthor**: who posted/is the original (if identifiable), null otherwise
- **roastText**: the actual roast/burn/comeback text — THIS IS THE MOST IMPORTANT FIELD
- **roastAuthor**: who wrote the roast (if identifiable), null otherwise
- **context**: any extra context that helps understand why the roast is effective, null if obvious
- **score**: your quality rating 1-5 based on: savage, factual, funny, original, shareable

If the input is a single standalone roast without a clear "original" — put a brief description of the target in originalText.
If you see a conversation thread, identify which part is the original and which is the roast.

## ANALYSIS (for the roast text you extracted)

Analyze WHY this roast works. Focus on structure, technique, and what makes it crypto-Twitter effective.

## ANGLE TAXONOMY (map the roast to the closest one)
${BEEF_ANGLES.join(', ')}

## OUTPUT FORMAT (strict JSON, no markdown wrapping):
{
  "parsed": {
    "type": "post_roast",
    "originalText": "the thing being roasted",
    "originalAuthor": "author name or null",
    "roastText": "the actual roast text",
    "roastAuthor": "roast author or null",
    "context": "extra context or null",
    "score": 4
  },
  "analysis": {
    "technique": "primary technique name",
    "secondaryTechniques": ["supporting techniques"],
    "structure": "abstract setup-pivot-punchline pattern",
    "specificityScore": 0.85,
    "whatMakesItWork": "1-2 sentences explaining effectiveness",
    "reusablePattern": "one-line abstract pattern applicable to other targets",
    "dataPointsUsed": ["specific facts/data referenced in the roast"],
    "tone": "aggressive|surgical|deadpan|absurdist|self-aware",
    "lengthCategory": "short|medium|long",
    "beefAngleMapping": "closest angle from taxonomy",
    "adaptationHint": "how $BEEF bot could adapt this technique"
  }
}`);

  return sections.join('\n');
}

function validateResult(data: ExampleParseResult): boolean {
  if (!data.parsed || !data.analysis) return false;
  if (!data.parsed.roastText || !data.parsed.originalText) return false;
  if (!data.parsed.type || !['post_roast', 'person_roast', 'news_roast'].includes(data.parsed.type)) return false;
  if (typeof data.parsed.score !== 'number' || data.parsed.score < 1 || data.parsed.score > 5) return false;
  if (!data.analysis.technique || !data.analysis.reusablePattern || !data.analysis.beefAngleMapping) return false;
  return true;
}

function normalizeResult(data: ExampleParseResult): ExampleParseResult {
  // Clamp score
  data.parsed.score = Math.max(1, Math.min(5, Math.round(data.parsed.score)));

  // Normalize angle
  const normalizedAngle = BEEF_ANGLES.find(
    (a) => a.toLowerCase() === data.analysis.beefAngleMapping.toLowerCase(),
  );
  if (normalizedAngle) {
    data.analysis.beefAngleMapping = normalizedAngle;
  }

  // Clamp specificity
  if (typeof data.analysis.specificityScore === 'number') {
    data.analysis.specificityScore = Math.max(0, Math.min(1, data.analysis.specificityScore));
  } else {
    data.analysis.specificityScore = 0.5;
  }

  // Ensure arrays
  data.analysis.secondaryTechniques ??= [];
  data.analysis.dataPointsUsed ??= [];

  return data;
}

export async function parseAndAnalyzeExample(
  input: RawExampleInput,
  provider: ProviderManager,
  logger: Logger,
): Promise<ExampleParseResult | null> {
  const prompt = buildParsePrompt(input);
  const hasImage = !!input.imagePath;

  try {
    const result = await provider.run<ExampleParseResult>('example-parse', {
      prompt,
      profile: 'example-parse',
      requiresResearch: false,
      maxTurns: hasImage ? 3 : 1,
    });

    const data = result.data;

    if (!validateResult(data)) {
      logger.warn({ data, hasImage }, 'Example parse result failed validation');
      return null;
    }

    const normalized = normalizeResult(data);

    logger.info(
      {
        type: normalized.parsed.type,
        score: normalized.parsed.score,
        technique: normalized.analysis.technique,
        angle: normalized.analysis.beefAngleMapping,
        hasImage,
        durationMs: result.durationMs,
      },
      'Example parsed and analyzed',
    );

    return normalized;
  } catch (error) {
    logger.error({ err: getErrorMessage(error), hasImage }, 'Failed to parse/analyze example');
    return null;
  }
}
