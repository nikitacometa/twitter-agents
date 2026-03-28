// LLM provider abstraction — strategy pattern for CLI vs SDK fallback.

export type TaskProfile =
  | 'roast-research'
  | 'roast-quick'
  | 'roast-power'
  | 'reply'
  | 'discovery'
  | 'verify'
  | 'audit'
  | 'example-parse'
  | 'farm-evaluate'
  | 'farm-generate'
  | 'farm-discover'
  | 'meme-generate'
  | 'meme-evaluate'
  | 'roast-fast-research'
  | 'roast-fast-gen';

export interface AgentTask {
  prompt: string;
  profile?: TaskProfile;
  maxTurns?: number;
  timeoutMs?: number;
  allowedTools?: string[];
  requiresResearch: boolean;
  /** Local file paths to images for multimodal context. */
  imagePaths?: string[];
  /** When true, failures don't count toward provider degraded mode threshold.
   *  Use for speculative parallel calls (e.g. fast gen batch) where individual
   *  failures are expected and don't indicate a systemic provider issue. */
  skipDegradedTracking?: boolean;
}

export interface AgentResult<T = unknown> {
  data: T;
  durationMs: number;
  provider: ProviderName;
}

export type ProviderName = 'claude-code' | 'codex' | 'anthropic-sdk';

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

export type ProviderMode = 'primary' | 'degraded';

export class TaskRequiresResearchError extends Error {
  constructor(taskId: string) {
    super(`Task "${taskId}" requires research tools — unavailable in degraded mode`);
    this.name = 'TaskRequiresResearchError';
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
  diaryThought?: string;
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
  diaryThought?: string;
}

export interface AgentAuditOutput {
  overallScore: number;
  topPerformers: string[];
  underperformers: string[];
  recommendations: string[];
}

export interface AgentFastResearchOutput {
  researchNotes: string;
  keyFindings: string[];
  quotableAmmo: string[];
  factCheckPassed: boolean;
}

export interface AgentRankingOutput {
  rankings: Array<{
    index: number;
    score: number;
    funny: number;
    impact: number;
    original: number;
    reason: string;
  }>;
}
