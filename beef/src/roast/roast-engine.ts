import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type {
  AgentRoastOutput,
  AgentReplyOutput,
  AgentFastResearchOutput,
  AgentRankingOutput,
  TaskProfile,
} from '@agent/agent.types.js';
import type { RoastDraft, RoastVariant, CreativeMemory } from '@common/types/index.js';
import { loadCharacter } from './character.loader.js';
import type { CharacterConfig } from './character.loader.js';
import {
  buildRoastPrompt,
  buildNoResearchPrompt,
  buildCasualReplyPrompt,
  PROMPT_STRATEGIES,
  buildFastResearchPrompt,
  buildFastGenPrompt,
  FAST_CALL_CONFIGS,
  distributeFastAngles,
} from './prompt-builder.js';
import type { PromptStrategy } from './prompt-builder.js';
import { filterRoast } from '@content/content-filter.js';
import { RoastEvaluator, preFilter } from '@evaluation/evaluator.js';
import type { EvaluationOutput, RankInput } from '@evaluation/evaluator.js';
import { pickMutations, formatMutationSection } from '../farm/mutations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHARACTER_PATH = resolve(__dirname, '../../characters/beef-bot.json');

export type EvaluationMode = 'quick' | 'serious' | 'none';

export interface RoastEngineOptions {
  provider: ProviderManager;
  logger: Logger;
  characterPath?: string;
  variantCount?: number;
  evaluationMode?: EvaluationMode;
  evaluationThreshold?: number;
  /** Separate provider for evaluation (judge panel). Falls back to main provider if unset. */
  evaluationProvider?: ProviderManager;
}

export interface RoastResult {
  draft: RoastDraft;
  filtered: RoastVariant[];
  durationMs: number;
  provider: string;
  evaluation?: EvaluationOutput;
  diaryThought?: string;
}

export interface CasualReplyResult {
  text: string;
  tone: string;
  mentionsBeef: boolean;
  durationMs: number;
  provider: string;
  diaryThought?: string;
}

export interface FastRoastResult {
  variants: Array<{
    text: string;
    angle: string;
    selfScore: number;
    judgeScore: number;
    funny: number;
    impact: number;
    original: number;
    reason: string;
    callCodename: string;
  }>;
  researchNotes: string | null;
  stats: {
    generated: number;
    passedFilter: number;
    afterDedup: number;
    ranked: number;
    durationMs: number;
    callResults: Array<{ codename: string; status: 'ok' | 'failed'; variants: number }>;
  };
  diaryThought?: string;
}

export class RoastEngine {
  private readonly provider: ProviderManager;
  private readonly logger: Logger;
  private readonly character: CharacterConfig;
  private readonly variantCount: number;
  private readonly evaluationMode: EvaluationMode;
  private readonly evaluator: RoastEvaluator | null;

  constructor(opts: RoastEngineOptions) {
    this.provider = opts.provider;
    this.logger = opts.logger;
    this.variantCount = opts.variantCount ?? 3;
    this.evaluationMode = opts.evaluationMode ?? 'none';

    if (this.evaluationMode !== 'none') {
      this.evaluator = new RoastEvaluator({
        provider: opts.evaluationProvider ?? opts.provider,
        logger: opts.logger,
        threshold: opts.evaluationThreshold,
        mode: this.evaluationMode,
      });
    } else {
      this.evaluator = null;
    }

    const charPath = opts.characterPath ?? DEFAULT_CHARACTER_PATH;
    this.character = loadCharacter(charPath);
    this.logger.info(
      { character: this.character.meta.name, version: this.character.version, evaluationMode: this.evaluationMode },
      'Character loaded',
    );
  }

  get characterConfig(): CharacterConfig {
    return this.character;
  }

  async generateRoast(
    targetName: string,
    source: string = 'engine',
    memory?: CreativeMemory,
    profile?: TaskProfile,
    variantCountOverride?: number,
    imagePaths?: string[],
    mutationCount?: number,
  ): Promise<RoastResult> {
    const taskId = `roast-${source}-${Date.now()}`;
    const effectiveProfile = profile ?? 'roast-research';
    const effectiveVariantCount = variantCountOverride ?? this.variantCount;
    this.logger.info(
      { taskId, target: targetName, profile: effectiveProfile, images: imagePaths?.length ?? 0 },
      'Starting roast generation',
    );

    // Unified strategy: single prompt with integrated SLOP diagnosis + analytical CoT
    const strategyResults = await this.runMultiStrategy(
      taskId, targetName, effectiveProfile, effectiveVariantCount, memory, imagePaths, mutationCount,
    );

    let allVariants = strategyResults.variants;
    let researchNotes = strategyResults.researchNotes;
    let factCheckPassed = strategyResults.factCheckPassed;

    // If all strategies failed, try no-research fallback as last resort
    if (allVariants.length === 0) {
      // In degraded mode (no Perplexity), strategies already used no-research prompts,
      // so a second no-research attempt is unlikely to help — throw the original error
      if (!this.provider.capabilities.hasPerplexity) {
        throw strategyResults.error instanceof Error
          ? strategyResults.error
          : new Error('All prompt strategies failed in degraded mode');
      }
      this.logger.warn({ taskId }, 'All strategies failed, trying no-research fallback');
      const fallbackPrompt = buildNoResearchPrompt(targetName, this.character, effectiveVariantCount, memory, imagePaths);
      const fallback = await this.provider.run<AgentRoastOutput>(taskId, {
        prompt: fallbackPrompt,
        profile: 'roast-quick',
        requiresResearch: false,
        imagePaths,
      });
      const parsed = this.parseOutput(fallback.data, taskId);
      this.validateOutput(parsed, taskId);
      allVariants = [...parsed.variants];
      researchNotes = parsed.researchNotes;
      factCheckPassed = parsed.factCheckPassed;
    }

    // Content filter
    const filtered: RoastVariant[] = [];
    const passed: RoastVariant[] = [];

    for (const variant of allVariants) {
      const filterResult = filterRoast(variant.text);
      if (filterResult.passed) {
        passed.push(variant);
      } else {
        filtered.push(variant);
        this.logger.warn(
          { taskId, text: variant.text, reasons: filterResult.reasons },
          'Variant filtered out',
        );
      }
    }

    if (passed.length === 0) {
      throw new Error(`All ${String(allVariants.length)} variants filtered out for "${targetName}"`);
    }

    // Evaluate and rank variants
    let bestEvaluation: EvaluationOutput | undefined;

    if (this.evaluator && passed.length > 0) {
      // Run judge-based evaluation on best candidate (pre-sorted by self-score)
      passed.sort((a, b) => b.score - a.score);
      const bestCandidate = passed[0]!;

      try {
        bestEvaluation = await this.evaluator.evaluate({
          id: taskId,
          targetName,
          tweetText: bestCandidate.text,
          researchNotes,
        });

        this.logger.info(
          {
            taskId,
            target: targetName,
            mode: this.evaluationMode,
            compositeScore: bestEvaluation.compositeScore,
            verdict: bestEvaluation.verdict,
            vetoReasons: bestEvaluation.vetoReasons,
          },
          'Judge evaluation complete for best variant',
        );

        // If best variant was vetoed, try evaluating remaining variants
        if (bestEvaluation.verdict === 'discard' && passed.length > 1) {
          for (let i = 1; i < passed.length; i++) {
            const candidate = passed[i]!;
            try {
              const evalResult = await this.evaluator.evaluate({
                id: `${taskId}-alt-${String(i)}`,
                targetName,
                tweetText: candidate.text,
                researchNotes,
              });

              if (evalResult.verdict === 'stockpile') {
                // Swap: promote this variant to position 0
                passed.splice(i, 1);
                passed.unshift(candidate);
                bestEvaluation = evalResult;
                this.logger.info(
                  { taskId, target: targetName, promotedIndex: i, compositeScore: evalResult.compositeScore },
                  'Promoted alternative variant after veto',
                );
                break;
              }
            } catch (evalError) {
              this.logger.warn(
                { taskId, variantIndex: i, err: evalError },
                'Alternative variant evaluation failed',
              );
            }
          }
        }
      } catch (evalError) {
        this.logger.warn(
          { taskId, target: targetName, err: evalError },
          'Judge evaluation failed, falling back to self-score ranking',
        );
      }
    } else {
      // No evaluator — fall back to LLM self-score ranking
      passed.sort((a, b) => b.score - a.score);
    }

    const draft: RoastDraft = {
      target: { name: targetName, type: 'project' },
      variants: passed,
      bestIndex: 0,
      researchNotes,
      factCheckPassed,
    };

    this.logger.info(
      {
        taskId,
        target: targetName,
        totalVariants: allVariants.length,
        passed: passed.length,
        filtered: filtered.length,
        bestScore: passed[0]?.score,
        evaluationScore: bestEvaluation?.compositeScore,
        evaluationVerdict: bestEvaluation?.verdict,
        durationMs: strategyResults.durationMs,
        provider: strategyResults.provider,
        strategies: strategyResults.strategiesSucceeded,
      },
      'Multi-strategy roast generation complete',
    );

    return {
      draft,
      filtered,
      durationMs: strategyResults.durationMs,
      provider: strategyResults.provider,
      evaluation: bestEvaluation,
      diaryThought: strategyResults.diaryThought,
    };
  }

  // -------------------------------------------------------------------------
  // Fast pipeline — volume + selection: 5 parallel Sonnet calls → rank → top 3
  // -------------------------------------------------------------------------

  async generateRoastFast(
    targetName: string,
    source: string = 'fast',
    memory?: CreativeMemory,
    imagePaths?: string[],
    tweetMode = false,
  ): Promise<FastRoastResult> {
    const taskId = `fast-${source}-${Date.now()}`;
    const startMs = Date.now();

    this.logger.info(
      { taskId, target: targetName, tweetMode, images: imagePaths?.length ?? 0 },
      'Starting fast roast pipeline',
    );

    // --- Phase 1: Research + Gen Call 0 in parallel ---
    const useResearch = this.provider.capabilities.hasPerplexity || this.provider.capabilities.hasWebSearch;

    const angleDistribution = distributeFastAngles(FAST_CALL_CONFIGS.length, undefined, tweetMode);
    const variantsPerCall = 5;

    // Inject tweetMode into memory so prompt builder picks it up
    const effectiveMemory: CreativeMemory | undefined = tweetMode
      ? { fireExamples: [], ...memory, tweetMode: true }
      : memory;

    let researchNotes: string | null = null;
    let diaryThought: string | undefined;

    // Start Gen Call 0 (Surgeon) immediately with no research
    const call0Config = FAST_CALL_CONFIGS[0]!;
    const call0Prompt = buildFastGenPrompt(
      targetName,
      this.character,
      variantsPerCall,
      0,
      angleDistribution[0]!,
      null,
      effectiveMemory,
      imagePaths,
    );

    const call0Promise = this.provider.run<AgentRoastOutput>(
      `${taskId}-gen-0-${call0Config.codename}`,
      { prompt: call0Prompt, profile: 'roast-fast-gen', requiresResearch: false, imagePaths },
    );

    // Start research in parallel (if available)
    if (useResearch) {
      const researchPrompt = buildFastResearchPrompt(targetName, this.character, memory);
      try {
        const researchResult = await this.provider.run<AgentFastResearchOutput>(
          `${taskId}-research`,
          { prompt: researchPrompt, profile: 'roast-fast-research', requiresResearch: true },
        );
        const data = this.parseFastResearchOutput(researchResult.data, taskId);
        researchNotes = data.researchNotes;
        this.logger.info(
          { taskId, keyFindings: data.keyFindings.length, quotableAmmo: data.quotableAmmo.length },
          'Fast research complete',
        );
      } catch (err) {
        this.logger.warn({ taskId, err }, 'Fast research failed, continuing without');
      }
    }

    // --- Phase 2: Remaining gen calls (1-4) with research notes ---
    const remainingPromises = FAST_CALL_CONFIGS.slice(1).map((config, i) => {
      const callIndex = i + 1;
      const prompt = buildFastGenPrompt(
        targetName,
        this.character,
        variantsPerCall,
        callIndex,
        angleDistribution[callIndex]!,
        researchNotes,
        effectiveMemory,
        imagePaths,
      );

      return this.provider.run<AgentRoastOutput>(
        `${taskId}-gen-${String(callIndex)}-${config.codename}`,
        { prompt, profile: 'roast-fast-gen', requiresResearch: false, imagePaths },
      );
    });

    // Wait for all generation calls (including call 0)
    const allSettled = await Promise.allSettled([call0Promise, ...remainingPromises]);

    // --- Collect variants from all calls ---
    interface TaggedVariant {
      text: string;
      angle: string;
      selfScore: number;
      callCodename: string;
    }

    const allVariants: TaggedVariant[] = [];
    const callResults: FastRoastResult['stats']['callResults'] = [];

    for (let i = 0; i < allSettled.length; i++) {
      const result = allSettled[i]!;
      const config = FAST_CALL_CONFIGS[i]!;

      if (result.status === 'fulfilled') {
        try {
          const parsed = this.parseOutput(result.value.data, `${taskId}-gen-${String(i)}`);
          this.validateOutput(parsed, `${taskId}-gen-${String(i)}`);

          for (const v of parsed.variants) {
            allVariants.push({
              text: v.text,
              angle: v.angle,
              selfScore: v.score,
              callCodename: config.codename,
            });
          }

          if (parsed.diaryThought && !diaryThought) {
            diaryThought = parsed.diaryThought.slice(0, 160);
          }

          callResults.push({ codename: config.codename, status: 'ok', variants: parsed.variants.length });
          this.logger.info(
            { taskId, call: config.codename, variants: parsed.variants.length },
            'Gen call completed',
          );
        } catch (parseErr) {
          callResults.push({ codename: config.codename, status: 'failed', variants: 0 });
          this.logger.warn({ taskId, call: config.codename, err: parseErr }, 'Gen call parse failed');
        }
      } else {
        callResults.push({ codename: config.codename, status: 'failed', variants: 0 });
        this.logger.warn({ taskId, call: config.codename, err: result.reason }, 'Gen call failed');
      }
    }

    const generated = allVariants.length;
    this.logger.info({ taskId, generated, calls: callResults }, 'All gen calls settled');

    if (generated === 0) {
      throw new Error(`All fast gen calls failed for "${targetName}"`);
    }

    // --- Phase 2.5: Content filter + pre-filter + dedup ---
    const filtered: TaggedVariant[] = [];
    for (const v of allVariants) {
      const contentResult = filterRoast(v.text);
      if (!contentResult.passed) {
        this.logger.debug({ text: v.text, reasons: contentResult.reasons }, 'Content filter reject');
        continue;
      }
      const preResult = preFilter(v.text, targetName);
      if (!preResult.pass) {
        this.logger.debug({ text: v.text, reason: preResult.reason }, 'Pre-filter reject');
        continue;
      }
      filtered.push(v);
    }

    const passedFilter = filtered.length;

    if (passedFilter === 0) {
      throw new Error(`All ${String(generated)} fast variants filtered out for "${targetName}"`);
    }

    // Similarity dedup: Jaccard bigram similarity, keep higher self-score
    filtered.sort((a, b) => b.selfScore - a.selfScore);
    const deduped = jaccardDedup(filtered, 0.6);
    const afterDedup = deduped.length;

    this.logger.info(
      { taskId, passedFilter, afterDedup },
      'Filter + dedup complete',
    );

    // --- Phase 3: Batch ranking ---
    const rankInputs: RankInput[] = deduped.map((v, idx) => ({
      index: idx,
      text: v.text,
      angle: v.angle,
      selfScore: v.selfScore,
    }));

    const fastEvaluator = new RoastEvaluator({
      provider: this.provider,
      logger: this.logger,
      mode: 'quick',
    });

    let rankingOutput: AgentRankingOutput;
    try {
      rankingOutput = await fastEvaluator.rankBatch(rankInputs);
    } catch (err) {
      this.logger.warn({ taskId, err }, 'Batch ranking failed, falling back to self-score order');
      // Fallback: use self-scores
      rankingOutput = {
        rankings: deduped.map((v, idx) => ({
          index: idx,
          score: v.selfScore,
          funny: 0,
          impact: 0,
          original: 0,
          reason: 'self-score fallback',
        })),
      };
    }

    // Map rankings back to variants
    const rankedVariants: FastRoastResult['variants'] = [];
    for (const r of rankingOutput.rankings) {
      const v = deduped[r.index];
      if (!v) continue;
      rankedVariants.push({
        text: v.text,
        angle: v.angle,
        selfScore: v.selfScore,
        judgeScore: r.score,
        funny: r.funny,
        impact: r.impact,
        original: r.original,
        reason: r.reason,
        callCodename: v.callCodename,
      });
    }

    const durationMs = Date.now() - startMs;

    this.logger.info(
      {
        taskId,
        target: targetName,
        generated,
        passedFilter,
        afterDedup,
        ranked: rankedVariants.length,
        top3: rankedVariants.slice(0, 3).map((v) => ({ score: v.judgeScore, angle: v.angle, call: v.callCodename })),
        durationMs,
      },
      'Fast roast pipeline complete',
    );

    return {
      variants: rankedVariants,
      researchNotes,
      stats: {
        generated,
        passedFilter,
        afterDedup,
        ranked: rankedVariants.length,
        durationMs,
        callResults,
      },
      diaryThought,
    };
  }

  private parseFastResearchOutput(data: unknown, taskId: string): AgentFastResearchOutput {
    if (typeof data === 'string') {
      const cleaned = data.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AgentFastResearchOutput;
      }
      throw new Error(`[${taskId}] Failed to parse fast research output as JSON`);
    }
    const obj = data as Record<string, unknown>;
    if (typeof obj['text'] === 'string') {
      return this.parseFastResearchOutput(obj['text'], taskId);
    }
    return data as AgentFastResearchOutput;
  }

  async generateCasualReply(
    triggerText: string,
    authorUsername: string,
    profileContext?: string,
  ): Promise<CasualReplyResult> {
    const taskId = `casual-${authorUsername}-${Date.now()}`;
    this.logger.info({ taskId, author: authorUsername }, 'Generating casual reply');

    const prompt = buildCasualReplyPrompt(
      this.character,
      triggerText,
      authorUsername,
      profileContext,
    );

    const result = await this.provider.run<AgentReplyOutput>(taskId, {
      prompt,
      profile: 'reply',
      requiresResearch: false,
    });

    const data = this.parseCasualReplyOutput(result.data, taskId);

    if (data.text.length > 280) {
      this.logger.warn({ taskId, len: data.text.length }, 'Casual reply too long, truncating');
      data.text = data.text.slice(0, 277) + '...';
    }

    this.logger.info(
      { taskId, author: authorUsername, tone: data.tone, len: data.text.length, durationMs: result.durationMs },
      'Casual reply generated',
    );

    return {
      text: data.text,
      tone: data.tone,
      mentionsBeef: data.mentionsBeef,
      durationMs: result.durationMs,
      provider: result.provider,
      diaryThought: data.diaryThought,
    };
  }

  private parseCasualReplyOutput(data: unknown, taskId: string): AgentReplyOutput {
    if (typeof data === 'string') {
      const cleaned = data.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AgentReplyOutput;
      }
      throw new Error(`[${taskId}] Failed to parse casual reply output as JSON`);
    }

    const obj = data as Record<string, unknown>;
    if (typeof obj['text'] === 'string' && typeof obj['tone'] === 'string') {
      return {
        text: obj['text'],
        tone: obj['tone'],
        mentionsBeef: (obj['mentionsBeef'] as boolean) ?? false,
        diaryThought: typeof obj['diaryThought'] === 'string' && obj['diaryThought'].length > 0
          ? obj['diaryThought'].slice(0, 160) : undefined,
      };
    }

    throw new Error(`[${taskId}] Invalid casual reply output structure`);
  }

  private buildStrategyPrompt(
    _strategy: PromptStrategy,
    targetName: string,
    variantCount: number,
    research: boolean,
    memory?: CreativeMemory,
    imagePaths?: string[],
  ): string {
    // Unified strategy uses the same prompt builder (SLOP diagnosis is integrated)
    if (research) {
      return buildRoastPrompt(targetName, this.character, variantCount, memory, imagePaths);
    }
    return buildNoResearchPrompt(targetName, this.character, variantCount, memory, imagePaths);
  }

  private async runMultiStrategy(
    taskId: string,
    targetName: string,
    profile: TaskProfile,
    variantCount: number,
    memory?: CreativeMemory,
    imagePaths?: string[],
    mutationCount?: number,
  ): Promise<{
    variants: Array<{ text: string; score: number; angle: string }>;
    researchNotes: string | null;
    factCheckPassed: boolean;
    diaryThought?: string;
    durationMs: number;
    provider: string;
    strategiesSucceeded: PromptStrategy[];
    error?: unknown;
  }> {
    const useResearch = this.provider.capabilities.hasPerplexity || this.provider.capabilities.hasWebSearch;
    const effectiveProfile = useResearch ? profile : 'roast-quick';

    const strategyPrompts = PROMPT_STRATEGIES.map((strategy) => {
      const mutations = mutationCount && mutationCount > 0 ? pickMutations(mutationCount) : [];
      const mutationSection = formatMutationSection(mutations);
      const base = this.buildStrategyPrompt(strategy, targetName, variantCount, useResearch, memory, imagePaths);
      return {
        strategy,
        prompt: mutationSection ? base + '\n' + mutationSection : base,
      };
    });

    this.logger.info(
      { taskId, strategies: PROMPT_STRATEGIES, variantsPerStrategy: variantCount, useResearch },
      'Running multi-strategy generation',
    );

    const results = await Promise.allSettled(
      strategyPrompts.map(({ strategy, prompt }) =>
        this.provider.run<AgentRoastOutput>(`${taskId}-${strategy}`, {
          prompt,
          profile: effectiveProfile,
          requiresResearch: useResearch,
          imagePaths,
        }),
      ),
    );

    const allVariants: Array<{ text: string; score: number; angle: string }> = [];
    let researchNotes: string | null = null;
    let factCheckPassed = true;
    let diaryThought: string | undefined;
    let maxDurationMs = 0;
    let lastProvider = '';
    const strategiesSucceeded: PromptStrategy[] = [];
    let firstError: unknown;

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const strategy = strategyPrompts[i]!.strategy;

      if (result.status === 'fulfilled') {
        try {
          const data = this.parseOutput(result.value.data, `${taskId}-${strategy}`);
          this.validateOutput(data, `${taskId}-${strategy}`);
          allVariants.push(...data.variants);
          if (data.researchNotes && !researchNotes) researchNotes = data.researchNotes;
          if (typeof data.diaryThought === 'string' && data.diaryThought && !diaryThought) diaryThought = data.diaryThought.slice(0, 160);
          if (!data.factCheckPassed) factCheckPassed = false;
          lastProvider = result.value.provider;
          maxDurationMs = Math.max(maxDurationMs, result.value.durationMs);
          strategiesSucceeded.push(strategy);
          this.logger.info(
            { taskId, strategy, variants: data.variants.length },
            'Prompt strategy completed',
          );
        } catch (validationError) {
          if (!firstError) firstError = validationError;
          this.logger.warn(
            { taskId, strategy, err: validationError },
            'Strategy output validation failed',
          );
        }
      } else {
        if (!firstError) firstError = result.reason;
        this.logger.warn({ taskId, strategy, err: result.reason }, 'Prompt strategy failed');
      }
    }

    return {
      variants: allVariants,
      researchNotes,
      factCheckPassed,
      diaryThought,
      durationMs: maxDurationMs,
      provider: lastProvider,
      strategiesSucceeded,
      error: firstError,
    };
  }

  private parseOutput(data: unknown, taskId: string): AgentRoastOutput {
    if (typeof data === 'string') {
      const cleaned = data.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AgentRoastOutput;
      }
      throw new Error(`[${taskId}] Failed to parse string output as JSON`);
    }

    const obj = data as Record<string, unknown>;
    if (typeof obj['text'] === 'string') {
      return this.parseOutput(obj['text'], taskId);
    }

    return data as AgentRoastOutput;
  }

  private validateOutput(data: AgentRoastOutput, taskId: string): void {
    if (!Array.isArray(data.variants) || data.variants.length === 0) {
      throw new Error(`[${taskId}] LLM returned no variants`);
    }

    for (let i = 0; i < data.variants.length; i++) {
      const v = data.variants[i]!;
      if (!v.text || typeof v.text !== 'string') {
        throw new Error(`[${taskId}] Variant ${String(i)} missing text`);
      }
      if (typeof v.score !== 'number') {
        v.score = 0;
      }
      if (!v.angle || typeof v.angle !== 'string') {
        v.angle = 'UNKNOWN';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Jaccard bigram dedup — removes near-duplicate variants
// ---------------------------------------------------------------------------

function getBigrams(text: string): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]!} ${words[i + 1]!}`);
  }
  return bigrams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Remove variants that are >threshold similar to a higher-scored variant.
 * Input must be pre-sorted by selfScore descending.
 */
function jaccardDedup<T extends { text: string }>(variants: T[], threshold: number): T[] {
  const kept: T[] = [];
  const keptBigrams: Set<string>[] = [];

  for (const v of variants) {
    const bigrams = getBigrams(v.text);
    let isDuplicate = false;

    for (const existingBigrams of keptBigrams) {
      if (jaccardSimilarity(bigrams, existingBigrams) > threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      kept.push(v);
      keptBigrams.push(bigrams);
    }
  }

  return kept;
}
