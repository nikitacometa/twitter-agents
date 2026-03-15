import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../database.js';
import { QueueRepository } from './queue.repository.js';
import { logger } from '@common/utils/logger.js';

describe('QueueRepository', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: QueueRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-test-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    repo = new QueueRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('enqueues and dequeues by priority', () => {
    repo.enqueue({ targetName: 'Low', targetType: 'token', source: 'autonomous', priority: 1 });
    repo.enqueue({ targetName: 'High', targetType: 'token', source: 'burn_request', priority: 10 });
    repo.enqueue({ targetName: 'Mid', targetType: 'token', source: 'mention', priority: 5 });

    const first = repo.dequeue();
    expect(first).toBeDefined();
    expect(first!.targetName).toBe('High');
    expect(first!.status).toBe('processing');

    const second = repo.dequeue();
    expect(second!.targetName).toBe('Mid');
  });

  it('returns undefined when queue is empty', () => {
    expect(repo.dequeue()).toBeUndefined();
  });

  it('completes a queue item', () => {
    repo.enqueue({ targetName: 'A', targetType: 'project', source: 'autonomous', priority: 1 });
    const item = repo.dequeue()!;
    repo.complete(item.id);

    // Should not dequeue completed items
    expect(repo.dequeue()).toBeUndefined();
  });

  it('fails and retries an item', () => {
    repo.enqueue({ targetName: 'A', targetType: 'project', source: 'autonomous', priority: 1 });
    const item = repo.dequeue()!;
    repo.fail(item.id, 'timeout');

    // Item goes back to pending after failure (attempts < max_attempts)
    const retry = repo.dequeue();
    expect(retry).toBeDefined();
    expect(retry!.id).toBe(item.id);
    expect(retry!.attempts).toBe(1);
  });

  it('permanently fails after max attempts', () => {
    repo.enqueue({ targetName: 'A', targetType: 'project', source: 'autonomous', priority: 1 });

    for (let i = 0; i < 3; i++) {
      const item = repo.dequeue();
      if (item) repo.fail(item.id, `attempt ${String(i)}`);
    }

    // Should be permanently failed now (max_attempts = 3)
    expect(repo.dequeue()).toBeUndefined();
  });

  it('counts pending items', () => {
    repo.enqueue({ targetName: 'A', targetType: 'token', source: 'autonomous', priority: 1 });
    repo.enqueue({ targetName: 'B', targetType: 'token', source: 'autonomous', priority: 1 });
    expect(repo.getPendingCount()).toBe(2);

    repo.dequeue();
    expect(repo.getPendingCount()).toBe(1);
  });

  it('gets top items from queue', () => {
    repo.enqueue({ targetName: 'A', targetType: 'token', source: 'autonomous', priority: 1 });
    repo.enqueue({ targetName: 'B', targetType: 'token', source: 'burn_request', priority: 10 });

    const top = repo.getTop(5);
    expect(top).toHaveLength(2);
    expect(top[0]!.targetName).toBe('B');
  });

  it('rejects a queue item', () => {
    repo.enqueue({ targetName: 'A', targetType: 'project', source: 'autonomous', priority: 1 });
    const item = repo.dequeue()!;
    repo.reject(item.id);

    expect(repo.dequeue()).toBeUndefined();
    expect(repo.getPendingCount()).toBe(0);
  });
});
