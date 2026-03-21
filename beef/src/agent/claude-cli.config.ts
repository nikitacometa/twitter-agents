/**
 * Claude CLI subprocess configuration.
 *
 * Controls model, effort, tools, and turns for each task type.
 * Optimized for quality (Opus) where it matters, Sonnet for utility tasks.
 *
 * Runtime override:
 *   import { cliConfig } from './claude-cli.config.js';
 *   cliConfig.presets['roast-research'].model = 'sonnet';  // downgrade for speed
 *   cliConfig.presets['roast-research'].effort = 'medium';
 */

import type { TaskProfile } from './agent.types.js';

export type EffortLevel = 'low' | 'medium' | 'high' | 'max';
export type ModelAlias = 'opus' | 'sonnet' | 'haiku';

export interface TaskPreset {
  model: ModelAlias;
  effort: EffortLevel;
  tools: string[];
  maxTurns: number;
  timeoutMs: number;
  fallbackModel?: ModelAlias;
}

// --- Tool sets ---

const RESEARCH_TOOLS = [
  'mcp__perplexity-ask__perplexity_ask',
  'WebSearch',
  'WebFetch',
  'Bash(curl *)',
];

const WEB_TOOLS = ['WebSearch', 'WebFetch', 'Bash(curl *)'];

// --- Task presets ---
//
// | Profile          | Model  | Effort | Tools           | Turns | Timeout | Rationale                                |
// |------------------|--------|--------|-----------------|-------|---------|------------------------------------------|
// | roast-research   | sonnet | medium | Perplexity+Web  | 10    | 180s    | Research + generate — measured ~134s      |
// | roast-power      | opus   | high   | Perplexity+Web  | 15    | 600s    | Premium Opus roast — no fallback          |
// | roast-quick      | sonnet | low    | none            | 1     | 90s     | No-research fallback — measured ~38s      |
// | reply            | sonnet | low    | none            | 1     | 30s     | Quick reply — speed matters most          |
// | discovery        | sonnet | medium | Web+curl        | 10    | 120s    | Target finding — structured, not creative |
// | verify           | sonnet | medium | Web             | 5     | 60s     | Fact-check — straightforward lookup       |
// | audit            | sonnet | low    | none            | 1     | 30s     | Analytics — no research needed            |
// | example-parse    | sonnet | high   | Read            | 3     | 120s    | Parse + analyze roast examples (images)   |

const DEFAULT_PRESETS: Record<TaskProfile, TaskPreset> = {
  'roast-research': {
    model: 'sonnet',
    effort: 'medium',
    tools: RESEARCH_TOOLS,
    maxTurns: 10,
    timeoutMs: 180_000,
    fallbackModel: 'haiku',
  },
  'roast-power': {
    model: 'opus',
    effort: 'high',
    tools: RESEARCH_TOOLS,
    maxTurns: 15,
    timeoutMs: 1_800_000,
  },
  'roast-quick': {
    model: 'sonnet',
    effort: 'low',
    tools: [],
    maxTurns: 1,
    timeoutMs: 90_000,
    fallbackModel: 'haiku',
  },
  reply: {
    model: 'sonnet',
    effort: 'low',
    tools: [],
    maxTurns: 1,
    timeoutMs: 30_000,
    fallbackModel: 'haiku',
  },
  discovery: {
    model: 'sonnet',
    effort: 'medium',
    tools: WEB_TOOLS,
    maxTurns: 10,
    timeoutMs: 120_000,
    fallbackModel: 'haiku',
  },
  verify: {
    model: 'sonnet',
    effort: 'medium',
    tools: WEB_TOOLS,
    maxTurns: 5,
    timeoutMs: 60_000,
    fallbackModel: 'haiku',
  },
  audit: {
    model: 'sonnet',
    effort: 'low',
    tools: [],
    maxTurns: 1,
    timeoutMs: 30_000,
  },
  'example-parse': {
    model: 'sonnet',
    effort: 'high',
    tools: ['Read'],
    maxTurns: 3,
    timeoutMs: 120_000,
  },
  'farm-evaluate': {
    model: 'opus',
    effort: 'medium',
    tools: [],
    maxTurns: 1,
    timeoutMs: 300_000,
  },
  'farm-generate': {
    model: 'opus',
    effort: 'high',
    tools: RESEARCH_TOOLS,
    maxTurns: 15,
    timeoutMs: 1_800_000,
  },
  'farm-discover': {
    model: 'sonnet',
    effort: 'medium',
    tools: RESEARCH_TOOLS,
    maxTurns: 5,
    timeoutMs: 120_000,
    fallbackModel: 'haiku',
  },
};

// --- Environment for all CLI subprocesses ---
// Disables features unnecessary in headless production.
// Does NOT affect quality — roast instructions live in the prompt, not in CLAUDE.md.

const DEFAULT_CLI_ENV: Record<string, string> = {
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
  CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS: '1',
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
};

// --- Runtime config (mutable) ---

export const cliConfig = {
  presets: structuredClone(DEFAULT_PRESETS),
  env: { ...DEFAULT_CLI_ENV },

  reset(): void {
    this.presets = structuredClone(DEFAULT_PRESETS);
    this.env = { ...DEFAULT_CLI_ENV };
  },
};

export function getPreset(profile: TaskProfile): TaskPreset {
  return cliConfig.presets[profile];
}
