import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { AgentRoastOutput } from '@agent/agent.types.js';
import { loadCharacter } from '@roast/character.loader.js';
import type { CharacterConfig } from '@roast/character.loader.js';
import {
  buildRoastPrompt,
  buildAdversarialPrompt,
  PROMPT_STRATEGIES,
} from '@roast/prompt-builder.js';
import type { PromptStrategy } from '@roast/prompt-builder.js';
import { buildCreativeMemory } from '@roast/creative-memory.js';
import { filterRoast } from '@content/content-filter.js';
import type { FarmAttemptRepository } from '@storage/repositories/farm-attempt.repository.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { ExternalExampleRepository } from '@storage/repositories/external-example.repository.js';
import type { RoastPatternRepository } from '@storage/repositories/roast-pattern.repository.js';
import { pickMutations, formatMutationSection } from './mutations.js';
import { classifyFreshness, calculateExpiry } from './freshness.js';
import type { Mutation, InsertFarmAttempt } from './types.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import type { TwitterEnricher } from './twitter-enricher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHARACTER_PATH = resolve(__dirname, '../../characters/beef-bot.json');

export interface BatchGeneratorOptions {
  provider: ProviderManager;
  farmAttempt: FarmAttemptRepository;
  stockpile?: StockpileRepository;
  feedbackRepo?: FeedbackRepository;
  configRepo?: ConfigRepository;
  exampleRepo?: ExternalExampleRepository;
  patternRepo?: RoastPatternRepository;
  twitterEnricher?: TwitterEnricher;
  logger: Logger;
  characterPath?: string;
  variantsPerTarget?: number;
  mutationCount?: number;
}

export interface GenerationResult {
  targetName: string;
  strategies: PromptStrategy[];
  mutations: Mutation[];
  attempts: number;
  filtered: number;
  errors: string[];
}

export class BatchGenerator {
  private readonly provider: ProviderManager;
  private readonly farmAttempt: FarmAttemptRepository;
  private readonly stockpile: StockpileRepository | null;
  private readonly feedbackRepo: FeedbackRepository | undefined;
  private readonly configRepo: ConfigRepository | undefined;
  private readonly exampleRepo: ExternalExampleRepository | undefined;
  private readonly patternRepo: RoastPatternRepository | undefined;
  private readonly twitterEnricher: TwitterEnricher | null;
  private readonly logger: Logger;
  private readonly character: CharacterConfig;
  private readonly variantsPerTarget: number;
  private readonly mutationCount: number;
  /** Cache enrichment results to avoid re-fetching for the same target across strategies */
  private readonly enrichmentCache = new Map<string, string | null>();

  constructor(opts: BatchGeneratorOptions) {
    this.provider = opts.provider;
    this.farmAttempt = opts.farmAttempt;
    this.stockpile = opts.stockpile ?? null;
    this.feedbackRepo = opts.feedbackRepo;
    this.configRepo = opts.configRepo;
    this.exampleRepo = opts.exampleRepo;
    this.patternRepo = opts.patternRepo;
    this.twitterEnricher = opts.twitterEnricher ?? null;
    this.logger = opts.logger;
    this.variantsPerTarget = opts.variantsPerTarget ?? 3;
    this.mutationCount = opts.mutationCount ?? 2;

    const charPath = opts.characterPath ?? DEFAULT_CHARACTER_PATH;
    this.character = loadCharacter(charPath);
  }

  async generateBatch(
    targets: Array<{ name: string; type: string }>,
    concurrency: number = 2,
  ): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];

    for (let i = 0; i < targets.length; i += concurrency) {
      const chunk = targets.slice(i, i + concurrency);
      const chunkResults = await Promise.allSettled(
        chunk.map((target) => this.generateMultiStrategy(target.name, target.type)),
      );

      for (let j = 0; j < chunkResults.length; j++) {
        const result = chunkResults[j]!;
        const target = chunk[j]!;
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          this.logger.error(
            { target: target.name, err: result.reason },
            'Failed to generate for target',
          );
          results.push({
            targetName: target.name,
            strategies: [],
            mutations: [],
            attempts: 0,
            filtered: 0,
            errors: [getErrorMessage(result.reason)],
          });
        }
      }
    }

    return results;
  }

  /**
   * Run all strategies for a single target, each with its own mutations.
   * For Twitter handles (@username), enriches with profile data first.
   * Merges results into one GenerationResult.
   */
  private async generateMultiStrategy(
    targetName: string,
    targetType: string,
  ): Promise<GenerationResult> {
    // Enrich Twitter handles before generation
    const profileContext = await this.enrichTwitterHandle(targetName);

    const strategyResults = await Promise.allSettled(
      PROMPT_STRATEGIES.map((strategy) =>
        this.generateForTarget(targetName, targetType, strategy, profileContext),
      ),
    );

    let totalAttempts = 0;
    let totalFiltered = 0;
    const allMutations: Mutation[] = [];
    const succeededStrategies: PromptStrategy[] = [];
    const errors: string[] = [];

    for (let i = 0; i < strategyResults.length; i++) {
      const result = strategyResults[i]!;
      const strategy = PROMPT_STRATEGIES[i]!;
      if (result.status === 'fulfilled') {
        totalAttempts += result.value.attempts;
        totalFiltered += result.value.filtered;
        allMutations.push(...result.value.mutations);
        succeededStrategies.push(strategy);
        errors.push(...result.value.errors);
      } else {
        this.logger.warn(
          { target: targetName, strategy, err: result.reason },
          'Strategy failed, continuing with others',
        );
        errors.push(`${strategy}: ${getErrorMessage(result.reason)}`);
      }
    }

    return {
      targetName,
      strategies: succeededStrategies,
      mutations: allMutations,
      attempts: totalAttempts,
      filtered: totalFiltered,
      errors,
    };
  }

  private async generateForTarget(
    targetName: string,
    targetType: string,
    strategy: PromptStrategy,
    profileContext?: string | null,
  ): Promise<GenerationResult> {
    const mutations = pickMutations(this.mutationCount);
    const mutationSection = formatMutationSection(mutations);
    const mutationSeed = mutations.map((m) => m.id).join(',') || null;

    this.logger.info(
      { target: targetName, strategy, mutations: mutations.map((m) => m.id) },
      'Generating roasts',
    );

    const basePrompt = this.buildStrategyPrompt(strategy, targetName, profileContext ?? undefined, targetType);
    const prompt = mutationSection
      ? basePrompt + '\n' + mutationSection
      : basePrompt;

    const taskId = `farm-gen-${targetName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;

    const result = await this.provider.run<AgentRoastOutput>(taskId, {
      prompt,
      profile: 'farm-generate',
      requiresResearch: true,
    });

    const output = this.parseOutput(result.data, taskId);
    let storedCount = 0;
    let filteredCount = 0;

    for (const variant of output.variants) {
      const filterResult = filterRoast(variant.text);
      if (!filterResult.passed) {
        filteredCount++;
        this.logger.warn(
          { taskId, target: targetName, text: variant.text, reasons: filterResult.reasons },
          'Variant filtered out',
        );
        continue;
      }

      const freshness = classifyFreshness(variant.text, output.researchNotes);

      const attempt: InsertFarmAttempt = {
        targetName,
        targetType,
        tweetText: variant.text,
        angle: variant.angle,
        strategy,
        mutationSeed: mutationSeed ?? undefined,
        llmSelfScore: variant.score,
        researchNotes: output.researchNotes ?? undefined,
        factCheckPassed: output.factCheckPassed,
        agentOutput: JSON.stringify({ freshness, expiresAt: calculateExpiry(freshness) }),
      };

      this.farmAttempt.insert(attempt);
      storedCount++;
    }

    this.logger.info(
      { target: targetName, strategy, stored: storedCount, filtered: filteredCount },
      'Generation complete for target',
    );

    return {
      targetName,
      strategies: [strategy],
      mutations,
      attempts: storedCount,
      filtered: filteredCount,
      errors: [],
    };
  }

  private buildStrategyPrompt(
    strategy: PromptStrategy,
    targetName: string,
    profileContext?: string,
    targetType?: string,
  ): string {
    let memory = buildCreativeMemory({
      targetName,
      logger: this.logger,
      feedbackRepo: this.feedbackRepo,
      configRepo: this.configRepo,
      exampleRepo: this.exampleRepo,
      patternRepo: this.patternRepo,
      stockpileRepo: this.stockpile ?? undefined,
      farmAttemptRepo: this.farmAttempt,
    });

    // Inject Twitter profile data and target type into creative memory
    const memoryType = targetType === 'person' ? 'person' as const : undefined;
    if (profileContext) {
      if (memory) {
        memory = { ...memory, profileContext, targetType: memoryType };
      } else {
        memory = { fireExamples: [], profileContext, targetType: memoryType };
      }
    } else if (memoryType && memory) {
      memory = { ...memory, targetType: memoryType };
    }

    switch (strategy) {
      case 'rubric':
        return buildRoastPrompt(targetName, this.character, this.variantsPerTarget, memory);
      case 'adversarial':
        return buildAdversarialPrompt(targetName, this.character, this.variantsPerTarget, memory);
    }
  }

  /**
   * Enrich a Twitter handle with profile data before generation.
   * Returns profileContext string or null if not a handle / enricher unavailable.
   */
  private async enrichTwitterHandle(targetName: string): Promise<string | null> {
    if (!targetName.startsWith('@') || !this.twitterEnricher?.isConfigured) {
      return null;
    }

    // Check cache first (avoid re-fetching across strategy runs)
    const cached = this.enrichmentCache.get(targetName);
    if (cached !== undefined) return cached;

    try {
      this.logger.info({ target: targetName }, 'Enriching Twitter handle before generation');
      const result = await this.twitterEnricher.enrich(targetName);

      const profileContext = result?.profileContext ?? null;
      this.enrichmentCache.set(targetName, profileContext);

      if (profileContext) {
        this.logger.info(
          { target: targetName, contextLength: profileContext.length, hasData: result?.hasData },
          'Twitter enrichment complete',
        );
      }

      return profileContext;
    } catch (err) {
      this.logger.warn({ err: getErrorMessage(err), target: targetName }, 'Twitter enrichment failed');
      this.enrichmentCache.set(targetName, null);
      return null;
    }
  }

  private parseOutput(data: unknown, taskId: string): AgentRoastOutput {
    if (typeof data === 'string') {
      try {
        const cleaned = data.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return this.validateOutput(JSON.parse(jsonMatch[0]) as AgentRoastOutput, taskId);
        }
      } catch {
        // fall through
      }
      throw new Error(`Failed to parse generation output for ${taskId}`);
    }

    const obj = data as Record<string, unknown>;
    if (typeof obj['text'] === 'string') {
      return this.parseOutput(obj['text'], taskId);
    }

    return this.validateOutput(data as AgentRoastOutput, taskId);
  }

  private validateOutput(output: AgentRoastOutput, taskId: string): AgentRoastOutput {
    if (!Array.isArray(output.variants) || output.variants.length === 0) {
      throw new Error(`No variants in generation output for ${taskId}`);
    }

    for (const v of output.variants) {
      if (typeof v.text !== 'string' || v.text.length === 0) {
        throw new Error(`Invalid variant text in output for ${taskId}`);
      }
      if (typeof v.score !== 'number') v.score = 0;
      if (typeof v.angle !== 'string') v.angle = 'UNKNOWN';
    }

    return output;
  }
}
