import { execFileSync, spawn } from 'node:child_process';
import { readFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ChildProcess } from 'node:child_process';
import type { Logger } from 'pino';
import type { LlmLogRepository } from '@storage/repositories/llm-log.repository.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import type {
  AgentResult,
  AgentTask,
  LLMProvider,
  ProviderCapabilities,
  ProviderName,
  TaskProfile,
} from './agent.types.js';

const MODEL = 'gpt-5.4';
const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const SLOT_POLL_MS = 1_000;

const SCHEMA_DIR = new URL('./schemas/', import.meta.url).pathname;

function getExtendedPath(): string {
  const home = process.env.HOME ?? '';
  return `${home}/.local/bin:${home}/.npm-global/bin:${process.env.PATH ?? ''}`;
}

interface CodexProfile {
  model: string;
  effort: string;
  schema: string;
  timeoutMs: number;
}

const CODEX_PROFILES: Partial<Record<TaskProfile, CodexProfile>> = {
  'roast-research': { model: MODEL, effort: 'high', schema: 'roast-output', timeoutMs: 180_000 },
  'roast-quick': { model: MODEL, effort: 'high', schema: 'roast-output', timeoutMs: 120_000 },
  'roast-power': { model: MODEL, effort: 'high', schema: 'roast-output', timeoutMs: 300_000 },
  'farm-generate': { model: MODEL, effort: 'high', schema: 'roast-output', timeoutMs: 300_000 },
  'farm-evaluate': { model: MODEL, effort: 'medium', schema: 'roast-output', timeoutMs: 120_000 },
  'farm-discover': { model: MODEL, effort: 'medium', schema: 'roast-output', timeoutMs: 120_000 },
  reply: { model: MODEL, effort: 'medium', schema: 'reply-output', timeoutMs: 60_000 },
  discovery: { model: MODEL, effort: 'medium', schema: 'roast-output', timeoutMs: 120_000 },
  verify: { model: MODEL, effort: 'medium', schema: 'roast-output', timeoutMs: 60_000 },
  audit: { model: MODEL, effort: 'low', schema: 'roast-output', timeoutMs: 30_000 },
  'example-parse': { model: MODEL, effort: 'high', schema: 'roast-output', timeoutMs: 120_000 },
  'meme-generate': { model: MODEL, effort: 'medium', schema: 'roast-output', timeoutMs: 60_000 },
};

const DEFAULT_PROFILE: CodexProfile = {
  model: MODEL,
  effort: 'high',
  schema: 'roast-output',
  timeoutMs: 120_000,
};

export class CodexProvider implements LLMProvider {
  readonly name: ProviderName = 'codex';
  readonly capabilities: ProviderCapabilities = {
    hasPerplexity: false,
    hasWebSearch: true,
    hasFileAccess: false,
    maxTurns: 1,
  };

  private runningCount = 0;
  private readonly maxConcurrent: number;
  private readonly childProcesses = new Set<ChildProcess>();

  constructor(
    private readonly logger: Logger,
    private readonly logRepo: LlmLogRepository,
    options?: { maxConcurrent?: number },
  ) {
    this.maxConcurrent = options?.maxConcurrent ?? 1;
  }

  async run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>> {
    await this.waitForSlot();
    this.runningCount++;

    const start = Date.now();
    const profile = CODEX_PROFILES[task.profile ?? 'roast-quick'] ?? DEFAULT_PROFILE;
    const schemaPath = join(SCHEMA_DIR, `${profile.schema}.schema.json`);
    const timeout = task.timeoutMs ?? profile.timeoutMs;

    let tmpDir: string | undefined;

    try {
      tmpDir = await mkdtemp(join(tmpdir(), 'codex-'));
      const outputPath = join(tmpDir, 'output.json');

      const args = [
        'exec',
        task.prompt,
        '-m', profile.model,
        '-c', `model_reasoning_effort="${profile.effort}"`,
        '-c', 'web_search="live"',
        '--output-schema', schemaPath,
        '-o', outputPath,
        '--ephemeral',
        '--dangerously-bypass-approvals-and-sandbox',
        '--skip-git-repo-check',
      ];

      for (const img of task.imagePaths ?? []) {
        args.push('-i', img);
      }

      await this.execCodex(args, timeout);

      const raw = await readFile(outputPath, 'utf-8');
      const data = JSON.parse(raw) as T;
      const durationMs = Date.now() - start;

      this.logger.info(
        { taskId, durationMs, provider: this.name, model: profile.model, effort: profile.effort },
        'Codex task completed',
      );
      this.logRepo.insert({
        taskId,
        taskType: this.name,
        prompt: task.prompt,
        response: raw,
        durationMs,
      });

      return { data, durationMs, provider: this.name };
    } catch (error) {
      const durationMs = Date.now() - start;
      this.logger.error(
        { err: error, taskId, durationMs, model: profile.model },
        `Codex provider failed: ${getErrorMessage(error)}`,
      );
      throw error;
    } finally {
      this.runningCount--;
      if (tmpDir) {
        void this.cleanupTmp(tmpDir);
      }
    }
  }

  healthCheck(): Promise<boolean> {
    try {
      execFileSync('codex', ['--version'], {
        timeout: HEALTH_CHECK_TIMEOUT_MS,
        env: { ...process.env, PATH: getExtendedPath() },
        stdio: 'pipe',
      });
      return Promise.resolve(true);
    } catch (error) {
      this.logger.warn({ err: error }, 'Codex health check failed');
      return Promise.resolve(false);
    }
  }

  async waitForIdle(maxWaitMs: number): Promise<void> {
    if (this.runningCount === 0) return;

    this.logger.info({ active: this.runningCount }, 'Waiting for active Codex tasks to finish...');
    const deadline = Date.now() + maxWaitMs;
    while (this.runningCount > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, SLOT_POLL_MS));
    }

    if (this.runningCount > 0) {
      this.logger.warn({ active: this.runningCount }, 'Timeout waiting for Codex tasks — killing remaining');
    }
  }

  shutdown(): void {
    for (const child of this.childProcesses) {
      child.kill('SIGTERM');
    }
    this.childProcesses.clear();
    this.logger.info('Codex provider: all child processes terminated');
  }

  get activeCount(): number {
    return this.runningCount;
  }

  private execCodex(args: string[], timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('codex', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PATH: getExtendedPath() },
      });
      this.childProcesses.add(child);

      let stderr = '';
      child.stdout.on('data', () => { /* output goes to -o file */ });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      const timer = timeout > 0
        ? setTimeout(() => { child.kill('SIGTERM'); }, timeout)
        : null;

      child.on('close', (code, signal) => {
        if (timer) clearTimeout(timer);
        this.childProcesses.delete(child);

        if (signal) {
          reject(new Error(
            `codex process killed by ${signal} after ${String(timeout)}ms${stderr ? `\nstderr: ${stderr}` : ''}`,
          ));
        } else if (code !== 0) {
          reject(new Error(
            `codex process failed (exit code ${String(code)})${stderr ? `\nstderr: ${stderr}` : ''}`,
          ));
        } else {
          resolve();
        }
      });

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        this.childProcesses.delete(child);
        reject(new Error(`codex process spawn failed: ${err.message}`));
      });
    });
  }

  private async waitForSlot(): Promise<void> {
    while (this.runningCount >= this.maxConcurrent) {
      await new Promise((resolve) => setTimeout(resolve, SLOT_POLL_MS));
    }
  }

  private async cleanupTmp(dir: string): Promise<void> {
    try {
      const outputPath = join(dir, 'output.json');
      await unlink(outputPath).catch(() => {});
      // rmdir only works on empty dirs — fine after unlinking the single file
      const { rmdir } = await import('node:fs/promises');
      await rmdir(dir).catch(() => {});
    } catch {
      // Best-effort cleanup
    }
  }
}

export function createCodexProvider(
  logger: Logger,
  logRepo: LlmLogRepository,
): CodexProvider | null {
  try {
    const out = execFileSync('codex', ['--version'], {
      timeout: 3_000,
      env: { ...process.env, PATH: getExtendedPath() },
      stdio: 'pipe',
    });
    const version = out.toString().trim();
    logger.info({ version, model: MODEL }, 'Codex CLI available — secondary fallback enabled');
    return new CodexProvider(logger, logRepo);
  } catch {
    logger.info('Codex CLI not available — secondary fallback disabled');
    return null;
  }
}
