import type { Logger } from 'pino';
import type { MetricsRepository, BotTweetRow } from './metrics.repository.js';
import type { TimelineSyncResult } from './timeline-syncer.js';
import type { RefreshResult } from './metrics-refresher.js';

export interface ReportData {
  syncResult: TimelineSyncResult;
  refreshResult: RefreshResult;
  stats: ReturnType<MetricsRepository['getTweetStats']>;
  account: ReturnType<MetricsRepository['getLatestAccountSnapshot']>;
  topTweets: BotTweetRow[];
  worstTweets: BotTweetRow[];
  suppressed: BotTweetRow[];
  deleted: BotTweetRow[];
  byHour: Array<{ hour: number; avg_er: number; count: number }>;
  byType: Array<{ is_reply: number; avg_er: number; avg_impressions: number; count: number }>;
  monthlyReads: number;
  totalReadsUsed: number;
}

export class ReportGenerator {
  private readonly repo: MetricsRepository;

  constructor(opts: { repo: MetricsRepository; logger: Logger }) {
    this.repo = opts.repo;
  }

  gatherData(syncResult: TimelineSyncResult, refreshResult: RefreshResult): ReportData {
    this.repo.recomputeDailyMetrics();

    return {
      syncResult,
      refreshResult,
      stats: this.repo.getTweetStats(),
      account: this.repo.getLatestAccountSnapshot(),
      topTweets: this.repo.getTopTweets(5, 7),
      worstTweets: this.repo.getWorstTweets(3, 7),
      suppressed: this.repo.getSuppressedTweets(),
      deleted: this.repo.getDeletedTweets(),
      byHour: this.repo.getEngagementByHour(),
      byType: this.repo.getEngagementByType(),
      monthlyReads: this.repo.getMonthlyApiReads(),
      totalReadsUsed: syncResult.readsUsed + refreshResult.readsUsed,
    };
  }

  formatTerminalReport(data: ReportData): string {
    const lines: string[] = [];
    const { syncResult, refreshResult, stats, account, topTweets, suppressed, deleted, byHour, byType, monthlyReads, totalReadsUsed } = data;

    lines.push('');
    lines.push(`Metrics Sync — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    lines.push('');

    // Sync summary
    lines.push(
      `Timeline: ${syncResult.newTweets} new tweets, ${refreshResult.deleted} deleted, ${stats.live} total live`,
    );
    lines.push(
      `Metrics:  ${refreshResult.updated} updated, ${refreshResult.skipped} skipped (API calls: ${syncResult.apiCallsUsed + refreshResult.apiCallsUsed})`,
    );

    // Account
    if (account) {
      lines.push(`Account:  ${fmtNum(account.followers)} followers, ${fmtNum(account.tweetCount)} tweets`);
    }

    lines.push('');

    // Overall stats
    if (stats.total > 0) {
      lines.push('-- All Time --');
      lines.push(
        `  Tweets: ${stats.total}  |  Impressions: ${fmtNum(stats.totalImpressions)}  |  Likes: ${fmtNum(stats.totalLikes)}  |  Avg ER: ${fmtPct(stats.avgEngagementRate)}`,
      );
      lines.push('');
    }

    // Top performers (7 days)
    if (topTweets.length > 0) {
      lines.push('-- Top Performers (7d) --');
      for (const t of topTweets) {
        const preview = truncate(t.text, 55);
        lines.push(
          `  ${fmtNum(t.impressions)} imp, ${fmtPct(t.engagement_rate)} ER  "${preview}"`,
        );
      }
      lines.push('');
    }

    // Suppressed tweets
    if (suppressed.length > 0) {
      lines.push(`-- Anomalies (possible suppression): ${suppressed.length} tweets --`);
      for (const t of suppressed.slice(0, 5)) {
        const preview = truncate(t.text, 50);
        const age = getAgeLabel(t.created_at);
        lines.push(
          `  ${t.impressions} imp (${age}, ${t.is_reply ? 'reply' : 'original'})  "${preview}"`,
        );
      }
      lines.push('');
    }

    // Deleted tweets
    if (deleted.length > 0) {
      lines.push(`-- Deleted by Twitter: ${deleted.length} tweets --`);
      for (const t of deleted.slice(0, 3)) {
        const preview = truncate(t.text, 60);
        lines.push(`  ${t.tweet_id}  "${preview}"`);
      }
      lines.push('');
    }

    // Engagement by type
    if (byType.length > 0) {
      lines.push('-- Engagement by Type --');
      for (const row of byType) {
        const label = row.is_reply ? 'Replies' : 'Original';
        lines.push(
          `  ${label}: ${fmtPct(row.avg_er)} avg ER, ${Math.round(row.avg_impressions)} avg imp (n=${row.count})`,
        );
      }
      lines.push('');
    }

    // Best hours
    if (byHour.length > 0) {
      const top3 = byHour.slice(0, 3);
      lines.push('-- Best Hours (UTC) --');
      for (const row of top3) {
        lines.push(
          `  ${String(row.hour).padStart(2, '0')}:00  ${fmtPct(row.avg_er)} avg ER (n=${row.count})`,
        );
      }
      lines.push('');
    }

    // API budget
    const budgetPct = ((monthlyReads + totalReadsUsed) / 10_000 * 100).toFixed(1);
    lines.push(`API Budget: ${fmtNum(monthlyReads + totalReadsUsed)} / 10,000 reads this month (${budgetPct}%)`);
    lines.push('');

    return lines.join('\n');
  }

  /** Build Telegram message — only sent on events. */
  formatTelegramAlert(data: ReportData): string | null {
    const parts: string[] = [];

    // Deleted tweets — always alert
    if (data.refreshResult.deleted > 0) {
      parts.push(`Twitter deleted ${data.refreshResult.deleted} tweet(s)`);
      for (const t of data.deleted.slice(0, 3)) {
        parts.push(`  "${truncate(t.text, 60)}"`);
      }
    }

    // Suppressed tweets
    if (data.suppressed.length > 0) {
      parts.push(`${data.suppressed.length} tweet(s) with abnormally low impressions (possible shadowban)`);
    }

    // Viral tweets (> 3x avg engagement rate)
    const avgEr = data.stats.avgEngagementRate ?? 0;
    if (avgEr > 0) {
      const viral = data.topTweets.filter((t) => (t.engagement_rate ?? 0) > avgEr * 3);
      for (const t of viral) {
        parts.push(`Viral: "${truncate(t.text, 50)}" — ${fmtNum(t.impressions)} imp, ${fmtPct(t.engagement_rate)} ER`);
      }
    }

    if (parts.length === 0) return null;

    const header = `Metrics Sync ${new Date().toISOString().slice(0, 10)}`;
    const account = data.account ? ` | ${fmtNum(data.account.followers)} followers` : '';
    return `${header}${account}\n\n${parts.join('\n\n')}`;
  }
}

// --- Helpers ---

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return 'N/A';
  return `${(n * 100).toFixed(2)}%`;
}

function truncate(text: string, maxLen: number): string {
  const clean = text.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

function getAgeLabel(createdAt: string): string {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ageMs / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
