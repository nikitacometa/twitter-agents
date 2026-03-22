import { writeFileSync, renameSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { ActivityEvent, ActivityEventType, ActivityFeed, ActivityFeedStats } from './types.js';
import { pickTemplate, interpolate } from './templates.js';

export interface ActivityLoggerOptions {
  feedPath: string;
  getStats: () => ActivityFeedStats;
  logger: Logger;
  maxEvents?: number;
  debounceMs?: number;
}

export interface EmitOptions {
  type: ActivityEventType;
  narrative?: string;
  data?: Record<string, unknown>;
  expandable?: { title: string; content: string };
}

export class ActivityLogger {
  private readonly feedPath: string;
  private readonly getStats: () => ActivityFeedStats;
  private readonly logger: Logger;
  private readonly maxEvents: number;
  private readonly debounceMs: number;

  private events: ActivityEvent[] = [];
  private botStatus: 'online' | 'offline' | 'sleeping' = 'offline';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(opts: ActivityLoggerOptions) {
    this.feedPath = opts.feedPath;
    this.getStats = opts.getStats;
    this.logger = opts.logger;
    this.maxEvents = opts.maxEvents ?? 50;
    this.debounceMs = opts.debounceMs ?? 5000;

    // Ensure data directory exists
    const dir = dirname(this.feedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Startup recovery — load existing events
    this.loadExisting();
  }

  emit(opts: EmitOptions): void {
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    let narrative: string;
    if (opts.narrative) {
      narrative = opts.narrative;
    } else {
      const template = pickTemplate(opts.type, id);
      narrative = opts.data ? interpolate(template, opts.data) : template;
    }

    const event: ActivityEvent = {
      id,
      type: opts.type,
      timestamp,
      narrative,
      ...(opts.data ? { data: opts.data } : {}),
      ...(opts.expandable ? { expandable: opts.expandable } : {}),
    };

    // Prepend (newest first) and cap
    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    this.dirty = true;
    this.scheduleFlush();

    this.logger.debug(
      { eventType: opts.type, eventId: id, narrative: narrative.slice(0, 80) },
      'Activity event emitted',
    );
  }

  setStatus(status: 'online' | 'offline' | 'sleeping'): void {
    this.botStatus = status;
    this.dirty = true;
    this.scheduleFlush();
  }

  /**
   * Immediate flush — call during shutdown to ensure last events are written.
   */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.dirty) return;
    this.writeAtomic();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return; // already scheduled
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.dirty) {
        this.writeAtomic();
      }
    }, this.debounceMs);
  }

  private writeAtomic(): void {
    try {
      let stats: ActivityFeedStats;
      try {
        stats = this.getStats();
      } catch (err) {
        this.logger.warn({ err }, 'Failed to get stats for activity feed — using defaults');
        stats = { totalRoasts: 0, totalLikes: 0, stockpileSize: 0, burnedTokens: 0, uptime: '0m' };
      }

      const feed: ActivityFeed = {
        version: 1,
        botStatus: this.botStatus,
        lastUpdate: new Date().toISOString(),
        stats,
        events: this.events,
      };

      const json = JSON.stringify(feed, null, 2);
      const tmpPath = this.feedPath + '.tmp';

      writeFileSync(tmpPath, json, 'utf-8');
      renameSync(tmpPath, this.feedPath);
      this.dirty = false;

      this.logger.debug(
        { events: this.events.length, status: this.botStatus },
        'Activity feed flushed',
      );
    } catch (err) {
      this.logger.error({ err }, 'Failed to write activity feed — non-critical, continuing');
    }
  }

  private loadExisting(): void {
    try {
      if (!existsSync(this.feedPath)) return;

      const raw = readFileSync(this.feedPath, 'utf-8');
      const feed = JSON.parse(raw) as ActivityFeed;

      if (Array.isArray(feed.events)) {
        this.events = feed.events
          .filter(
            (e): e is ActivityEvent =>
              typeof e === 'object' &&
              e !== null &&
              typeof e.id === 'string' &&
              typeof e.timestamp === 'string' &&
              typeof e.narrative === 'string',
          )
          .slice(0, this.maxEvents);
        this.logger.info(
          { recoveredEvents: this.events.length },
          'Recovered activity events from previous session',
        );
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to load existing activity feed — starting fresh');
    }
  }
}
