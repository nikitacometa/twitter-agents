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
            const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
            const reason = err.killed
              ? `killed by ${err.signal ?? 'timeout'} after ${String(timeout)}ms`
              : `exit code ${String(err.code ?? 'unknown')}`;
            reject(
              new Error(
                `claude process failed (${reason})${stderr ? `\nstderr: ${stderr}` : ''}`,
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
 * Claude Code --output-format json wraps the result in different formats depending on version:
 * - v2.1+: {"type":"result","result":"<text>","..."}
 * - older: [{"type":"text","text":"<text>"}]
 * Extract the actual LLM response text from whichever wrapper is used.
 */
function extractJsonFromOutput(raw: string): string {
  const trimmed = raw.trim();

  // Unwrap Claude CLI result/content-block wrappers to get the inner text
  const inner = unwrapCliOutput(trimmed);

  // If inner text is already valid JSON, return it
  if (inner.startsWith('{') || inner.startsWith('[')) {
    try {
      JSON.parse(inner);
      return inner;
    } catch {
      // Not valid JSON as-is — extract from text below
    }
  }

  // Find the first balanced JSON object in the text
  return extractFirstJsonObject(inner);
}

function unwrapCliOutput(text: string): string {
  // v2.1+ result wrapper: {"type":"result","result":"..."}
  if (text.startsWith('{')) {
    try {
      const wrapper = JSON.parse(text) as Record<string, unknown>;
      if (wrapper['type'] === 'result' && typeof wrapper['result'] === 'string') {
        return wrapper['result'];
      }
    } catch {
      // Not a valid JSON wrapper
    }
    return text;
  }

  // Older format: array of content blocks
  if (text.startsWith('[')) {
    try {
      const blocks = JSON.parse(text) as Array<{ type: string; text?: string }>;
      const textBlock = blocks.findLast((b) => b.type === 'text' && b.text);
      if (textBlock?.text) {
        return textBlock.text;
      }
    } catch {
      // Not a valid content block array
    }
  }

  return text;
}

function extractFirstJsonObject(text: string): string {
  const startIdx = text.indexOf('{');
  if (startIdx !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i]!;
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(startIdx, i + 1);
        }
      }
    }
  }

  throw new Error('No JSON found in Claude Code output');
}
