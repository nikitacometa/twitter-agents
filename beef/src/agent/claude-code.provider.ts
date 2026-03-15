import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
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
} from './agent.types.js';

const execFileAsync = promisify(execFileCb);

const DEFAULT_TOOLS = [
  'mcp__perplexity-ask__perplexity_ask',
  'WebSearch',
  'WebFetch',
  'Read',
  'Grep',
  'Glob',
  'Bash(curl *)',
].join(',');

const DEFAULT_MAX_TURNS = 25;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const HEALTH_CHECK_TIMEOUT_MS = 10_000;
const SLOT_POLL_MS = 1_000;

export class ClaudeCodeProvider implements LLMProvider {
  readonly name: ProviderName = 'claude-code';
  readonly capabilities: ProviderCapabilities = {
    hasPerplexity: true,
    hasWebSearch: true,
    hasFileAccess: true,
    maxTurns: DEFAULT_MAX_TURNS,
  };

  private runningCount = 0;
  private readonly maxConcurrent: number;
  private readonly childProcesses = new Set<ChildProcess>();

  constructor(
    private readonly logger: Logger,
    private readonly logRepo: LlmLogRepository,
    options?: { maxConcurrent?: number },
  ) {
    this.maxConcurrent = options?.maxConcurrent ?? 2;
  }

  async run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>> {
    await this.waitForSlot();
    this.runningCount++;

    const start = Date.now();
    const tools = task.allowedTools?.join(',') ?? DEFAULT_TOOLS;
    const maxTurns = task.maxTurns ?? DEFAULT_MAX_TURNS;
    const timeout = task.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const args = [
      '-p',
      task.prompt,
      '--model',
      'sonnet',
      '--output-format',
      'json',
      '--max-turns',
      String(maxTurns),
      '--allowedTools',
      tools,
    ];

    try {
      const { stdout } = await this.execClaude(args, timeout);

      const parsed = extractJsonFromOutput(stdout);
      const data = JSON.parse(parsed) as T;
      const durationMs = Date.now() - start;

      this.logger.info({ taskId, durationMs, provider: this.name }, 'Agent task completed');
      this.logRepo.insert({
        taskId,
        taskType: this.name,
        prompt: task.prompt,
        response: parsed,
        durationMs,
      });

      return { data, durationMs, provider: this.name };
    } catch (error) {
      const durationMs = Date.now() - start;
      this.logger.error(
        { err: error, taskId, durationMs },
        `Claude Code provider failed: ${getErrorMessage(error)}`,
      );
      throw error;
    } finally {
      this.runningCount--;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('claude', ['--version'], {
        timeout: HEALTH_CHECK_TIMEOUT_MS,
      });
      const healthy = stdout.trim().length > 0;
      this.logger.debug({ version: stdout.trim() }, 'Claude Code health check');
      return healthy;
    } catch (error) {
      this.logger.warn({ err: error }, 'Claude Code health check failed');
      return false;
    }
  }

  shutdown(): void {
    for (const child of this.childProcesses) {
      child.kill('SIGTERM');
    }
    this.childProcesses.clear();
    this.logger.info('Claude Code provider: all child processes terminated');
  }

  get activeCount(): number {
    return this.runningCount;
  }

  private execClaude(args: string[], timeout: number): Promise<{ stdout: string }> {
    return new Promise((resolve, reject) => {
      const child = execFileCb(
        'claude',
        args,
        { timeout, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          this.childProcesses.delete(child);
          if (error) {
            reject(
              new Error(
                `claude process failed: ${getErrorMessage(error)}${stderr ? `\nstderr: ${stderr}` : ''}`,
              ),
            );
          } else {
            resolve({ stdout });
          }
        },
      );
      this.childProcesses.add(child);
    });
  }

  private async waitForSlot(): Promise<void> {
    while (this.runningCount >= this.maxConcurrent) {
      await new Promise((resolve) => setTimeout(resolve, SLOT_POLL_MS));
    }
  }
}

/**
 * Claude Code --output-format json wraps the result in a JSON array of content blocks.
 * Extract the text content from the last assistant message.
 */
function extractJsonFromOutput(raw: string): string {
  const trimmed = raw.trim();

  // Already a JSON object — return as-is
  if (trimmed.startsWith('{')) {
    return trimmed;
  }

  // Claude Code --output-format json returns an array of content blocks
  if (trimmed.startsWith('[')) {
    const blocks = JSON.parse(trimmed) as Array<{ type: string; text?: string }>;
    const textBlock = blocks.findLast((b) => b.type === 'text' && b.text);
    if (textBlock?.text) {
      return textBlock.text;
    }
  }

  // Fallback: find the first JSON object in the output
  const match = /\{[\s\S]*\}/.exec(trimmed);
  if (match) {
    return match[0];
  }

  throw new Error('No JSON found in Claude Code output');
}
