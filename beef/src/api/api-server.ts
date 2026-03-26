import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { RoastRepository } from '@storage/repositories/roast.repository.js';
import type { QueueRepository } from '@storage/repositories/queue.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { HealthMonitor } from '@health/health-monitor.js';
import type { Scheduler } from '@scheduler/scheduler.js';

type RouteHandler = (url: URL) => unknown;

export interface ApiServerDeps {
  port: number;
  logger: Logger;
  stockpileRepo: StockpileRepository;
  roastRepo: RoastRepository;
  queueRepo: QueueRepository;
  configRepo: ConfigRepository;
  feedbackRepo: FeedbackRepository;
  healthMonitor: HealthMonitor;
  scheduler: Scheduler;
  provider: ProviderManager | null;
}

export class ApiServer {
  private server: Server | null = null;
  private readonly port: number;
  private readonly logger: Logger;
  private readonly routes: Map<string, RouteHandler>;

  constructor(private readonly deps: ApiServerDeps) {
    this.port = deps.port;
    this.logger = deps.logger;
    this.routes = this.buildRoutes();
  }

  private buildRoutes(): Map<string, RouteHandler> {
    const routes = new Map<string, RouteHandler>();
    const { stockpileRepo, roastRepo, queueRepo, configRepo, feedbackRepo, healthMonitor, scheduler, provider } =
      this.deps;

    routes.set('/api/health', () => healthMonitor.getStatus());

    routes.set('/api/status', () => {
      const health = healthMonitor.getStatus();
      const runtime = configRepo.getRuntime();
      const { approveMode, approveMentions, paused } = runtime;
      const providerMode = provider?.mode ?? 'unavailable';
      const stockpile = stockpileRepo.getStats();
      const queuePending = queueRepo.getPendingCount();
      const roastsToday = {
        autonomous: roastRepo.getTodayCount('autonomous'),
        mention: roastRepo.getTodayCount('mention'),
        reply_guy: roastRepo.getTodayCount('reply_guy'),
        casual_reply: roastRepo.getTodayCount('casual_reply'),
      };

      return {
        ...health,
        approveMode,
        approveMentions,
        paused,
        providerMode,
        stockpile: {
          total: stockpile.total,
          available: stockpile.byStatus['available'] ?? 0,
          avgScore: stockpile.avgScore,
        },
        queuePending,
        roastsToday,
      };
    });

    routes.set('/api/queue', () => {
      const pending = queueRepo.getPendingCount();
      const top = queueRepo.getTop(10);
      return { pending, items: top };
    });

    routes.set('/api/stockpile', (url) => {
      const target = url.searchParams.get('target');
      if (target) {
        const items = stockpileRepo.getByTarget(target);
        return { target, count: items.length, items };
      }
      const stats = stockpileRepo.getStats();
      const topTargets = stockpileRepo.getTopTargets(15);
      return { stats, topTargets };
    });

    routes.set('/api/stockpile/top', (url) => {
      const n = parseInt(url.searchParams.get('n') ?? '10', 10);
      const limit = Math.min(Math.max(Number.isFinite(n) ? n : 10, 1), 50);
      const items = stockpileRepo.getExportable(limit);
      return { count: items.length, items };
    });

    routes.set('/api/stockpile/unrated', (url) => {
      const n = parseInt(url.searchParams.get('n') ?? '20', 10);
      const limit = Math.min(Math.max(Number.isFinite(n) ? n : 20, 1), 50);
      const items = stockpileRepo.getUnrated(limit);
      return { count: items.length, items };
    });

    routes.set('/api/pending', () => {
      const pending = roastRepo.getPendingApproval();
      return { count: pending.length, items: pending };
    });

    routes.set('/api/scheduler', () => {
      const jobs = scheduler.getJobsInfo();
      return {
        jobs: jobs.map((j) => ({
          name: j.name,
          nextFire: j.nextFire?.toISOString() ?? null,
        })),
      };
    });

    routes.set('/api/feedback', () => {
      const stats = feedbackRepo.getStats();
      return stats;
    });

    return routes;
  }

  start(): void {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      const url = new URL(req.url ?? '/', `http://localhost:${String(this.port)}`);
      const handler = this.routes.get(url.pathname);

      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found', routes: [...this.routes.keys()] }));
        return;
      }

      const start = Date.now();
      try {
        const data = handler(url);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        this.logger.debug({ path: url.pathname, ms: Date.now() - start }, 'api request');
      } catch (err) {
        this.logger.error({ err, path: url.pathname, ms: Date.now() - start }, 'API route error');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.logger.warn({ port: this.port }, 'API server port in use — running without API');
      } else {
        this.logger.error({ err, port: this.port }, 'API server error');
      }
      this.server = null;
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      this.logger.info({ port: this.port, routes: [...this.routes.keys()] }, 'API server started (localhost only)');
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.logger.info('API server stopped');
    }
  }
}
