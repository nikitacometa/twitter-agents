import { execFile as execFileCb, spawn } from 'node:child_process';
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
import { getPreset, cliConfig } from './claude-cli.config.js';

const execFileAsync = promisify(execFileCb);

const DEFAULT_TIMEOUT_MS = 120_000;
const HEALTH_CHECK_TIMEOUT_MS = 10_000;
const SLOT_POLL_MS = 1_000;

export class ClaudeCodeProvider implements LLMProvider {
  readonly name: ProviderName = 'claude-code';
  readonly capabilities: ProviderCapabilities = {
    hasPerplexity: true,
    hasWebSearch: true,
    hasFileAccess: false,
    maxTurns: 25,
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
    const preset = getPreset(task.profile ?? 'roast-research');
    const toolSet = task.allowedTools ?? [...preset.tools];
    // Add Read tool when images are provided (Claude Code reads images via Read)
    if (task.imagePaths?.length && !toolSet.includes('Read')) {
      toolSet.push('Read');
    }
    const tools = toolSet.join(',');
    const maxTurns = task.maxTurns ?? preset.maxTurns;
    const timeout = task.timeoutMs ?? preset.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const args = [
      '-p',
      task.prompt,
      '--model',
      preset.model,
      '--effort',
      preset.effort,
      '--output-format',
      'json',
      '--max-turns',
      String(maxTurns),
      '--no-session-persistence',
    ];

    if (tools) {
      args.push('--allowedTools', tools);
    } else {
      // --tools "" disables all built-in and MCP tools (--allowedTools '' is ignored by CLI)
      args.push('--tools', '');
    }

    if (preset.fallbackModel) {
      args.push('--fallback-model', preset.fallbackModel);
    }

    try {
      const { stdout } = await this.execClaude(args, timeout);

      const parsed = extractJsonFromOutput(stdout);
      const data = JSON.parse(parsed) as T;
      const durationMs = Date.now() - start;

      this.logger.info(
        { taskId, durationMs, provider: this.name, model: preset.model, effort: preset.effort },
        'Agent task completed',
      );
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
        { err: error, taskId, durationMs, model: preset.model },
        `Claude Code provider failed: ${getErrorMessage(error)}`,
      );
      throw error;
    } finally {
      this.runningCount--;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const home = process.env.HOME ?? '';
      const extendedPath = `${home}/.local/bin:${home}/.npm-global/bin:${process.env.PATH ?? ''}`;
      const { stdout } = await execFileAsync('claude', ['--version'], {
        timeout: HEALTH_CHECK_TIMEOUT_MS,
        env: { ...process.env, PATH: extendedPath },
      });
      const healthy = stdout.trim().length > 0;
      this.logger.debug({ version: stdout.trim() }, 'Claude Code health check');
      return healthy;
    } catch (error) {
      this.logger.warn({ err: error }, 'Claude Code health check failed');
      return false;
    }
  }

  async waitForIdle(maxWaitMs: number): Promise<void> {
    if (this.runningCount === 0) return;

    this.logger.info({ active: this.runningCount }, 'Waiting for active Claude tasks to finish...');
    const deadline = Date.now() + maxWaitMs;
    while (this.runningCount > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, SLOT_POLL_MS));
    }

    if (this.runningCount > 0) {
      this.logger.warn({ active: this.runningCount }, 'Timeout waiting for tasks — killing remaining');
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
      // Extend PATH for PM2/cron contexts where ~/.local/bin isn't in PATH
      const home = process.env.HOME ?? '';
      const extendedPath = `${home}/.local/bin:${home}/.npm-global/bin:${process.env.PATH ?? ''}`;

      // Remove ANTHROPIC_API_KEY so Claude CLI uses subscription auth, not API key
      const baseEnv = { ...process.env };
      delete baseEnv.ANTHROPIC_API_KEY;
      const child = spawn('claude', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...baseEnv, ...cliConfig.env, PATH: extendedPath },
      });
      this.childProcesses.add(child);

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      const timer = timeout > 0
        ? setTimeout(() => { child.kill('SIGTERM'); }, timeout)
        : null;

      child.on('close', (code, signal) => {
        if (timer) clearTimeout(timer);
        this.childProcesses.delete(child);

        if (signal) {
          reject(new Error(
            `claude process failed (killed by ${signal} after ${String(timeout)}ms)${stderr ? `\nstderr: ${stderr}` : ''}${stdout ? `\nstdout: ${stdout.slice(0, 500)}` : ''}`,
          ));
        } else if (code !== 0) {
          reject(new Error(
            `claude process failed (exit code ${String(code)})${stderr ? `\nstderr: ${stderr}` : ''}${stdout ? `\nstdout: ${stdout.slice(0, 500)}` : ''}`,
          ));
        } else {
          resolve({ stdout });
        }
      });

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        this.childProcesses.delete(child);
        reject(new Error(`claude process spawn failed: ${err.message}`));
      });
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
