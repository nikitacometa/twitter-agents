import { createServer, type Server } from 'node:http';
import type { Logger } from 'pino';
import type Database from 'better-sqlite3';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  db: boolean;
  twitter: boolean;
  provider: boolean;
  queuePending: number;
  roastsToday: number;
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
  };
  private readonly startTime = Date.now();

  constructor(opts: {
    port?: number;
    logger: Logger;
    db: Database.Database;
    checks: {
      isTwitterConfigured: () => boolean;
      isProviderAvailable: () => boolean;
      getQueuePending: () => number;
      getRoastsToday: () => number;
    };
  }) {
    this.port = opts.port ?? 3000;
    this.logger = opts.logger;
    this.db = opts.db;
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
    const queuePending = this.checks.getQueuePending();
    const roastsToday = this.checks.getRoastsToday();

    const status = !dbOk ? 'error' : !provider ? 'degraded' : 'ok';

    return {
      status,
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      db: dbOk,
      twitter,
      provider,
      queuePending,
      roastsToday,
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
