// Vision-based meme quality evaluator.
// Uses AnthropicSDKProvider directly (the only provider supporting imagePaths).

import type { Logger } from 'pino';
import type { AnthropicSDKProvider } from '@agent/anthropic-sdk.provider.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import type { MemeStrategyId } from './meme-strategies.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemeJudgeInput {
  localPath: string;
  templateName: string;
  tweetText: string;
  tweetAuthor: string;
  boxes: string[];
  strategy: MemeStrategyId;
  index: number;
}

export interface MemeJudgeScore {
  index: number;
  punch: number;
  specificity: number;
  clarity: number;
  templateFit: number;
  composite: number;
  reasoning: string;
}

interface RawJudgeOutput {
  punch: number;
  specificity: number;
  clarity: number;
  template_fit: number;
  reasoning: string;
}

// ─── Weights ─────────────────────────────────────────────────────────────────

const WEIGHTS = {
  punch: 0.35,
  specificity: 0.30,
  clarity: 0.20,
  templateFit: 0.15,
} as const;

function computeComposite(scores: { punch: number; specificity: number; clarity: number; templateFit: number }): number {
  const raw = scores.punch * WEIGHTS.punch
    + scores.specificity * WEIGHTS.specificity
    + scores.clarity * WEIGHTS.clarity
    + scores.templateFit * WEIGHTS.templateFit;
  return Math.round(raw * 100) / 100;
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildJudgePrompt(input: MemeJudgeInput): string {
  return `You are a HARSH meme quality judge for a crypto roast bot (@0xBeefer). Most memes are mediocre — your job is to identify the rare genuinely funny ones.

CALIBRATION: A score of 7+ means you would personally screenshot and send this meme to a group chat. Most memes should score 4-6. An 8+ is exceptional — maybe 1 in 10 memes deserves it. Be brutally honest.

Evaluate this rendered meme image.

CONTEXT:
Target tweet being roasted: "@${input.tweetAuthor}: ${input.tweetText}"
Template used: ${input.templateName}
Box texts: ${input.boxes.map((b, i) => `[${String(i)}] "${b}"`).join(' | ')}
Humor strategy applied: ${input.strategy}

Look at the meme image and score it on 4 dimensions (1-10 each):

PUNCH (weight 0.35): Does the joke land as a gut reaction? Would someone screenshot this?
  10: devastating, physically laughed
  7-9: genuinely funny, would share to group chat
  4-6: mildly amusing, competent
  1-3: flat, forced, not a real joke

SPECIFICITY (weight 0.30): Is the roast specific to THIS tweet/person, or could it apply to anything?
  10: only works for this exact tweet — references something unique about it
  7-9: clearly targets this person/tweet even if slightly paraphrasable
  4-6: vaguely relevant, generic crypto angle
  1-3: could be about literally anyone in crypto

CLARITY (weight 0.20): Can you get the joke in 3 seconds of scrolling?
  10: instant comprehension, zero friction
  7-9: clear on first look
  4-6: requires a moment of thought
  1-3: confusing, needs external context to understand

TEMPLATE_FIT (weight 0.15): Does the box text match the template's intended structure and narrative flow?
  10: text perfectly exploits this template's comedic dynamic
  7-9: good fit, template works as intended
  4-6: template is being used but the text doesn't fully leverage it
  1-3: wrong template for this content, boxes feel forced

Respond with ONLY valid JSON (no markdown, no code fences):
{"punch":N,"specificity":N,"clarity":N,"template_fit":N,"reasoning":"one sentence explaining the score"}`;
}

// ─── Judge ───────────────────────────────────────────────────────────────────

export class MemeJudge {
  constructor(
    private readonly sdkProvider: AnthropicSDKProvider,
    private readonly logger: Logger,
  ) {}

  async evaluate(input: MemeJudgeInput): Promise<MemeJudgeScore> {
    const prompt = buildJudgePrompt(input);

    const result = await this.sdkProvider.run<RawJudgeOutput>(
      `meme-evaluate-${String(input.index)}`,
      {
        prompt,
        requiresResearch: false,
        imagePaths: [input.localPath],
      },
    );

    const raw = result.data;
    const scores = {
      punch: clamp(raw.punch, 1, 10),
      specificity: clamp(raw.specificity, 1, 10),
      clarity: clamp(raw.clarity, 1, 10),
      templateFit: clamp(raw.template_fit, 1, 10),
    };

    return {
      index: input.index,
      ...scores,
      composite: computeComposite(scores),
      reasoning: raw.reasoning ?? '',
    };
  }

  async evaluateBatch(inputs: MemeJudgeInput[], concurrency = 4): Promise<MemeJudgeScore[]> {
    const results: MemeJudgeScore[] = [];

    for (let i = 0; i < inputs.length; i += concurrency) {
      const chunk = inputs.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        chunk.map((input) => this.evaluate(input)),
      );

      for (let j = 0; j < settled.length; j++) {
        const r = settled[j]!;
        if (r.status === 'fulfilled') {
          results.push(r.value);
        } else {
          const failedInput = chunk[j]!;
          this.logger.warn(
            { err: getErrorMessage(r.reason), index: failedInput.index, template: failedInput.templateName, strategy: failedInput.strategy },
            'Meme vision evaluation failed for variant',
          );
        }
      }
    }

    return results.sort((a, b) => b.composite - a.composite);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (typeof value !== 'number' || isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}
