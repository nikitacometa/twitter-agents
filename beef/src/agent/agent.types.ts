// LLM provider abstraction — strategy pattern for CLI vs SDK fallback.

export type TaskProfile =
  | 'roast-research'
  | 'roast-quick'
  | 'reply'
  | 'discovery'
  | 'verify'
  | 'audit';

export interface AgentTask {
  prompt: string;
  profile?: TaskProfile;
  maxTurns?: number;
  timeoutMs?: number;
  allowedTools?: string[];
  requiresResearch: boolean;
}

export interface AgentResult<T = unknown> {
  data: T;
  durationMs: number;
  provider: ProviderName;
}

export type ProviderName = 'claude-code' | 'anthropic-sdk';

export interface ProviderCapabilities {
  hasPerplexity: boolean;
  hasWebSearch: boolean;
  hasFileAccess: boolean;
  maxTurns: number;
}

export interface LLMProvider {
  run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>>;
  healthCheck(): Promise<boolean>;
  waitForIdle?(maxWaitMs: number): Promise<void>;
  shutdown(): void;
  readonly name: ProviderName;
  readonly capabilities: ProviderCapabilities;
}

export type ProviderMode = 'primary' | 'degraded' | 'paused';

export class TaskRequiresResearchError extends Error {
  constructor(taskId: string) {
    super(`Task "${taskId}" requires research tools — unavailable in degraded mode`);
    this.name = 'TaskRequiresResearchError';
  }
}

export class ProviderUnavailableError extends Error {
  constructor(taskId: string) {
    super(`All providers exhausted for task "${taskId}"`);
    this.name = 'ProviderUnavailableError';
  }
}

// Output schemas for agent responses — used by prompt templates.

export interface AgentRoastOutput {
  variants: Array<{
    text: string;
    score: number;
    angle: string;
  }>;
  bestIndex: number;
  researchNotes: string | null;
  factCheckPassed: boolean;
}

export interface AgentDiscoveryOutput {
  targets: Array<{
    name: string;
    type: 'project' | 'token' | 'trend' | 'person';
    reason: string;
    timeliness: number;
    roastability: number;
  }>;
}

export interface AgentVerifyOutput {
  allClaimsValid: boolean;
  claims: Array<{
    claim: string;
    valid: boolean;
    source: string | null;
    correction: string | null;
  }>;
}

export interface AgentReplyOutput {
  text: string;
  tone: string;
  mentionsBeef: boolean;
}

export interface AgentAuditOutput {
  overallScore: number;
  topPerformers: string[];
  underperformers: string[];
  recommendations: string[];
}
