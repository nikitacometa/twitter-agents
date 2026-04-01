import type { Logger } from 'pino';
import type {
  AgentResult,
  AgentTask,
  LLMProvider,
  ProviderCapabilities,
  ProviderMode,
  ProviderName,
} from './agent.types.js';
import { getErrorMessage } from '@common/utils/error.util.js';

export interface Alerter {
  send(message: string): Promise<void>;
}

const FAILURE_THRESHOLD = 3;
const RECOVERY_CHECK_MS = 15 * 60 * 1000;

/** Extract human-readable reason from raw Claude CLI error output. */
function parseProviderFailureReason(raw: string): string {
  if (raw.includes('hit your limit') || raw.includes("You've hit your limit")) {
    const resetMatch = raw.match(/resets\s+(\d+(?:am|pm)\s*\(?\w*\)?)/i);
    const resetTime = resetMatch ? ` Resets ${resetMatch[1]}.` : '';
    return `Claude Max quota exhausted.${resetTime}`;
  }
  if (raw.includes('rate limit') || raw.includes('429')) {
    return 'Claude API rate limited (429).';
  }
  if (raw.includes('ECONNREFUSED') || raw.includes('ETIMEDOUT') || raw.includes('fetch failed')) {
    return 'Network error — cannot reach Claude API.';
  }
  if (raw.includes('exit code')) {
    return `Claude CLI crashed (${raw.slice(0, 120)}).`;
  }
  return raw.length > 150 ? `${raw.slice(0, 150)}…` : raw;
}

export class ProviderManager implements LLMProvider {
  readonly name: ProviderName = 'claude-code';
  private _mode: ProviderMode = 'primary';
  private consecutiveFailures = 0;
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly primary: LLMProvider,
    private readonly fallbacks: LLMProvider[],
    private readonly alerter: Alerter,
    private readonly logger: Logger,
  ) {}

  get capabilities(): ProviderCapabilities {
    if (this._mode === 'primary') return this.primary.capabilities;
    return this.fallbacks[0]?.capabilities ?? this.primary.capabilities;
  }

  get mode(): ProviderMode {
    return this._mode;
  }

  async run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>> {
    // Always try primary first (enables auto-recovery even in degraded mode)
    let primaryError: unknown;
    try {
      const result = await this.primary.run<T>(taskId, task);
      this.handleRecovery();
      return result;
    } catch (error) {
      primaryError = error;
      if (!task.skipDegradedTracking) {
        this.consecutiveFailures++;
      }
      this.logger.warn(
        { taskId, failures: this.consecutiveFailures, skipTracking: task.skipDegradedTracking ?? false, err: error },
        `Primary provider failed (${String(this.consecutiveFailures)}/${String(FAILURE_THRESHOLD)}): ${getErrorMessage(error)}`,
      );
    }

    // Below threshold (or tracking skipped) — rethrow primary error, let caller retry later
    if (this.consecutiveFailures < FAILURE_THRESHOLD) {
      throw primaryError;
    }

    // At threshold: enter degraded mode and try fallbacks in order
    if (this.fallbacks.length > 0) {
      if (this._mode !== 'degraded') {
        await this.enterDegradedMode(getErrorMessage(primaryError));
      }

      for (const fb of this.fallbacks) {
        try {
          const result = await fb.run<T>(taskId, task);
          this.logger.info(
            { taskId, provider: fb.name, durationMs: result.durationMs },
            `Fallback ${fb.name} handled request`,
          );
          return result;
        } catch (fbError) {
          this.logger.warn(
            { taskId, provider: fb.name, err: fbError },
            `Fallback ${fb.name} failed, trying next: ${getErrorMessage(fbError)}`,
          );
        }
      }
    }

    // All fallbacks exhausted (or none configured) — throw original error
    throw primaryError;
  }

  async healthCheck(): Promise<boolean> {
    const primaryOk = await this.primary.healthCheck();
    if (primaryOk && this._mode !== 'primary') {
      this.handleRecoveryAsync();
    }
    if (primaryOk) return true;

    for (const fb of this.fallbacks) {
      if (await fb.healthCheck()) return true;
    }
    return false;
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

  getStatusInfo(): { mode: ProviderMode; consecutiveFailures: number; hasRecoveryTimer: boolean; fallbackNames: ProviderName[] } {
    return {
      mode: this._mode,
      consecutiveFailures: this.consecutiveFailures,
      hasRecoveryTimer: this.recoveryTimer !== null,
      fallbackNames: this.fallbacks.map((fb) => fb.name),
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
    for (const fb of this.fallbacks) {
      fb.shutdown();
    }
  }

  private handleRecovery(): void {
    if (this._mode === 'primary' && this.consecutiveFailures === 0) return;

    this.consecutiveFailures = 0;
    if (this._mode !== 'primary') {
      this._mode = 'primary';
      this.stopRecoveryTimer();
      this.logger.info('Primary provider recovered — full mode restored');
      void this.alerter.send(
        '✅ Claude Code CLI restored\n\nFull mode: research + multi-turn + 5-judge eval.',
      );
    }
  }

  private handleRecoveryAsync(): void {
    this.handleRecovery();
  }

  private async enterDegradedMode(reason: string): Promise<void> {
    this._mode = 'degraded';
    this.startRecoveryTimer();
    const fbNames = this.fallbacks.map((fb) => fb.name).join(' → ');
    const humanReason = parseProviderFailureReason(reason);
    this.logger.warn({ reason: humanReason, rawReason: reason, chain: fbNames }, 'Entering degraded mode');
    await this.alerter.send(
      `⚠️ <b>Claude Code CLI unavailable</b>\n\n` +
      `Reason: ${humanReason}\n` +
      `Fallback: ${fbNames}\n` +
      `Recovery: auto-check every 15 min`,
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
