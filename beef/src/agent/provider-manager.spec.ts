import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderManager, type Alerter } from './provider-manager.js';
import {
  type AgentResult,
  type AgentTask,
  type LLMProvider,
  type ProviderCapabilities,
  type ProviderName,
  TaskRequiresResearchError,
} from './agent.types.js';

function createMockProvider(
  name: ProviderName,
  capabilities: Partial<ProviderCapabilities> = {},
): LLMProvider & {
  run: ReturnType<typeof vi.fn>;
  healthCheck: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
} {
  return {
    name,
    capabilities: {
      hasPerplexity: name === 'claude-code',
      hasWebSearch: name === 'claude-code',
      hasFileAccess: name === 'claude-code',
      maxTurns: name === 'claude-code' ? 25 : 1,
      ...capabilities,
    },
    run: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
    shutdown: vi.fn(),
  };
}

function createMockAlerter(): Alerter & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

function makeTask(requiresResearch: boolean): AgentTask {
  return {
    prompt: 'test prompt',
    requiresResearch,
  };
}

function makeResult<T>(data: T, provider: ProviderName): AgentResult<T> {
  return { data, durationMs: 100, provider };
}

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

describe('ProviderManager', () => {
  let primary: ReturnType<typeof createMockProvider>;
  let fallback: ReturnType<typeof createMockProvider>;
  let alerter: ReturnType<typeof createMockAlerter>;
  let manager: ProviderManager;

  beforeEach(() => {
    primary = createMockProvider('claude-code');
    fallback = createMockProvider('anthropic-sdk');
    alerter = createMockAlerter();
    manager = new ProviderManager(primary, fallback, alerter, mockLogger);
  });

  it('uses primary provider by default', async () => {
    primary.run.mockResolvedValue(makeResult({ ok: true }, 'claude-code'));

    const result = await manager.run('test-1', makeTask(false));
    expect(result.provider).toBe('claude-code');
    expect(primary.run).toHaveBeenCalledOnce();
    expect(fallback.run).not.toHaveBeenCalled();
  });

  it('stays in primary mode after successful call', async () => {
    primary.run.mockResolvedValue(makeResult({ ok: true }, 'claude-code'));

    await manager.run('test-1', makeTask(true));
    expect(manager.mode).toBe('primary');
  });

  it('falls back to SDK after 3 primary failures for non-research tasks', async () => {
    primary.run.mockRejectedValue(new Error('CLI down'));
    fallback.run.mockResolvedValue(makeResult({ ok: true }, 'anthropic-sdk'));

    // First 3 calls fail on primary, 3rd triggers degraded mode
    for (let i = 0; i < 2; i++) {
      await expect(manager.run(`fail-${String(i)}`, makeTask(false))).rejects.toThrow();
    }

    // 3rd failure + fallback
    const result = await manager.run('fallback-1', makeTask(false));
    expect(result.provider).toBe('anthropic-sdk');
    expect(manager.mode).toBe('degraded');
    expect(alerter.send).toHaveBeenCalledWith(
      expect.stringContaining('Degraded mode'),
    );
  });

  it('rejects research tasks in degraded mode', async () => {
    primary.run.mockRejectedValue(new Error('CLI down'));
    fallback.run.mockResolvedValue(makeResult({ ok: true }, 'anthropic-sdk'));

    // Trigger degraded mode
    for (let i = 0; i < 3; i++) {
      try {
        await manager.run(`fail-${String(i)}`, makeTask(false));
      } catch {
        // expected
      }
    }

    expect(manager.mode).toBe('degraded');
    await expect(manager.run('research-1', makeTask(true))).rejects.toThrow(
      TaskRequiresResearchError,
    );
  });

  it('retries primary on every call even after threshold failures (no fallback)', async () => {
    const managerNoFallback = new ProviderManager(primary, null, alerter, mockLogger);
    primary.run.mockRejectedValue(new Error('CLI down'));

    for (let i = 0; i < 4; i++) {
      await expect(
        managerNoFallback.run(`fail-${String(i)}`, makeTask(false)),
      ).rejects.toThrow('CLI down');
    }

    // All 4 calls tried primary — no blocking
    expect(primary.run).toHaveBeenCalledTimes(4);
    expect(managerNoFallback.mode).toBe('primary');
  });

  it('recovers to primary mode after successful primary call', async () => {
    primary.run
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockRejectedValueOnce(new Error('fail 3'))
      .mockResolvedValueOnce(makeResult({ ok: true }, 'claude-code'));
    fallback.run.mockResolvedValue(makeResult({ ok: true }, 'anthropic-sdk'));

    // Trigger degraded
    for (let i = 0; i < 3; i++) {
      try {
        await manager.run(`fail-${String(i)}`, makeTask(false));
      } catch {
        // expected
      }
    }
    expect(manager.mode).toBe('degraded');

    // Primary recovers — next non-research call goes through primary
    // (ProviderManager tries primary first even in degraded mode)
    // Actually in degraded mode it still tries primary first
    const result = await manager.run('recover-1', makeTask(false));
    expect(result.provider).toBe('claude-code');
    expect(manager.mode).toBe('primary');
  });

  it('shuts down both providers', () => {
    manager.shutdown();
    expect(primary.shutdown).toHaveBeenCalledOnce();
    expect(fallback.shutdown).toHaveBeenCalledOnce();
  });

  it('health check returns true if primary is healthy', async () => {
    primary.healthCheck.mockResolvedValue(true);
    expect(await manager.healthCheck()).toBe(true);
  });

  it('health check falls back to SDK if primary is down', async () => {
    primary.healthCheck.mockResolvedValue(false);
    fallback.healthCheck.mockResolvedValue(true);
    expect(await manager.healthCheck()).toBe(true);
  });

  it('health check returns false if both are down', async () => {
    primary.healthCheck.mockResolvedValue(false);
    fallback.healthCheck.mockResolvedValue(false);
    expect(await manager.healthCheck()).toBe(false);
  });
});
