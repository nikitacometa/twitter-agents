import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSpawn = vi.fn();
const mockExecFile = vi.fn();
const mockMkdtemp = vi.fn();
const mockRm = vi.fn();

function callMock(mock: ReturnType<typeof vi.fn>, args: unknown[]): unknown {
  return mock(...args) as unknown;
}

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => callMock(mockExecFile, args),
  spawn: (...args: unknown[]) => callMock(mockSpawn, args),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: (...args: unknown[]) => callMock(mockMkdtemp, args),
  rm: (...args: unknown[]) => callMock(mockRm, args),
}));

import { ClaudeCodeProvider } from './claude-code.provider.js';
import { cliConfig } from './claude-cli.config.js';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
} as never;

const mockLogRepo = {
  insert: vi.fn(),
} as never;

function createMockChildProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

describe('ClaudeCodeProvider sandbox', () => {
  let provider: ClaudeCodeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ANTHROPIC_API_KEY', 'allowed-anthropic-key');
    vi.stubEnv('TWITTER_API_SECRET', 'must-not-leak');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'must-not-leak');
    vi.stubEnv('OPENAI_API_KEY', 'must-not-leak');
    vi.stubEnv('HTTPS_PROXY', 'http://proxy-credentials-must-not-leak');
    cliConfig.reset();
    mockMkdtemp.mockResolvedValue('/tmp/claude-code-test');
    mockRm.mockResolvedValue(undefined);
    provider = new ClaudeCodeProvider(mockLogger, mockLogRepo);
  });

  afterEach(() => {
    provider.shutdown();
    cliConfig.reset();
    vi.unstubAllEnvs();
  });

  it('reports file access because image profiles can use Read', () => {
    expect(provider.capabilities).toEqual({
      hasPerplexity: true,
      hasWebSearch: true,
      hasFileAccess: true,
      maxTurns: 25,
    });
  });

  it('spawns with safe tools, an env allowlist, and an isolated cwd', async () => {
    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child);
    cliConfig.env['OPENAI_API_KEY'] = 'runtime-config-must-not-expand-allowlist';

    const resultPromise = provider.run<{ ok: boolean }>('sandbox-test', {
      prompt: 'untrusted external content',
      profile: 'roast-research',
      requiresResearch: true,
      allowedTools: ['WebSearch', 'WebFetch', 'Bash(curl *)', 'Bash'],
    });

    setTimeout(() => {
      child.stdout.emit('data', Buffer.from(JSON.stringify({
        type: 'result',
        result: JSON.stringify({ ok: true }),
      })));
      child.emit('close', 0, null);
    }, 10);

    await expect(resultPromise).resolves.toMatchObject({
      data: { ok: true },
      provider: 'claude-code',
    });

    const spawnArgs = mockSpawn.mock.calls[0]!;
    expect(spawnArgs[0]).toBe('claude');
    const args = spawnArgs[1] as string[];
    expect(args.join(' ')).not.toContain('Bash');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(args).toContain('--allowedTools');
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('WebSearch,WebFetch');

    const options = spawnArgs[2] as { cwd: string; env: NodeJS.ProcessEnv };
    expect(options.cwd).toBe('/tmp/claude-code-test');
    expect(options.cwd).not.toBe(process.cwd());
    expect(options.cwd).not.toBe(join(process.cwd(), '..'));
    expect(options.env.ANTHROPIC_API_KEY).toBe('allowed-anthropic-key');
    expect(options.env.TWITTER_API_SECRET).toBeUndefined();
    expect(options.env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(options.env.OPENAI_API_KEY).toBeUndefined();
    expect(options.env.HTTPS_PROXY).toBeUndefined();
    expect(Object.keys(options.env)).toEqual(expect.arrayContaining([
      'PATH',
      'HOME',
      'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
      'CLAUDE_CODE_DISABLE_CLAUDE_MDS',
      'CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS',
      'CLAUDE_CODE_DISABLE_AUTO_MEMORY',
    ]));
    expect(mockRm).toHaveBeenCalledWith('/tmp/claude-code-test', {
      recursive: true,
      force: true,
    });
  });
});
