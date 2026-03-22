import { CronJob } from 'cron';
import type { Logger } from 'pino';

export interface ScheduledJob {
  name: string;
  cronTime: string;
  handler: () => Promise<void>;
  jitterMs?: number;
}

export interface JobInfo {
  name: string;
  nextFire: Date | null;
}

export class Scheduler {
  private readonly jobs: Array<{ cron: CronJob; name: string }> = [];
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  register(job: ScheduledJob): void {
    const cronJob = CronJob.from({
      cronTime: job.cronTime,
      onTick: async () => {
        const jitter = job.jitterMs ? Math.round(Math.random() * job.jitterMs) : 0;
        if (jitter > 0) {
          this.logger.debug({ job: job.name, jitterMs: jitter }, 'Applying jitter delay');
          await new Promise((resolve) => setTimeout(resolve, jitter));
        }

        try {
          this.logger.info({ job: job.name }, 'Job started');
          await job.handler();
          this.logger.info({ job: job.name }, 'Job completed');
        } catch (error) {
          this.logger.error({ err: error, job: job.name }, 'Job failed');
        }
      },
      start: false,
      timeZone: 'UTC',
    });

    this.jobs.push({ cron: cronJob, name: job.name });
    this.logger.info({ job: job.name, cron: job.cronTime, jitterMs: job.jitterMs }, 'Job registered');
  }

  start(): void {
    for (const { cron } of this.jobs) {
      cron.start();
    }
    this.logger.info({ jobCount: this.jobs.length }, 'Scheduler started');
  }

  stop(): void {
    for (const { cron } of this.jobs) {
      cron.stop();
    }
    this.logger.info('Scheduler stopped');
  }

  getJobsInfo(): JobInfo[] {
    return this.jobs.map(({ cron, name }) => ({
      name,
      nextFire: cron.running ? cron.nextDate().toJSDate() : null,
    }));
  }
}

/**
 * Check if current hour (UTC) is within quiet hours (2-7 UTC).
 * Used to skip autonomous posting during low-engagement hours.
 */
export function isQuietHour(): boolean {
  const hour = new Date().getUTCHours();
  return hour >= 2 && hour < 7;
}

/**
 * Generate a random delay with jitter for human-like posting patterns.
 * Base interval ± jitterPercent%.
 */
export function jitteredDelay(baseMs: number, jitterPercent: number = 30): number {
  const factor = 1 + (Math.random() * 2 - 1) * (jitterPercent / 100);
  return Math.round(baseMs * factor);
}
