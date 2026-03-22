import type { Logger } from 'pino';
import {
  type AgentResult,
  type AgentTask,
  type LLMProvider,
  type ProviderCapabilities,
  type ProviderMode,
  type ProviderName,
  TaskRequiresResearchError,
} from './agent.types.js';
import { getErrorMessage } from '@common/utils/error.util.js';

export interface Alerter {
  send(message: string): Promise<void>;
}

const FAILURE_THRESHOLD = 3;
const RECOVERY_CHECK_MS = 15 * 60 * 1000;

export class ProviderManager implements LLMProvider {
  readonly name: ProviderName = 'claude-code';
  private _mode: ProviderMode = 'primary';
  private consecutiveFailures = 0;
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly primary: LLMProvider,
    private readonly fallback: LLMProvider | null,
    private readonly alerter: Alerter,
    private readonly logger: Logger,
  ) {}

  get capabilities(): ProviderCapabilities {
    return this._mode === 'primary'
      ? this.primary.capabilities
      : (this.fallback?.capabilities ?? this.primary.capabilities);
  }

  get mode(): ProviderMode {
    return this._mode;
  }

  async run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>> {
    // Research tasks cannot run in degraded mode
    if (task.requiresResearch && this._mode === 'degraded') {
      this.logger.warn({ taskId }, 'Task requires research — skipped in degraded mode');
      throw new TaskRequiresResearchError(taskId);
    }

    // Try primary provider
    let primaryError: unknown;
    try {
      const result = await this.primary.run<T>(taskId, task);
      this.handleRecovery();
      return result;
    } catch (error) {
      primaryError = error;
      this.consecutiveFailures++;
      this.logger.warn(
        { taskId, failures: this.consecutiveFailures, err: error },
        `Primary provider failed (${String(this.consecutiveFailures)}/${String(FAILURE_THRESHOLD)}): ${getErrorMessage(error)}`,
      );
    }

    // Below threshold — rethrow primary error, let caller retry later
    if (this.consecutiveFailures < FAILURE_THRESHOLD) {
      throw primaryError;
    }

    // At threshold: try fallback for non-research tasks
    if (this.fallback && !task.requiresResearch) {
      if (this._mode !== 'degraded') {
        await this.enterDegradedMode();
      }
      return this.fallback.run<T>(taskId, task);
    }

    // No fallback available (or research required): throw original error
    throw primaryError;
  }

  async healthCheck(): Promise<boolean> {
    const primaryOk = await this.primary.healthCheck();
    if (primaryOk && this._mode !== 'primary') {
      this.handleRecoveryAsync();
    }
    return primaryOk || (this.fallback ? await this.fallback.healthCheck() : false);
  }

  /**
   * Force-reset provider to primary mode.
   * Use when provider is stuck in degraded mode after transient failures.
   */
  forceReset(): void {
    const prev = this._mode;
    this.consecutiveFailures = 0;
    this._mode = 'primary';
    this.stopRecoveryTimer();
    this.logger.info({ previousMode: prev }, 'Provider force-reset to primary mode');
  }

  getStatusInfo(): { mode: ProviderMode; consecutiveFailures: number; hasRecoveryTimer: boolean } {
    return {
      mode: this._mode,
      consecutiveFailures: this.consecutiveFailures,
      hasRecoveryTimer: this.recoveryTimer !== null,
    };
  }

  async waitForIdle(maxWaitMs: number): Promise<void> {
    await this.primary.waitForIdle?.(maxWaitMs);
  }

  shutdown(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    this.primary.shutdown();
    this.fallback?.shutdown();
  }

  private handleRecovery(): void {
    if (this._mode === 'primary' && this.consecutiveFailures === 0) return;

    this.consecutiveFailures = 0;
    if (this._mode !== 'primary') {
      this._mode = 'primary';
      this.stopRecoveryTimer();
      this.logger.info('Primary provider recovered — full mode restored');
      void this.alerter.send('✅ Claude Code CLI recovered. Full mode restored.');
    }
  }

  private handleRecoveryAsync(): void {
    this.handleRecovery();
  }

  private async enterDegradedMode(): Promise<void> {
    this._mode = 'degraded';
    this.startRecoveryTimer();
    this.logger.warn('Entering degraded mode — only non-research tasks via SDK fallback');
    await this.alerter.send(
      '⚠️ Claude Code CLI unavailable. Degraded mode: only simple replies. Research tasks queued.',
    );
  }

  private startRecoveryTimer(): void {
    if (this.recoveryTimer) return;

    this.recoveryTimer = setInterval(() => {
      void this.attemptRecovery();
    }, RECOVERY_CHECK_MS);
  }

  private stopRecoveryTimer(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  private async attemptRecovery(): Promise<void> {
    this.logger.info('Attempting primary provider recovery...');
    const ok = await this.primary.healthCheck();
    if (ok) {
      this.handleRecovery();
    } else {
      this.logger.warn('Recovery attempt failed — staying in current mode');
    }
  }
}
