import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActivityLogger } from './activity-logger.js';
import type { ActivityFeed, ActivityFeedStats } from './types.js';

const TEST_DIR = resolve(import.meta.dirname ?? '.', '../../data/test-activity');
const TEST_FEED_PATH = resolve(TEST_DIR, 'activity-feed.json');

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  } as unknown as import('pino').Logger;
}

function makeStats(): ActivityFeedStats {
  return { totalRoasts: 42, totalLikes: 100, stockpileSize: 10, burnedTokens: 0, uptime: '1d 2h 30m' };
}

function readFeed(): ActivityFeed {
  return JSON.parse(readFileSync(TEST_FEED_PATH, 'utf-8')) as ActivityFeed;
}

describe('ActivityLogger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should emit an event and flush to valid JSON', () => {
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: makeLogger(),
      debounceMs: 100,
    });

    logger.emit({ type: 'wake' });
    logger.flush();

    expect(existsSync(TEST_FEED_PATH)).toBe(true);
    const feed = readFeed();
    expect(feed.version).toBe(1);
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0]!.type).toBe('wake');
    expect(feed.events[0]!.narrative).toBeTruthy();
    expect(feed.events[0]!.id).toBeTruthy();
    expect(feed.events[0]!.timestamp).toBeTruthy();
  });

  it('should use provided narrative instead of template', () => {
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: makeLogger(),
    });

    logger.emit({ type: 'think', narrative: 'custom thought from LLM' });
    logger.flush();

    const feed = readFeed();
    expect(feed.events[0]!.narrative).toBe('custom thought from LLM');
  });

  it('should interpolate template variables from data', () => {
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: makeLogger(),
    });

    logger.emit({ type: 'target_locked', data: { target: 'SomeToken' } });
    logger.flush();

    const feed = readFeed();
    // Templates for target_locked use {target} — it should be replaced
    expect(feed.events[0]!.narrative).not.toContain('{target}');
    expect(feed.events[0]!.narrative).toContain('SomeToken');
  });

  it('should cap events at maxEvents (newest first)', () => {
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: makeLogger(),
      maxEvents: 3,
    });

    logger.emit({ type: 'wake', narrative: 'first' });
    logger.emit({ type: 'hunt', narrative: 'second' });
    logger.emit({ type: 'cooking', narrative: 'third' });
    logger.emit({ type: 'posted', narrative: 'fourth' });
    logger.flush();

    const feed = readFeed();
    expect(feed.events).toHaveLength(3);
    expect(feed.events[0]!.narrative).toBe('fourth');
    expect(feed.events[1]!.narrative).toBe('third');
    expect(feed.events[2]!.narrative).toBe('second');
  });

  it('should debounce writes', () => {
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: makeLogger(),
      debounceMs: 1000,
    });

    logger.emit({ type: 'wake', narrative: 'first' });
    expect(existsSync(TEST_FEED_PATH)).toBe(false);

    logger.emit({ type: 'hunt', narrative: 'second' });
    expect(existsSync(TEST_FEED_PATH)).toBe(false);

    // Advance timer past debounce
    vi.advanceTimersByTime(1100);

    expect(existsSync(TEST_FEED_PATH)).toBe(true);
    const feed = readFeed();
    expect(feed.events).toHaveLength(2);
  });

  it('should not write when not dirty', () => {
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: makeLogger(),
    });

    logger.flush(); // nothing emitted
    expect(existsSync(TEST_FEED_PATH)).toBe(false);
  });

  it('should update botStatus', () => {
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: makeLogger(),
    });

    logger.setStatus('online');
    logger.emit({ type: 'wake', narrative: 'up' });
    logger.flush();

    let feed = readFeed();
    expect(feed.botStatus).toBe('online');

    logger.setStatus('sleeping');
    logger.flush();

    feed = readFeed();
    expect(feed.botStatus).toBe('sleeping');
  });

  it('should include stats from getStats callback', () => {
    const stats = makeStats();
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: () => stats,
      logger: makeLogger(),
    });

    logger.emit({ type: 'wake', narrative: 'up' });
    logger.flush();

    const feed = readFeed();
    expect(feed.stats.totalRoasts).toBe(42);
    expect(feed.stats.totalLikes).toBe(100);
    expect(feed.stats.stockpileSize).toBe(10);
    expect(feed.stats.uptime).toBe('1d 2h 30m');
  });

  it('should recover events from existing file on startup', () => {
    // Write a pre-existing feed file
    const existingFeed: ActivityFeed = {
      version: 1,
      botStatus: 'offline',
      lastUpdate: new Date().toISOString(),
      stats: makeStats(),
      events: [
        { id: 'old-1', type: 'posted', timestamp: '2026-03-22T00:00:00Z', narrative: 'old event 1' },
        { id: 'old-2', type: 'think', timestamp: '2026-03-22T00:01:00Z', narrative: 'old event 2' },
      ],
    };
    writeFileSync(TEST_FEED_PATH, JSON.stringify(existingFeed));

    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: makeLogger(),
    });

    // Emit a new event — should be prepended to recovered events
    logger.emit({ type: 'wake', narrative: 'new session' });
    logger.flush();

    const feed = readFeed();
    expect(feed.events).toHaveLength(3);
    expect(feed.events[0]!.narrative).toBe('new session');
    expect(feed.events[1]!.id).toBe('old-1');
    expect(feed.events[2]!.id).toBe('old-2');
  });

  it('should handle corrupted existing file gracefully', () => {
    writeFileSync(TEST_FEED_PATH, 'not valid json {{{');

    const mockLogger = makeLogger();
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: mockLogger,
    });

    logger.emit({ type: 'wake', narrative: 'fresh start' });
    logger.flush();

    const feed = readFeed();
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0]!.narrative).toBe('fresh start');
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should include expandable field when provided', () => {
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: makeLogger(),
    });

    logger.emit({
      type: 'roast_ready',
      narrative: 'cooked',
      data: { target: 'X', score: 4.2 },
      expandable: { title: 'Full roast', content: 'the devastating roast text' },
    });
    logger.flush();

    const feed = readFeed();
    expect(feed.events[0]!.expandable).toEqual({
      title: 'Full roast',
      content: 'the devastating roast text',
    });
  });

  it('should handle getStats failure gracefully', () => {
    const mockLogger = makeLogger();
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: () => { throw new Error('db crashed'); },
      logger: mockLogger,
    });

    logger.emit({ type: 'error', narrative: 'something broke' });
    logger.flush();

    const feed = readFeed();
    expect(feed.stats.totalRoasts).toBe(0);
    expect(feed.events).toHaveLength(1);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should produce valid JSON with correct lastUpdate timestamp', () => {
    const logger = new ActivityLogger({
      feedPath: TEST_FEED_PATH,
      getStats: makeStats,
      logger: makeLogger(),
    });

    logger.emit({ type: 'wake', narrative: 'test' });
    logger.flush();

    const feed = readFeed();
    expect(() => new Date(feed.lastUpdate)).not.toThrow();
    expect(new Date(feed.lastUpdate).getTime()).toBeGreaterThan(0);
  });
});
