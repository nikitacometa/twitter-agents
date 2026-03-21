import { createServer, type Server } from 'node:http';
import type { Logger } from 'pino';
import type Database from 'better-sqlite3';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  beefEnv: string;
  uptime: number;
  db: boolean;
  twitter: boolean;
  provider: boolean;
  queuePending: number;
  roastsToday: number;
  apiUsage?: { posts: number; reads: number };
  lastCheck: string;
}

export class HealthMonitor {
  private server: Server | null = null;
  private readonly port: number;
  private readonly logger: Logger;
  private readonly db: Database.Database;
  private readonly checks: {
    isTwitterConfigured: () => boolean;
    isProviderAvailable: () => boolean;
    getQueuePending: () => number;
    getRoastsToday: () => number;
    getApiUsage?: () => { posts: number; reads: number };
  };
  private readonly beefEnv: string;
  private readonly startTime = Date.now();

  constructor(opts: {
    port?: number;
    logger: Logger;
    db: Database.Database;
    beefEnv?: string;
    checks: {
      isTwitterConfigured: () => boolean;
      isProviderAvailable: () => boolean;
      getQueuePending: () => number;
      getRoastsToday: () => number;
      getApiUsage?: () => { posts: number; reads: number };
    };
  }) {
    this.port = opts.port ?? 3000;
    this.logger = opts.logger;
    this.db = opts.db;
    this.beefEnv = opts.beefEnv ?? 'unknown';
    this.checks = opts.checks;
  }

  getStatus(): HealthStatus {
    let dbOk = false;
    try {
      this.db.prepare('SELECT 1').get();
      dbOk = true;
    } catch {
      // db unavailable
    }

    const twitter = this.checks.isTwitterConfigured();
    const provider = this.checks.isProviderAvailable();

    let queuePending = 0;
    let roastsToday = 0;
    if (dbOk) {
      try {
        queuePending = this.checks.getQueuePending();
        roastsToday = this.checks.getRoastsToday();
      } catch {
        dbOk = false;
      }
    }

    const status = !dbOk ? 'error' : !provider ? 'degraded' : 'ok';

    const apiUsage = this.checks.getApiUsage?.();

    return {
      status,
      beefEnv: this.beefEnv,
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      db: dbOk,
      twitter,
      provider,
      queuePending,
      roastsToday,
      ...(apiUsage ? { apiUsage } : {}),
      lastCheck: new Date().toISOString(),
    };
  }

  start(): void {
    this.server = createServer((req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        const health = this.getStatus();
        const statusCode = health.status === 'error' ? 503 : 200;

        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.logger.warn({ port: this.port }, 'Health monitor port in use — running without health endpoint');
      } else {
        this.logger.error({ err, port: this.port }, 'Health monitor server error');
      }
      this.server = null;
    });

    this.server.listen(this.port, () => {
      this.logger.info({ port: this.port }, 'Health monitor HTTP server started');
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.logger.info('Health monitor stopped');
    }
  }
}
