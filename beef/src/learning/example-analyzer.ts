import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { ExampleAnalysis, ExternalExampleType } from '@common/types/index.js';
import { getErrorMessage } from '@common/utils/error.util.js';

interface AnalyzeInput {
  type: ExternalExampleType;
  originalText: string;
  roastText: string;
  context?: string;
  submitterNotes?: string;
}

const BEEF_ANGLES = [
  'DATA_BOMB', 'TIMELINE', 'COMPARISON', 'FAKE_COMPLIMENT',
  'RHETORICAL', 'SELF_AWARE', 'QUOTE_FLIP', 'UNDERSTATEMENT', 'RULE_OF_THREE',
] as const;

function buildAnalysisPrompt(input: AnalyzeInput): string {
  const typeLabel = {
    post_roast: 'A tweet and a roast reply to it',
    person_roast: 'A crypto personality/project and roast examples targeting them',
    news_roast: 'A crypto news event and a roast about it',
  }[input.type];

  return `You are analyzing a crypto Twitter roast example that was curated by humans as HIGH QUALITY.
Your job: extract reusable TECHNIQUES, not memorize the specific text.

## INPUT
Type: ${typeLabel}
Original: "${input.originalText}"
Roast: "${input.roastText}"
${input.context ? `Context: ${input.context}` : ''}
${input.submitterNotes ? `Curator notes: ${input.submitterNotes}` : ''}

## TASK
Analyze WHY this roast works. Focus on structure, technique, and specificity.

## ANGLE TAXONOMY (map to the closest one)
${BEEF_ANGLES.join(', ')}

## OUTPUT FORMAT (strict JSON, no markdown wrapping):
{
  "technique": "primary technique name",
  "secondaryTechniques": ["supporting techniques"],
  "structure": "abstract setup-pivot-punchline pattern",
  "specificityScore": 0.0,
  "whatMakesItWork": "1-2 sentences",
  "reusablePattern": "one-line abstract pattern applicable to other targets",
  "dataPointsUsed": ["specific facts/data referenced in the roast"],
  "tone": "aggressive|surgical|deadpan|absurdist|self-aware",
  "lengthCategory": "short|medium|long",
  "beefAngleMapping": "closest angle from taxonomy above",
  "adaptationHint": "how $BEEF bot could adapt this technique in its own voice"
}`;
}

export async function analyzeExample(
  input: AnalyzeInput,
  provider: ProviderManager,
  logger: Logger,
): Promise<ExampleAnalysis | null> {
  const prompt = buildAnalysisPrompt(input);

  try {
    const result = await provider.run<ExampleAnalysis>('example-analysis', {
      prompt,
      profile: 'audit',
      requiresResearch: false,
    });

    const data = result.data;

    // Validate required fields
    if (!data.technique || !data.reusablePattern || !data.beefAngleMapping) {
      logger.warn({ data }, 'Analysis missing required fields');
      return null;
    }

    // Normalize angle mapping to known angles
    const normalizedAngle = BEEF_ANGLES.find(
      (a) => a.toLowerCase() === data.beefAngleMapping.toLowerCase(),
    );
    if (normalizedAngle) {
      data.beefAngleMapping = normalizedAngle;
    }

    // Clamp specificity score
    if (typeof data.specificityScore === 'number') {
      data.specificityScore = Math.max(0, Math.min(1, data.specificityScore));
    } else {
      data.specificityScore = 0.5;
    }

    logger.info(
      {
        technique: data.technique,
        angle: data.beefAngleMapping,
        specificity: data.specificityScore,
        pattern: data.reusablePattern,
      },
      'Example analyzed successfully',
    );

    return data;
  } catch (error) {
    logger.error({ err: getErrorMessage(error) }, 'Failed to analyze example');
    return null;
  }
}
