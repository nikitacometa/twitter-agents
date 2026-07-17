import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { AgentRankingOutput } from '@agent/agent.types.js';
import type { EvaluationResult, EvaluationScores, JudgeEvaluation } from './types.js';
import {
  pickJudges,
  buildEvaluationPrompt,
  parseEvaluationOutput,
} from './judge-personas.js';
import type { JudgePersonaConfig } from './judge-personas.js';
import { getErrorMessage } from '@common/utils/error.util.js';

// ---------------------------------------------------------------------------
// Weighted scoring — FUNNY is king, TIMELY is tiebreaker
// ---------------------------------------------------------------------------

// Weights recalibrated from human review (March 2026, 33 rated roasts).
// M5 update: FUNNY dominance confirmed, SHAREABLE→IMPACT for directness,
// TIMELY zeroed (evergreen stockpile bias), DEGEN/SAVAGE deprioritized.
export const DIMENSION_WEIGHTS: Record<keyof EvaluationScores, number> = {
  funny: 0.40,
  impact: 0.20,
  original: 0.15,
  savage: 0.10,
  degen: 0.05,
  factual: 0.05,
  crypto_native: 0.05,
  timely: 0.00,
};

export function calculateWeightedComposite(scores: EvaluationScores): number {
  let sum = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    sum += (scores[dim as keyof EvaluationScores] ?? 0) * weight;
  }
  return sum;
}

// Minimum surviving judges for a serious-mode panel verdict. Below this the
// consensus math degenerates — with 1-2 survivors a single judge becomes a
// "majority", reintroducing the single-judge false positives the panel exists
// to prevent.
export const MIN_JUDGE_QUORUM = 3;

// ---------------------------------------------------------------------------
// Hard vetoes — FUNNY uses majority-based consensus, not single-judge
// ---------------------------------------------------------------------------

/**
 * Per-judge safety checks. Returns a veto reason string or null.
 *
 * FUNNY < 2 is intentionally excluded here — it uses majority-based consensus
 * instead (see checkFunnyConsensusVeto). Single-judge FUNNY veto was producing
 * false positives on deadpan roasts that other judges scored high.
 */
export function checkHardVetoes(scores: EvaluationScores): string | null {
  if (scores.factual < 2) return 'FACTUAL < 2 (invented claims)';
  if (scores.original < 2) return 'ORIGINAL < 2 (completely generic)';
  if (scores.degen < 1) return 'DEGEN < 1 (zero brand voice)';
  return null;
}

/**
 * Consensus FUNNY veto: fires when a majority of judges score FUNNY < 2.
 * In 5-judge mode: 3+ judges. In 3-judge mode: 2+ judges.
 */
export function checkFunnyConsensusVeto(
  results: JudgeEvaluation[],
): string | null {
  const lowFunnyCount = results.filter((r) => r.result.scores.funny < 2).length;
  const majorityThreshold = Math.floor(results.length / 2) + 1;
  if (lowFunnyCount >= majorityThreshold) {
    return `FUNNY_CONSENSUS: ${String(lowFunnyCount)}/${String(results.length)} judges scored FUNNY < 2`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pre-filter — reject before expensive LLM calls
// ---------------------------------------------------------------------------

export interface PreFilterResult {
  pass: boolean;
  reason?: string;
}

const GENERIC_PATTERNS = [
  /this is fine/i,
  /probably nothing/i,
  /few understand/i,
  /most .+ could never/i,
  /that's not .+, that's .+/i,
  /\bghost chain\b/i,
  /\bdead (?:project|chain|protocol)\b/i,
  /\bwen (?:product|utility|lambo)\b/i,
];

const TELEGRAPHED_PATTERNS = [
  /i want to frame this/i,
  /you have to respect the/i,
  /i have nothing to add/i,
  /genuinely impressive/i,
  /^it's 20\d\d\b/i,
  /genuinely the most/i,
];

// Patterns that signal "too technical" — human reviewers consistently reject these
const TOO_TECHY_PATTERNS = [
  /\bERC-\d+\b.*\bfunctions?\b/i,
  /\bsetLawEnforcement/i,
  /\bwipeFrozen/i,
  /\bterms of service say\b.*\bcontractual IOU\b/i,
];

// Temporal projection — "at current rate... year YYYY" format scores 2.47 avg in human review.
// Abstract future years have zero emotional weight. Math as punchline ≠ comedy.
const FUTURE_PROJECTION_PATTERNS = [
  /(?:by|in|around|until)\s+(?:the\s+)?year\s+[\d,]+/i,      // "by the year 3,999"
  /\d{4,}\s*AD\b/i,                                            // "2900 AD", "2400 AD"
  /(?:at\s+(?:current|this)\s+(?:rate|pace|run\s*rate)).*\d{4}/i, // "at current rate... 3999"
];

// Engagement dunking — "X likes from Y followers" is an observation, not a joke.
// Using engagement data to expose irony is OK (e.g., mert's "you are being farmed" at 0.3%).
// Dunking on low engagement AS the punchline consistently scores 2.5-3.0.
const ENGAGEMENT_DUNK_PATTERNS = [
  /\d+\s*(?:likes?|retweets?|RTs?)\s+(?:from|out of|on)\s+\d/i, // "57 likes from 43K"
  /posted\s+to\s+an?\s+empty\s+(?:room|void|audience)/i,         // "posted to an empty room"
  /more\s+\w+\s+than\s+(?:likes?|engagement|readers?|views?)\b/i, // "more words than likes"
];

// Concluding punchlines — restate what setup already implies, never score 4.0+.
// NOT included: /ngmi$/ (valid CT closer), /that's not X, that's Y/ (in GENERIC_PATTERNS).
const CONCLUDING_PATTERNS = [
  /and they call this .+$/i,           // "and they call this innovation"
  /that's .+ for you$/i,              // "that's DeFi for you"
  /welcome to .+$/i,                  // "welcome to crypto"
  /and that's .+ in a nutshell$/i,    // "and that's web3 in a nutshell"
];

// Self-deprecating AI openers that never land — human score consistently < 2.5
const SELF_DEPRECATING_FLOPS = [
  /\bi run on (?:€|\$|£)\d/i,
  /\bi cost (?:€|\$|£)\d/i,
  /\bmy inference budget\b/i,
  /\bmy compute costs?\b/i,
];

// Dead/obscure targets — avg human score < 2.0 across sessions, waste of LLM calls.
// Review monthly: remove recovered projects, add newly dead ones.
const TARGET_BLACKLIST = new Set([
  'net protocol',
  'zora',
  'zetachain',
  'manta network',
  'manta',
  'blast',
  'mode network',
  'mode',
  'merlin chain',
  'zklink',
  'linea',
  'scroll',
  'mantle',
]);

/**
 * Count real sentences, ignoring dots inside domain names (pump.fun),
 * decimal numbers (98.6%), dollar amounts ($1.3B), and version strings (v2.1).
 */
export function countSentences(text: string): number {
  const normalized = text
    .replace(/\d+\.\d+/g, (m) => m.replace(/\./g, '\u2024'))
    .replace(/\b[a-z0-9]+(?:\.[a-z0-9]+)+\b/gi, (m) => m.replace(/\./g, '\u2024'));
  return normalized.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
}

export function preFilter(tweetText: string, targetName?: string): PreFilterResult {
  // 0. Blacklisted target — dead/obscure, consistently scores < 2.0
  if (targetName && TARGET_BLACKLIST.has(targetName.toLowerCase())) {
    return { pass: false, reason: `blacklisted target: ${targetName} (consistently low human scores)` };
  }

  // 1. Sentence count > 3 → auto-reject (setup → context → punchline is fine)
  const sentenceCount = countSentences(tweetText);
  if (sentenceCount > 3) {
    return { pass: false, reason: `exceeds 3 sentences (${String(sentenceCount)} found)` };
  }

  // 2. Character count > 220 → auto-reject (human data: >200ch avg 2.59, diminishing returns)
  // Subsumes the old 280ch Twitter limit — anything over 220 is rejected for quality reasons.
  if (tweetText.length > 220) {
    return { pass: false, reason: `too long for impact (${String(tweetText.length)} chars, max 220)` };
  }

  // 3. Generic punchline patterns → auto-reject
  for (const p of GENERIC_PATTERNS) {
    if (p.test(tweetText)) {
      return { pass: false, reason: `generic pattern: ${p.source}` };
    }
  }

  // 4. Telegraphed punchline patterns → auto-reject
  for (const p of TELEGRAPHED_PATTERNS) {
    if (p.test(tweetText)) {
      return { pass: false, reason: `telegraphed pattern: ${p.source}` };
    }
  }

  // 5. Too technical — human reviewers reject legalistic/contract-level detail
  for (const p of TOO_TECHY_PATTERNS) {
    if (p.test(tweetText)) {
      return { pass: false, reason: `too technical for CT audience: ${p.source}` };
    }
  }

  // 6. Self-deprecating AI openers that never land
  for (const p of SELF_DEPRECATING_FLOPS) {
    if (p.test(tweetText)) {
      return { pass: false, reason: `self-deprecating AI flop: ${p.source}` };
    }
  }

  // 7. Temporal projection — "at current rate... year YYYY" (avg 2.47 in human review)
  for (const p of FUTURE_PROJECTION_PATTERNS) {
    if (p.test(tweetText)) {
      return { pass: false, reason: `future year projection: ${p.source}` };
    }
  }

  // 8. Engagement dunking — low likes/RTs as punchline (avg 2.5-3.0 in human review)
  for (const p of ENGAGEMENT_DUNK_PATTERNS) {
    if (p.test(tweetText)) {
      return { pass: false, reason: `engagement dunking: ${p.source}` };
    }
  }

  // 9. Concluding punchline — restates the setup, never lands with humans
  for (const p of CONCLUDING_PATTERNS) {
    if (p.test(tweetText)) {
      return { pass: false, reason: `concluding punchline: ${p.source}` };
    }
  }

  // 10. Truncation detection — catch sentences cut off mid-thought
  // Only flag obvious mid-sentence breaks, not missing final punctuation (CT style)
  const trimmed = tweetText.trim();
  if (/\b(the|a|an|of|in|for|to|and|but|or|with|that|is|was|are|were)\s*$/i.test(trimmed)) {
    return { pass: false, reason: 'truncated: ends mid-sentence on a function word' };
  }

  return { pass: true };
}

// ---------------------------------------------------------------------------
// EvaluateInput / EvaluationOutput
// ---------------------------------------------------------------------------

export interface EvaluateInput {
  id: number | string;
  targetName: string;
  tweetText: string;
  researchNotes: string | null;
}

export interface EvaluationOutput {
  id: number | string;
  compositeScore: number;
  judgeVariance: number;
  evaluations: JudgeEvaluation[];
  verdict: 'stockpile' | 'discard';
  vetoReasons?: string[];
  preFilterReason?: string;
}

// ---------------------------------------------------------------------------
// RoastEvaluator — shared evaluator for farm pipeline and RoastEngine
// ---------------------------------------------------------------------------

export class RoastEvaluator {
  private readonly provider: ProviderManager;
  private readonly logger: Logger;
  private readonly threshold: number;
  private readonly mode: 'quick' | 'serious';

  constructor(opts: {
    provider: ProviderManager;
    logger: Logger;
    threshold?: number;
    mode?: 'quick' | 'serious';
  }) {
    this.provider = opts.provider;
    this.logger = opts.logger;
    this.threshold = opts.threshold ?? 3.5;
    this.mode = opts.mode ?? 'serious';
  }

  async evaluate(input: EvaluateInput): Promise<EvaluationOutput> {
    // Pre-filter: reject before expensive LLM calls
    const preCheck = preFilter(input.tweetText, input.targetName);
    if (!preCheck.pass) {
      this.logger.info(
        { id: input.id, reason: preCheck.reason, target: input.targetName },
        'Pre-filtered: skipping LLM evaluation',
      );
      return {
        id: input.id,
        compositeScore: 0,
        judgeVariance: 0,
        evaluations: [],
        verdict: 'discard',
        preFilterReason: preCheck.reason,
      };
    }

    // Mode: 'quick' uses comedy_writer (closest to human humor judgment);
    // 'serious' uses all 5 judges. Switched from deflation_hawk in M5 —
    // deflation_hawk's "start at 2, round DOWN" bias caused false negatives
    // on roasts humans rated 4.5+ (nikitabier B6, PoodleFi_ C1).
    const allJudges = pickJudges();
    const judges = this.mode === 'quick'
      ? allJudges.filter((j) => j.id === 'comedy_writer')
      : allJudges;

    this.logger.info(
      { id: input.id, mode: this.mode, judges: judges.map((j) => j.id), target: input.targetName },
      'Evaluating roast with judge panel',
    );

    const settled = await Promise.allSettled(
      judges.map((judge) => this.runSingleJudge(judge, input)),
    );

    const results: JudgeEvaluation[] = [];
    for (let i = 0; i < settled.length; i++) {
      const evaluation = settled[i]!;
      const judge = judges[i]!;
      if (evaluation.status === 'fulfilled') {
        results.push({ persona: judge.id, result: evaluation.value });
      } else {
        this.logger.warn(
          { id: input.id, judge: judge.id, err: evaluation.reason },
          'Judge evaluation failed',
        );
      }
    }

    if (results.length === 0) {
      throw new Error(`All judges failed for roast ${String(input.id)}`);
    }

    // Refuse to score below quorum rather than silently downgrading a 5-judge
    // panel to whatever survived — the caller treats this as "not evaluated",
    // which fails closed instead of posting on a 1-judge verdict.
    if (this.mode === 'serious' && results.length < MIN_JUDGE_QUORUM) {
      throw new Error(
        `Judge quorum not met for roast ${String(input.id)}: ${String(results.length)}/${String(judges.length)} judges responded (need ${String(MIN_JUDGE_QUORUM)})`,
      );
    }

    // Weighted composite per judge, then average across judges
    const composites = results.map((r) => calculateWeightedComposite(r.result.scores));
    const avgComposite = composites.reduce((a, b) => a + b, 0) / composites.length;
    const roundedScore = Math.round(avgComposite * 10) / 10;

    // Inter-judge variance (standard deviation of composites)
    const variance = composites.length > 1
      ? Math.sqrt(composites.reduce((sum, c) => sum + (c - avgComposite) ** 2, 0) / composites.length)
      : 0;
    const roundedVariance = Math.round(variance * 100) / 100;

    // Hard vetoes: per-judge safety checks (FACTUAL, ORIGINAL, DEGEN)
    const vetoReasons: string[] = [];
    for (const r of results) {
      const veto = checkHardVetoes(r.result.scores);
      if (veto) vetoReasons.push(`${r.persona}: ${veto}`);
    }

    // FUNNY consensus veto: majority of judges score FUNNY < 2
    const funnyVeto = checkFunnyConsensusVeto(results);
    if (funnyVeto) vetoReasons.push(funnyVeto);

    // Composite consensus veto: strict majority of judges score composite < 3.0.
    // floor(n/2)+1, same as the FUNNY consensus — ceil(n/2) would let 2 of 4
    // surviving judges count as a "majority".
    const lowJudgeCount = composites.filter((c) => Math.round(c * 10) / 10 < 3.0).length;
    const majorityThreshold = Math.floor(results.length / 2) + 1;
    if (lowJudgeCount >= majorityThreshold) {
      vetoReasons.push(`CONSENSUS: ${String(lowJudgeCount)}/${String(results.length)} judges scored < 3.0`);
    }

    const verdict = vetoReasons.length > 0
      ? 'discard'
      : roundedScore >= this.threshold
        ? 'stockpile'
        : 'discard';

    if (vetoReasons.length > 0) {
      this.logger.info(
        { id: input.id, target: input.targetName, vetoReasons },
        'Hard veto triggered',
      );
    }

    this.logger.info(
      {
        id: input.id,
        target: input.targetName,
        compositeScore: roundedScore,
        judgeVariance: roundedVariance,
        verdict,
        judgeScores: results.map((r) => ({
          judge: r.persona,
          weighted: Math.round(calculateWeightedComposite(r.result.scores) * 10) / 10,
          scores: r.result.scores,
        })),
      },
      'Evaluation complete',
    );

    return {
      id: input.id,
      compositeScore: roundedScore,
      judgeVariance: roundedVariance,
      evaluations: results,
      verdict,
      vetoReasons: vetoReasons.length > 0 ? vetoReasons : undefined,
    };
  }

  async evaluateBatch(
    inputs: EvaluateInput[],
    concurrency = 3,
  ): Promise<EvaluationOutput[]> {
    const results: EvaluationOutput[] = [];

    for (let i = 0; i < inputs.length; i += concurrency) {
      const chunk = inputs.slice(i, i + concurrency);
      const chunkResults = await Promise.allSettled(
        chunk.map((input) => this.evaluate(input)),
      );

      for (let j = 0; j < chunkResults.length; j++) {
        const result = chunkResults[j]!;
        const input = chunk[j]!;
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          this.logger.error(
            { id: input.id, err: result.reason },
            'Failed to evaluate roast',
          );
        }
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Batch ranking — 1 LLM call ranks all candidates comparatively
  // -------------------------------------------------------------------------

  /**
   * Rank all candidates in a single LLM call. Returns rankings sorted best→worst.
   * Used by fast pipeline: cheaper and produces better comparative judgments
   * than individual evaluate() calls (judge sees all candidates side-by-side).
   */
  async rankBatch(inputs: RankInput[]): Promise<AgentRankingOutput> {
    if (inputs.length === 0) return { rankings: [] };

    const prompt = buildRankingPrompt(inputs);
    const taskId = `rank-batch-${Date.now()}`;

    this.logger.info(
      { candidateCount: inputs.length },
      'Batch ranking candidates in single call',
    );

    try {
      const result = await this.provider.run<{ text: string }>(taskId, {
        prompt,
        profile: 'farm-evaluate',
        requiresResearch: false,
      });

      const rawText = typeof result.data === 'string'
        ? result.data
        : (result.data as Record<string, unknown>)['text'] as string
          ?? JSON.stringify(result.data);

      const output = parseRankingOutput(rawText, inputs.length);

      this.logger.info(
        { candidateCount: inputs.length, rankedCount: output.rankings.length },
        'Batch ranking complete',
      );

      return output;
    } catch (error) {
      this.logger.error(
        { taskId, err: error, candidateCount: inputs.length },
        `Batch ranking failed: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private async runSingleJudge(
    judge: JudgePersonaConfig,
    input: EvaluateInput,
  ): Promise<EvaluationResult> {
    const prompt = buildEvaluationPrompt(
      judge,
      input.targetName,
      input.tweetText,
      input.researchNotes,
    );

    const taskId = `eval-${String(input.id)}-${judge.id}`;

    try {
      const result = await this.provider.run<{ text: string }>(taskId, {
        prompt,
        profile: 'farm-evaluate',
        requiresResearch: false,
      });

      // Provider returns the raw LLM text — extract JSON from it
      const rawText = typeof result.data === 'string'
        ? result.data
        : (result.data as Record<string, unknown>)['text'] as string
          ?? JSON.stringify(result.data);

      return parseEvaluationOutput(rawText);
    } catch (error) {
      this.logger.error(
        { taskId, judge: judge.id, id: input.id, err: error },
        `Judge ${judge.name} failed: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Batch ranking — prompt + parser for single-call comparative ranking
// ---------------------------------------------------------------------------

export interface RankInput {
  index: number;
  text: string;
  angle: string;
  selfScore: number;
}

function buildRankingPrompt(inputs: RankInput[]): string {
  const candidates = inputs
    .map((c) => `[${String(c.index)}] (${c.angle}, self-score ${String(c.selfScore)})\n"${c.text}"`)
    .join('\n\n');

  return `You are a comedy writer who has written for Wendy's Twitter and SNL Weekend Update. You judge by craft — setup, misdirection, surprise.

You are ranking ${String(inputs.length)} crypto roast candidates. Your job: rank them from best to worst based on which ones would make someone STOP SCROLLING and laugh out loud.

## Candidates

${candidates}

## Scoring Criteria

For each candidate, score 3 dimensions (1-5):

**FUNNY**: Does the setup→punchline genuinely land? Misdirection, surprise, bathos.
- 5: you physically laughed, devastating
- 4: genuinely funny, would screenshot
- 3: solid, competent
- 2: meh, seen this before
- 1: not a joke, just commentary

**IMPACT**: Would someone stop scrolling to read this twice?
- 5: quote-tweet with "absolutely destroyed"
- 4: screenshot and send to group chat
- 3: like and maybe bookmark
- 2: acknowledgment nod
- 1: scroll past

**ORIGINAL**: Has CT seen this take/angle/framing before?
- 5: never seen anything like this
- 4: fresh angle on known target
- 3: decent variation
- 2: template-tier
- 1: copy-paste energy

## Rules
- Score INDEPENDENTLY per dimension, then composite = (FUNNY × 0.5) + (IMPACT × 0.3) + (ORIGINAL × 0.2)
- Self-scores are the LLM's self-rating — ignore them. Judge independently
- Brevity bonus: 1-sentence devastation gets +0.5 to FUNNY
- If the punchline is visible from the setup, cap FUNNY at 3

## Output

Respond with ONLY valid JSON (no markdown, no code fences):
{"rankings":[{"index":N,"score":X.X,"funny":N,"impact":N,"original":N,"reason":"≤15 words why this rank"}]}

Sort by score descending (best first). Include ALL ${String(inputs.length)} candidates.`;
}

function parseRankingOutput(raw: string, expectedCount: number): AgentRankingOutput {
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in ranking output');
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const rankings = parsed['rankings'];

  if (!Array.isArray(rankings)) {
    throw new Error('Missing or invalid rankings array');
  }

  const result: AgentRankingOutput['rankings'] = [];

  for (const entry of rankings) {
    const r = entry as Record<string, unknown>;
    const index = typeof r['index'] === 'number' ? r['index'] : -1;
    const score = typeof r['score'] === 'number' ? Math.round(r['score'] * 10) / 10 : 0;
    const funny = typeof r['funny'] === 'number' ? r['funny'] : 0;
    const impact = typeof r['impact'] === 'number' ? r['impact'] : 0;
    const original = typeof r['original'] === 'number' ? r['original'] : 0;
    const reason = typeof r['reason'] === 'string' ? r['reason'] : '';

    if (index >= 0) {
      result.push({ index, score, funny, impact, original, reason });
    }
  }

  if (result.length === 0) {
    throw new Error(`Ranking returned 0 valid entries (expected ${String(expectedCount)})`);
  }

  // Sort by score descending
  result.sort((a, b) => b.score - a.score);

  return { rankings: result };
}
