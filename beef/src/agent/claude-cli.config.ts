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
// | Profile          | Model  | Effort | Tools           | Turns | Rationale                                |
// |------------------|--------|--------|-----------------|-------|------------------------------------------|
// | roast-research   | opus   | high   | Perplexity+Web  | 25    | Core product — max quality + deep research |
// | roast-quick      | opus   | medium | none            | 1     | No-research fallback — still quality output |
// | reply            | sonnet | low    | none            | 1     | Quick reply — speed matters most           |
// | discovery        | sonnet | medium | Web+curl        | 10    | Target finding — structured, not creative  |
// | verify           | sonnet | medium | Web             | 5     | Fact-check — straightforward lookup        |
// | audit            | sonnet | low    | none            | 1     | Analytics — no research needed             |

const DEFAULT_PRESETS: Record<TaskProfile, TaskPreset> = {
  'roast-research': {
    model: 'opus',
    effort: 'high',
    tools: RESEARCH_TOOLS,
    maxTurns: 25,
    fallbackModel: 'sonnet',
  },
  'roast-quick': {
    model: 'opus',
    effort: 'medium',
    tools: [],
    maxTurns: 1,
    fallbackModel: 'sonnet',
  },
  reply: {
    model: 'sonnet',
    effort: 'low',
    tools: [],
    maxTurns: 1,
    fallbackModel: 'haiku',
  },
  discovery: {
    model: 'sonnet',
    effort: 'medium',
    tools: WEB_TOOLS,
    maxTurns: 10,
    fallbackModel: 'haiku',
  },
  verify: {
    model: 'sonnet',
    effort: 'medium',
    tools: WEB_TOOLS,
    maxTurns: 5,
    fallbackModel: 'haiku',
  },
  audit: {
    model: 'sonnet',
    effort: 'low',
    tools: [],
    maxTurns: 1,
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
