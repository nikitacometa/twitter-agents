import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

// Mock child_process before importing provider
const mockSpawn = vi.fn();
const mockExecFileSync = vi.fn();
function callMock(mock: ReturnType<typeof vi.fn>, args: unknown[]): unknown {
  return mock(...args) as unknown;
}
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => callMock(mockSpawn, args),
  execFileSync: (...args: unknown[]) => callMock(mockExecFileSync, args),
}));

// Mock fs operations
const mockReadFile = vi.fn();
const mockMkdtemp = vi.fn();
const mockWriteFile = vi.fn();
const mockRm = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => callMock(mockReadFile, args),
  mkdtemp: (...args: unknown[]) => callMock(mockMkdtemp, args),
  writeFile: (...args: unknown[]) => callMock(mockWriteFile, args),
  rm: (...args: unknown[]) => callMock(mockRm, args),
}));

import { CodexProvider, createCodexProvider } from './codex.provider.js';
import { EventEmitter } from 'node:events';

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

describe('CodexProvider', () => {
  let provider: CodexProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BEEF_TEST_SECRET', 'must-not-leak');
    provider = new CodexProvider(mockLogger, mockLogRepo);
  });

  afterEach(() => {
    provider.shutdown();
    vi.unstubAllEnvs();
  });

  it('has correct capabilities', () => {
    expect(provider.name).toBe('codex');
    expect(provider.capabilities).toEqual({
      hasPerplexity: false,
      hasWebSearch: true,
      hasFileAccess: true,
      maxTurns: 1,
    });
  });

  it('runs a task and reads output from file', async () => {
    const tmpDir = '/tmp/codex-abc123';
    mockMkdtemp.mockResolvedValue(tmpDir);
    mockReadFile.mockResolvedValue(JSON.stringify({
      variants: [{ text: 'roast text', score: 8.5, angle: 'DATA_BOMB' }],
      bestIndex: 0,
      factCheckPassed: true,
      researchNotes: null,
    }));
    mockRm.mockResolvedValue(undefined);

    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child);

    const resultPromise = provider.run('test-1', {
      prompt: 'Roast Bitcoin',
      profile: 'roast-quick',
      requiresResearch: false,
    });

    // Simulate successful process exit
    setTimeout(() => child.emit('close', 0, null), 10);

    const result = await resultPromise;
    expect(result.provider).toBe('codex');
    expect(result.data).toHaveProperty('variants');

    // Verify spawn was called with correct args
    const spawnArgs = mockSpawn.mock.calls[0]!;
    expect(spawnArgs[0]).toBe('codex');
    const args = spawnArgs[1] as string[];
    expect(args[0]).toBe('exec');
    expect(args).toContain('-m');
    expect(args).toContain('--output-schema');
    expect(args).toContain('--ephemeral');
    expect(args).toContain('--ignore-user-config');
    expect(args).toContain('--ignore-rules');
    expect(args).toContain('-o');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(args).toContain('-s');
    expect(args[args.indexOf('-s') + 1]).toBe('read-only');
    expect(args).toContain('web_search="disabled"');
    expect(args).toContain('shell_environment_policy.inherit="none"');
    const oIdx = args.indexOf('-o');
    expect(args[oIdx + 1]).toBe(join(tmpDir, 'output.json'));

    const options = spawnArgs[2] as { cwd: string; env: NodeJS.ProcessEnv };
    expect(options.cwd).toBe(tmpDir);
    expect(options.cwd).not.toBe(process.cwd());
    expect(options.cwd).not.toBe(join(process.cwd(), '..'));
    expect(options.env.BEEF_TEST_SECRET).toBeUndefined();
    expect(Object.keys(options.env)).toEqual(expect.arrayContaining(['PATH', 'HOME']));
    expect(Object.keys(options.env)).toEqual(
      expect.not.arrayContaining(['OPENAI_API_KEY', 'BEEF_TEST_SECRET']),
    );
    expect(mockRm).toHaveBeenCalledWith(tmpDir, { recursive: true, force: true });
  });

  it('enables live web search only for research tasks', async () => {
    mockMkdtemp.mockResolvedValue('/tmp/codex-research');
    mockReadFile.mockResolvedValue('{"variants":[],"bestIndex":0,"factCheckPassed":true}');
    mockRm.mockResolvedValue(undefined);

    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child);

    const resultPromise = provider.run('test-research', {
      prompt: 'research test',
      requiresResearch: true,
    });

    setTimeout(() => child.emit('close', 0, null), 10);
    await resultPromise;

    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).toContain('web_search="live"');
  });

  it('rejects on non-zero exit code', async () => {
    mockMkdtemp.mockResolvedValue('/tmp/codex-fail');
    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child);
    mockRm.mockResolvedValue(undefined);

    const resultPromise = provider.run('test-fail', {
      prompt: 'test',
      requiresResearch: false,
    });

    setTimeout(() => {
      child.stderr.emit('data', Buffer.from('rate limited'));
      child.emit('close', 1, null);
    }, 10);

    await expect(resultPromise).rejects.toThrow('codex process failed (exit code 1)');
  });

  it('rejects on signal (timeout)', async () => {
    mockMkdtemp.mockResolvedValue('/tmp/codex-timeout');
    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child);
    mockRm.mockResolvedValue(undefined);

    const resultPromise = provider.run('test-timeout', {
      prompt: 'test',
      requiresResearch: false,
    });

    setTimeout(() => child.emit('close', null, 'SIGTERM'), 10);

    await expect(resultPromise).rejects.toThrow('codex process killed by SIGTERM');
  });

  it('passes image paths with -i flag', async () => {
    mockMkdtemp.mockResolvedValue('/tmp/codex-img');
    mockReadFile.mockResolvedValue('{"variants":[],"bestIndex":0,"factCheckPassed":true}');
    mockRm.mockResolvedValue(undefined);

    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child);

    const resultPromise = provider.run('test-img', {
      prompt: 'test',
      requiresResearch: false,
      imagePaths: ['/tmp/screenshot.png'],
    });

    setTimeout(() => child.emit('close', 0, null), 10);
    await resultPromise;

    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).toContain('-i');
    const iIdx = args.indexOf('-i');
    expect(args[iIdx + 1]).toBe('/tmp/screenshot.png');
  });
});

describe('createCodexProvider', () => {
  it('returns provider when codex binary is available', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('codex-cli 0.111.0'));
    const provider = createCodexProvider(mockLogger, mockLogRepo);
    expect(provider).toBeInstanceOf(CodexProvider);
  });

  it('returns null when codex binary is not found', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
    const provider = createCodexProvider(mockLogger, mockLogRepo);
    expect(provider).toBeNull();
  });
});
