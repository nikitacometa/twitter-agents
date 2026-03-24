import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

// Mock child_process before importing provider
const mockSpawn = vi.fn();
const mockExecFileSync = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

// Mock fs operations
const mockReadFile = vi.fn();
const mockUnlink = vi.fn();
const mockMkdtemp = vi.fn();
const mockWriteFile = vi.fn();
const mockRmdir = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  mkdtemp: (...args: unknown[]) => mockMkdtemp(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rmdir: (...args: unknown[]) => mockRmdir(...args),
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
    provider = new CodexProvider(mockLogger, mockLogRepo);
  });

  afterEach(() => {
    provider.shutdown();
  });

  it('has correct capabilities', () => {
    expect(provider.name).toBe('codex');
    expect(provider.capabilities).toEqual({
      hasPerplexity: false,
      hasWebSearch: true,
      hasFileAccess: false,
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
    mockUnlink.mockResolvedValue(undefined);
    mockRmdir.mockResolvedValue(undefined);

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
    expect(args).toContain('-o');
    const oIdx = args.indexOf('-o');
    expect(args[oIdx + 1]).toBe(join(tmpDir, 'output.json'));
  });

  it('rejects on non-zero exit code', async () => {
    mockMkdtemp.mockResolvedValue('/tmp/codex-fail');
    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child);
    mockUnlink.mockResolvedValue(undefined);
    mockRmdir.mockResolvedValue(undefined);

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
    mockUnlink.mockResolvedValue(undefined);
    mockRmdir.mockResolvedValue(undefined);

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
    mockUnlink.mockResolvedValue(undefined);
    mockRmdir.mockResolvedValue(undefined);

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
