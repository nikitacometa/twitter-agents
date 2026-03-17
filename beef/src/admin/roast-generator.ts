import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { AgentRoastOutput } from '@agent/agent.types.js';
import { RoastEngine } from '@roast/roast-engine.js';

let cachedEngine: RoastEngine | null = null;

function getEngine(provider: ProviderManager, logger: Logger): RoastEngine {
  if (!cachedEngine) {
    cachedEngine = new RoastEngine({ provider, logger });
  }
  return cachedEngine;
}

export async function generateRoasts(
  targetName: string,
  provider: ProviderManager,
  logger: Logger,
): Promise<AgentRoastOutput> {
  const engine = getEngine(provider, logger);
  const result = await engine.generateRoast(targetName, 'telegram');

  // Map RoastResult back to AgentRoastOutput for backward compat with bot.ts
  return {
    variants: result.draft.variants,
    bestIndex: result.draft.bestIndex,
    researchNotes: result.draft.researchNotes,
    factCheckPassed: result.draft.factCheckPassed,
  };
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
