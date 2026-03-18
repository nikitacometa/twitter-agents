import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { AgentRoastOutput } from '@agent/agent.types.js';
import type { RoastDraft, RoastVariant, CreativeMemory } from '@common/types/index.js';
import { loadCharacter } from './character.loader.js';
import type { CharacterConfig } from './character.loader.js';
import { buildRoastPrompt, buildNoResearchPrompt } from './prompt-builder.js';
import { filterRoast } from '@content/content-filter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHARACTER_PATH = resolve(__dirname, '../../characters/beef-bot.json');

export interface RoastEngineOptions {
  provider: ProviderManager;
  logger: Logger;
  characterPath?: string;
  variantCount?: number;
}

export interface RoastResult {
  draft: RoastDraft;
  filtered: RoastVariant[];
  durationMs: number;
  provider: string;
}

export class RoastEngine {
  private readonly provider: ProviderManager;
  private readonly logger: Logger;
  private readonly character: CharacterConfig;
  private readonly variantCount: number;

  constructor(opts: RoastEngineOptions) {
    this.provider = opts.provider;
    this.logger = opts.logger;
    this.variantCount = opts.variantCount ?? 3;

    const charPath = opts.characterPath ?? DEFAULT_CHARACTER_PATH;
    this.character = loadCharacter(charPath);
    this.logger.info({ character: this.character.meta.name, version: this.character.version }, 'Character loaded');
  }

  get characterConfig(): CharacterConfig {
    return this.character;
  }

  async generateRoast(
    targetName: string,
    source: string = 'engine',
    memory?: CreativeMemory,
  ): Promise<RoastResult> {
    const taskId = `roast-${source}-${Date.now()}`;
    this.logger.info({ taskId, target: targetName }, 'Starting roast generation');

    const prompt = buildRoastPrompt(targetName, this.character, this.variantCount, memory);

    let result;
    try {
      result = await this.provider.run<AgentRoastOutput>(taskId, {
        prompt,
        profile: 'roast-research',
        requiresResearch: true,
      });
    } catch (error) {
      this.logger.warn(
        { taskId, err: error },
        'Research-mode generation failed, trying no-research fallback',
      );
      const fallbackPrompt = buildNoResearchPrompt(targetName, this.character, this.variantCount, memory);
      result = await this.provider.run<AgentRoastOutput>(taskId, {
        prompt: fallbackPrompt,
        profile: 'roast-quick',
        requiresResearch: false,
      });
    }

    const data = result.data;
    this.validateOutput(data, taskId);

    // Content filter
    const filtered: RoastVariant[] = [];
    const passed: RoastVariant[] = [];

    for (const variant of data.variants) {
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
      throw new Error(`All ${String(data.variants.length)} variants filtered out for "${targetName}"`);
    }

    // Rank by score descending
    passed.sort((a, b) => b.score - a.score);

    const bestIndex = data.variants.indexOf(passed[0]!);
    const draft: RoastDraft = {
      target: { name: targetName, type: 'project' },
      variants: passed,
      bestIndex: bestIndex >= 0 ? 0 : 0,
      researchNotes: data.researchNotes,
      factCheckPassed: data.factCheckPassed,
    };

    this.logger.info(
      {
        taskId,
        target: targetName,
        total: data.variants.length,
        passed: passed.length,
        filtered: filtered.length,
        bestScore: passed[0]?.score,
        durationMs: result.durationMs,
        provider: result.provider,
      },
      'Roast generation complete',
    );

    return {
      draft,
      filtered,
      durationMs: result.durationMs,
      provider: result.provider,
    };
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
