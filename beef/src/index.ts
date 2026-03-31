import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Load order: CLI env vars > .env.{BEEF_ENV} > .env (dotenv never overrides existing)
const beefEnv = process.env.BEEF_ENV || 'test';
dotenv.config({ path: resolve(process.cwd(), `.env.${beefEnv}`) });
dotenv.config();

import { validateEnv } from './common/config/env.validation.js';
import { logger } from './common/utils/logger.js';
import { createDatabase } from './storage/database.js';
import { LlmLogRepository } from './storage/repositories/llm-log.repository.js';
import { FeedbackRepository } from './storage/repositories/feedback.repository.js';
import { QueueRepository } from './storage/repositories/queue.repository.js';
import { RoastRepository } from './storage/repositories/roast.repository.js';
import { ConfigRepository } from './storage/repositories/config.repository.js';
import { MentionRepository } from './storage/repositories/mention.repository.js';
import { UserRepository } from './storage/repositories/user.repository.js';
import { ExternalExampleRepository } from './storage/repositories/external-example.repository.js';
import { RoastPatternRepository } from './storage/repositories/roast-pattern.repository.js';
import { StockpileRepository } from './storage/repositories/stockpile.repository.js';
import { FarmAttemptRepository } from './storage/repositories/farm-attempt.repository.js';
import { TweetRepository } from './storage/repositories/tweet.repository.js';
import { MetricsRepository } from './metrics/metrics.repository.js';
import { TargetRepository } from './storage/repositories/target.repository.js';
import type { ScoredTweet } from './monitor/tweet-scorer.js';
import { ClaudeCodeProvider } from './agent/claude-code.provider.js';
import { createCodexProvider } from './agent/codex.provider.js';
import {
  createAnthropicSDKProvider,
} from './agent/anthropic-sdk.provider.js';
import type { LLMProvider } from './agent/agent.types.js';
import { ProviderManager } from './agent/provider-manager.js';
import { createBot } from './admin/bot.js';
import type { ITwitterClient, IProfileFetcher } from './twitter/twitter-client.interface.js';
import { TwitterClient } from './twitter/twitter-client.js';
import { ScraperTwitterClient } from './twitter/scraper-twitter-client.js';
import { PlaywrightTwitterClient } from './twitter/playwright-twitter-client.js';
import { HybridTwitterClient } from './twitter/hybrid-twitter-client.js';
import { MentionHandler } from './twitter/mention-handler.js';
import { Scheduler } from './scheduler/scheduler.js';
import { QueueManager } from './queue/queue-manager.js';
import type { QueueProcessResult } from './queue/queue-manager.js';
import { EngagementTracker } from './learning/engagement-tracker.js';
import { HealthMonitor } from './health/health-monitor.js';
import { CachedProfileFetcher } from './twitter/cached-profile-fetcher.js';
import { TwitterEnricher } from './farm/twitter-enricher.js';
import { ActivityLogger } from './activity/activity-logger.js';
import { ImgflipClient } from './meme/imgflip-client.js';
import { MemeHistoryRepository } from './meme/meme-history.repository.js';
import { MemeGenerator } from './meme/meme-generator.js';
import { ApiServer } from './api/api-server.js';

const config = validateEnv();

const botUsername = config.TWITTER_BOT_USERNAME || config.TWITTER_USERNAME || '0xBeefer';

logger.info(
  {
    botName: config.BOT_NAME,
    beefEnv: config.BEEF_ENV,
    nodeEnv: config.NODE_ENV,
    twitterMode: config.TWITTER_CLIENT_MODE,
    twitterEnabled: config.ENABLE_TWITTER,
    dryRun: config.DRY_RUN,
    botUsername,
  },
  `Starting $BEEF roast bot [${config.BEEF_ENV.toUpperCase()}]`,
);

// --- Database ---
const db = createDatabase(config.DB_PATH, logger);
const llmLogRepo = new LlmLogRepository(db);
const feedbackRepo = new FeedbackRepository(db);
const queueRepo = new QueueRepository(db);
const roastRepo = new RoastRepository(db);
const configRepo = new ConfigRepository(db);
const mentionRepo = new MentionRepository(db);
const userRepo = new UserRepository(db);
const exampleRepo = new ExternalExampleRepository(db);
const patternRepo = new RoastPatternRepository(db);
const stockpileRepo = new StockpileRepository(db);
const farmAttemptRepo = new FarmAttemptRepository(db);
const tweetRepo = new TweetRepository(db);
const targetRepo = new TargetRepository(db);
const metricsRepo = new MetricsRepository(db);

// --- Recover stuck queue items from previous crash ---
const resetCount = queueRepo.resetProcessing();
if (resetCount > 0) {
  logger.warn({ resetCount }, 'Reset stuck processing queue items back to pending');
}
const rescuedCount = queueRepo.rescueFailedMentions();
if (rescuedCount > 0) {
  logger.info({ rescuedCount }, 'Rescued failed mention queue items back to pending');
}

// --- Activity Feed ---
const startTime = Date.now();

function formatUptime(start: number): string {
  const ms = Date.now() - start;
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${String(days)}d`);
  if (hours > 0 || days > 0) parts.push(`${String(hours)}h`);
  parts.push(`${String(minutes)}m`);
  return parts.join(' ');
}

let activityLogger: ActivityLogger | undefined;
if (config.ACTIVITY_FEED_ENABLED) {
  try {
    activityLogger = new ActivityLogger({
      feedPath: resolve(process.cwd(), config.ACTIVITY_FEED_PATH),
      getStats: () => ({
        totalRoasts: roastRepo.getTotalCount(),
        totalLikes: roastRepo.getTotalLikes(),
        stockpileSize: stockpileRepo.getStats().byStatus['available'] ?? 0,
        burnedTokens: 0,
        uptime: formatUptime(startTime),
      }),
      logger,
    });

    activityLogger.emit({ type: 'wake' });
    activityLogger.setStatus('online');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize ActivityLogger — feed disabled for this session');
  }
}

// --- LLM Providers (optional — bot works without them for manual eval) ---
let provider: ProviderManager | null = null;
const sdk = createAnthropicSDKProvider(config.ANTHROPIC_API_KEY, logger, llmLogRepo);
try {
  const primary = new ClaudeCodeProvider(logger, llmLogRepo, { maxConcurrent: 3 });

  const fallbacks: LLMProvider[] = [];
  if (config.CODEX_ENABLED) {
    const codex = createCodexProvider(logger, llmLogRepo);
    if (codex) fallbacks.push(codex);
  }
  if (sdk) fallbacks.push(sdk);

  const alerter = {
    send: async (msg: string) => {
      logger.warn({ alert: msg }, 'Provider alert');
      if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
        try {
          const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
          const escaped = msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c);
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.TELEGRAM_CHAT_ID,
              text: `🤖 <b>LLM Provider</b>\n\n${escaped}`,
              parse_mode: 'HTML',
            }),
          });
        } catch (err) {
          logger.error({ err }, 'Failed to send alert to Telegram');
        }
      }
    },
  };
  provider = new ProviderManager(primary, fallbacks, alerter, logger);
  logger.info({ fallbacks: fallbacks.map((f) => f.name) }, 'LLM providers initialized');
} catch (error) {
  logger.warn({ err: error }, 'LLM providers not available — manual eval only');
}

// --- Twitter Client (only when ENABLE_TWITTER=true) ---
let twitter: ITwitterClient | undefined;
let profileFetcher: IProfileFetcher | undefined;
let twitterEnricher: TwitterEnricher | undefined;
let mentionHandler: MentionHandler | undefined;
let playwrightClientRef: PlaywrightTwitterClient | undefined;
let engagementTracker: EngagementTracker | undefined;

if (config.ENABLE_TWITTER) {
  if (config.TWITTER_CLIENT_MODE === 'scraper' && config.TWITTER_USERNAME && config.TWITTER_PASSWORD) {
    const scraperClient = new ScraperTwitterClient({
      credentials: {
        username: config.TWITTER_USERNAME,
        password: config.TWITTER_PASSWORD,
        phone: config.TWITTER_PHONE,
        twoFactorSecret: config.TWITTER_2FA_SECRET,
      },
      dryRun: config.DRY_RUN,
      logger,
      onSessionExpired: () => {
        logger.error('Twitter session expired — notifying admins');
        if (bot && config.TELEGRAM_ADMIN_IDS.length > 0) {
          const msg = '🚨 <b>Twitter session expired!</b>\nCookies need manual refresh. Bot cannot post until cookies are updated.';
          for (const adminId of config.TELEGRAM_ADMIN_IDS) {
            bot.api.sendMessage(adminId, msg, { parse_mode: 'HTML' }).catch((err) => {
              logger.warn({ err, adminId }, 'Failed to send session expiry alert');
            });
          }
        }
      },
    });

    try {
      await scraperClient.initialize();
      twitter = scraperClient;
      profileFetcher = new CachedProfileFetcher({
        inner: scraperClient,
        targetRepo,
        logger,
      });
      twitterEnricher = new TwitterEnricher({ scraper: scraperClient.scraper, logger });
      logger.info('Twitter client: scraper mode (cookie auth)');
    } catch (error) {
      logger.error({ err: error }, 'Scraper login failed — falling back to API mode');
      const fallbackClient = new TwitterClient({ dryRun: config.DRY_RUN, logger });
      twitter = fallbackClient;
      profileFetcher = new CachedProfileFetcher({
        inner: fallbackClient,
        targetRepo,
        logger,
      });
    }
  } else if (config.TWITTER_CLIENT_MODE === 'hybrid' && config.PROXY_URL && config.CHROME_PROFILE_PATH) {
    // Hybrid mode: API v2 for reads, Playwright for writes
    const twitterCredentials =
      config.TWITTER_API_KEY && config.TWITTER_API_SECRET && config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_SECRET
        ? {
            apiKey: config.TWITTER_API_KEY,
            apiSecret: config.TWITTER_API_SECRET,
            accessToken: config.TWITTER_ACCESS_TOKEN,
            accessSecret: config.TWITTER_ACCESS_SECRET,
          }
        : undefined;

    const apiClient = new TwitterClient({
      credentials: twitterCredentials,
      dryRun: config.DRY_RUN,
      logger,
    });

    const browserCookies = config.TWITTER_AUTH_TOKEN && config.TWITTER_CT0 && config.TWITTER_TWID
      ? { authToken: config.TWITTER_AUTH_TOKEN, ct0: config.TWITTER_CT0, twid: config.TWITTER_TWID, kdt: config.TWITTER_KDT }
      : undefined;

    const playwrightClient = new PlaywrightTwitterClient({
      profilePath: config.CHROME_PROFILE_PATH,
      proxyUrl: config.PROXY_URL,
      dryRun: config.DRY_RUN,
      logger,
      telegramToken: config.TELEGRAM_BOT_TOKEN,
      adminChatId: config.TELEGRAM_CHAT_ID ?? config.TELEGRAM_ADMIN_IDS[0],
      cookies: browserCookies,
      chromeExecutablePath: config.CHROME_EXECUTABLE_PATH,
      timezoneId: config.BROWSER_TIMEZONE,
    });

    try {
      await playwrightClient.initialize();
      playwrightClientRef = playwrightClient;
      twitter = new HybridTwitterClient({ apiClient, playwrightClient, logger });
      profileFetcher = new CachedProfileFetcher({
        inner: apiClient,
        targetRepo,
        logger,
      });
      logger.info('Twitter client: hybrid mode (API reads + Playwright writes)');
    } catch (error) {
      logger.error({ err: error }, 'Playwright init failed — falling back to API-only mode');
      twitter = apiClient;
      profileFetcher = new CachedProfileFetcher({
        inner: apiClient,
        targetRepo,
        logger,
      });
    }
  } else {
    const twitterCredentials =
      config.TWITTER_API_KEY && config.TWITTER_API_SECRET && config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_SECRET
        ? {
            apiKey: config.TWITTER_API_KEY,
            apiSecret: config.TWITTER_API_SECRET,
            accessToken: config.TWITTER_ACCESS_TOKEN,
            accessSecret: config.TWITTER_ACCESS_SECRET,
          }
        : undefined;

    const apiClient = new TwitterClient({
      credentials: twitterCredentials,
      dryRun: config.DRY_RUN,
      logger,
    });
    twitter = apiClient;
    profileFetcher = new CachedProfileFetcher({
      inner: apiClient,
      targetRepo,
      logger,
    });
    logger.info('Twitter client: API mode');
  }

  mentionHandler = new MentionHandler({
    twitter,
    mentionRepo,
    userRepo,
    configRepo,
    queueRepo,
    tweetRepo,
    roastRepo,
    logger,
    botUsername,
    activityLogger,
  });

  engagementTracker = new EngagementTracker({
    twitter,
    roastRepo,
    db,
    logger,
    activityLogger,
  });
} else {
  logger.info('Twitter disabled (ENABLE_TWITTER=false) — telegram-only mode');
}

// --- Meme Generator (optional — needs Imgflip creds + LLM provider) ---
const memeHistoryRepo = new MemeHistoryRepository(db);
let memeGenerator: MemeGenerator | undefined;
if (config.IMGFLIP_USERNAME && config.IMGFLIP_PASSWORD && provider) {
  const imgflipClient = new ImgflipClient(config.IMGFLIP_USERNAME, config.IMGFLIP_PASSWORD, logger);
  memeGenerator = new MemeGenerator(imgflipClient, provider, memeHistoryRepo, logger);
  logger.info('Meme generator initialized');
}

// --- Queue Manager ---
let queueManager: QueueManager | null = null;
if (provider) {
  queueManager = new QueueManager({
    queueRepo,
    roastRepo,
    configRepo,
    feedbackRepo,
    provider,
    twitter,
    profileFetcher,
    stockpile: stockpileRepo,
    exampleRepo,
    patternRepo,
    farmAttemptRepo,
    mentionRepo,
    tweetRepo,
    twitterEnricher,
    logger,
    dailyLimit: config.ROASTS_PER_DAY,
    mentionReplyLimit: config.MENTION_REPLIES_PER_DAY,
    minFollowerThreshold: config.MIN_FOLLOWER_THRESHOLD,
    enableMentionReplies: config.ENABLE_MENTION_REPLIES,
    activityLogger,
  });
  logger.info({ dailyLimit: config.ROASTS_PER_DAY }, 'Queue manager initialized');
}

// --- Health Monitor ---
const healthMonitor = new HealthMonitor({
  port: 3000,
  logger,
  db,
  beefEnv: config.BEEF_ENV,
  checks: {
    isTwitterConfigured: () => twitter?.isConfigured ?? false,
    isProviderAvailable: () => provider !== null,
    getQueuePending: () => queueRepo.getPendingCount(),
    getRoastsToday: () => roastRepo.getTodayCount('autonomous'),
    getApiUsage: twitter && 'usage' in twitter ? () => (twitter as TwitterClient).usage : undefined,
  },
});

// --- Queue result notification helper ---
function escHtml(text: string): string {
  return text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c);
}

async function notifyQueueResult(
  result: QueueProcessResult,
  source: string,
): Promise<void> {
  if (!bot) return;
  if (!result.dequeued) return;

  // Status notifications → group chat (TELEGRAM_CHAT_ID), fallback → admin DMs
  const targets: (number | string)[] = config.TELEGRAM_CHAT_ID
    ? [config.TELEGRAM_CHAT_ID]
    : [...config.TELEGRAM_ADMIN_IDS];
  if (targets.length === 0) return;

  const lines: string[] = [];

  // Pending approval — send with inline buttons
  if (result.pendingApproval && result.roastId) {
    const stockpileTag = result.fromStockpile ? ' [stockpile]' : '';
    const isReply = result.roastSource && ['mention', 'reply_guy', 'casual_reply'].includes(result.roastSource);
    const typeEmoji = result.postBlocked ? '⚠️' : isReply ? '💬' : '📢';
    const sourceLabel = result.roastSource ?? source;
    const blockedTag = result.postBlocked ? ' [reply blocked]' : '';
    lines.push(`${typeEmoji} <b>Review${stockpileTag}${blockedTag}</b> — ${escHtml(result.target ?? '?')} <i>(${sourceLabel})</i>`);
    if (result.postBlocked) {
      lines.push('⛔ Reply blocked (403) — thread restricted by author');
    }
    if (result.replyToId) {
      const tweetUrl = `https://x.com/i/status/${result.replyToId}`;
      lines.push(`↩️ Original: <a href="${tweetUrl}">open tweet</a>`);
    }
    const meta: string[] = [];
    if (result.evaluationScore) meta.push(`Eval: <b>${result.evaluationScore.toFixed(1)}</b>/5`);
    if (result.newStockpileCount) meta.push(`📦 ${String(result.newStockpileCount)} stockpiled`);
    if (meta.length > 0) lines.push(meta.join(' · '));

    const text = lines.join('\n');
    const isReplySource = result.roastSource && ['mention', 'reply_guy', 'casual_reply'].includes(result.roastSource);
    const buttons: Array<{ text: string; callback_data: string }> = [];
    if (result.postBlocked) {
      // Reply is permanently blocked — only offer standalone or skip
      buttons.push({ text: 'Post standalone', callback_data: `standalone:${String(result.roastId)}` });
      buttons.push({ text: 'Skip', callback_data: `reject:${String(result.roastId)}` });
    } else {
      buttons.push({ text: 'Post', callback_data: `approve:${String(result.roastId)}` });
      buttons.push({ text: 'Skip', callback_data: `reject:${String(result.roastId)}` });
      if (isReplySource) {
        buttons.push({ text: '🔄 Regenerate', callback_data: `regenerate:${String(result.roastId)}` });
      }
    }
    const keyboard = { inline_keyboard: [buttons] };

    for (const target of targets) {
      try {
        await bot.api.sendMessage(target, text, { parse_mode: 'HTML' });
        if (result.postedText) {
          await bot.api.sendMessage(
            target,
            `<code>${escHtml(result.postedText)}</code>`,
            { parse_mode: 'HTML', reply_markup: keyboard },
          );
        }
      } catch (err) {
        logger.warn({ err, chatId: target }, 'Failed to send approval notification');
      }
    }
    return;
  }

  if (result.posted || result.savedOnly) {
    const emoji = result.posted ? '✅' : '📝';
    const label = result.posted ? 'Posted' : 'Saved (no Twitter)';
    const stockpileTag = result.fromStockpile ? ' [stockpile]' : '';
    const sourceLabel = result.roastSource ?? source;

    // Header line
    lines.push(`${emoji} <b>${label}${stockpileTag}</b> — ${escHtml(result.target ?? '?')} <i>(${sourceLabel})</i>`);

    // Metadata: eval + stockpile on one line
    const meta: string[] = [];
    if (result.evaluationScore) meta.push(`Eval: <b>${result.evaluationScore.toFixed(1)}</b>/5`);
    if (result.newStockpileCount) meta.push(`📦 ${String(result.newStockpileCount)} stockpiled`);
    if (result.newStockpileCount === 0 && !result.fromStockpile) {
      meta.push('⚠️ best self-scored');
    }
    if (meta.length > 0) lines.push(meta.join(' · '));

    // Original tweet link (what we replied to)
    if (result.replyToId) {
      const originalUrl = `https://x.com/i/status/${result.replyToId}`;
      lines.push(`\n↩️ Original: <a href="${originalUrl}">open tweet</a>`);
    }

    // Our roast text + link to our tweet
    if (result.postedText) {
      lines.push(`🔥 <i>"${escHtml(result.postedText)}"</i>`);
    }
    if (result.tweetId) {
      const replyUrl = `https://x.com/0xBeefer/status/${result.tweetId}`;
      lines.push(`↗️ <a href="${replyUrl}">our reply</a>`);
    }
  } else {
    lines.push(`❌ <b>Failed</b> — ${escHtml(result.target ?? '?')} <i>(${source})</i>`);
    if (result.error) lines.push(escHtml(result.error.slice(0, 300)));
  }

  const text = lines.join('\n');
  for (const target of targets) {
    try {
      await bot.api.sendMessage(target, text, { parse_mode: 'HTML' });

      // Send stockpiled variants as separate message
      if (result.stockpiledVariants && result.stockpiledVariants.length > 0) {
        const variantLines = result.stockpiledVariants.map(
          (v, i) => `${String(i + 1)}. [${v.score.toFixed(1)}] <i>${escHtml(v.angle)}</i>\n<code>${escHtml(v.text)}</code>`,
        );
        await bot.api.sendMessage(
          target,
          `📦 <b>Stockpiled variants for ${escHtml(result.target ?? '?')}:</b>\n\n${variantLines.join('\n\n')}`,
          { parse_mode: 'HTML' },
        );
      }
    } catch (err) {
      logger.warn({ err, chatId: target }, 'Failed to send queue result notification');
    }
  }
}

// --- Scheduler ---
const scheduler = new Scheduler(logger);

if (queueManager) {
  const qm = queueManager;
  scheduler.register({
    name: 'queue-processor',
    cronTime: '*/20 * * * *',
    jitterMs: 5 * 60 * 1000,
    handler: async () => {
      const result = await qm.processNext();
      await notifyQueueResult(result, 'scheduler');
    },
  });
}

if (mentionHandler) {
  const mh = mentionHandler;
  const pollMinutes = Math.max(1, Math.round(config.MENTION_POLL_INTERVAL_MS / 60_000));
  scheduler.register({
    name: 'mention-poller',
    cronTime: `*/${String(pollMinutes)} * * * *`,
    jitterMs: 1 * 60 * 1000,
    handler: async () => {
      const result = await mh.poll();

      // Notify admins via Telegram
      if (bot && config.TELEGRAM_ADMIN_IDS.length > 0) {
        let text: string;
        if (result.processed > 0) {
          const lines = result.mentions.map(
            (m) =>
              `• @${m.authorName}: "${m.text.slice(0, 60)}${m.text.length > 60 ? '…' : ''}" [${m.requestType}]${m.queued ? ' ✅' : ''}`,
          );
          text = `📬 <b>Mentions:</b> ${String(result.processed)} new\n${lines.join('\n')}`;
        } else {
          text = '📭 Mentions poll: no new mentions';
        }
        for (const adminId of config.TELEGRAM_ADMIN_IDS) {
          try {
            await bot.api.sendMessage(adminId, text, { parse_mode: 'HTML' });
          } catch (err) {
            logger.debug({ err, adminId }, 'Failed to send mention poll notification');
          }
        }
      }

      // Immediately trigger queue processing for newly queued mentions
      if (queueManager && result.processed > 0) {
        const qm = queueManager;
        const queuedCount = result.mentions.filter((m) => m.queued).length;
        if (queuedCount > 0) {
          logger.info({ queuedCount }, 'Triggering immediate queue processing for new mentions');
          void (async () => {
            try {
              for (let i = 0; i < queuedCount; i++) {
                const queueResult = await qm.processNext();
                await notifyQueueResult(queueResult, 'mention');
              }
            } catch (err) {
              logger.error({ err }, 'Failed to process queued mentions');
            }
          })();
        }
      }
    },
  });
}

if (engagementTracker) {
  const et = engagementTracker;
  scheduler.register({
    name: 'engagement-tracker',
    cronTime: '0 * * * *',
    jitterMs: 5 * 60 * 1000,
    handler: async () => {
      await et.trackRecent();
    },
  });
}

// Rescue failed mentions back to pending (every hour)
scheduler.register({
  name: 'mention-rescue',
  cronTime: '30 * * * *',
  jitterMs: 0,
  handler: () => {
    const rescued = queueRepo.rescueFailedMentions();
    if (rescued > 0) {
      logger.info({ rescued }, 'Rescued failed mention queue items');
    }
    return Promise.resolve();
  },
});

// Periodic activity stats (every 2 hours)
if (activityLogger) {
  const al = activityLogger;
  scheduler.register({
    name: 'activity-stats',
    cronTime: '15 */2 * * *',
    jitterMs: 0,
    handler: () => {
      const roastsToday = roastRepo.getTodayCount('autonomous') + roastRepo.getTodayCount('mention');
      const stockpileSize = stockpileRepo.getStats().byStatus['available'] ?? 0;
      al.emit({
        type: 'stats',
        data: { count: roastsToday, stockpileSize },
      });
      return Promise.resolve();
    },
  });
}

// --- Timeline Monitor + Reply Guy ---
const monitorChatId = config.TELEGRAM_MONITOR_CHAT_ID ?? config.TELEGRAM_CHAT_ID;
const adminChatId = config.TELEGRAM_CHAT_ID ?? config.TELEGRAM_ADMIN_IDS[0];
if (twitter && 'searchRecentTweets' in twitter && config.TELEGRAM_BOT_TOKEN && monitorChatId) {
  const { TimelineMonitor } = await import('./monitor/timeline-monitor.js');
  const { MonitorRepository } = await import('./monitor/monitor.repository.js');
  const monitorRepo = new MonitorRepository(db);

  // Reply Guy pipeline (optional, fire-and-forget from monitor)
  let onNewTweets: ((tweets: ScoredTweet[]) => void) | undefined;

  if (config.ENABLE_REPLY_GUY && provider && adminChatId && config.TELEGRAM_BOT_TOKEN) {
    const { ReplyGuyPipeline } = await import('./reply-guy/reply-guy-pipeline.js');
    const { ReplyGuyCandidateRepository } = await import('./reply-guy/reply-guy-candidate.repository.js');
    const candidateRepo = new ReplyGuyCandidateRepository(db);

    const replyGuy = new ReplyGuyPipeline({
      provider,
      twitterClient: twitter,
      candidateRepo,
      metricsRepo,
      logger,
      telegramToken: config.TELEGRAM_BOT_TOKEN,
      adminChatId,
      dryRun: config.REPLY_GUY_DRY_RUN,
      selectorConfig: {
        minScore: 12,
        maxAgeMinutes: config.REPLY_GUY_MAX_AGE_MINUTES,
        dailyCap: config.REPLY_GUY_DAILY_CAP,
        minRoastability: config.REPLY_GUY_MIN_ROASTABILITY,
        maxPerCycle: config.REPLY_GUY_MAX_PER_CYCLE,
      },
      feedbackRepo,
      configRepo,
      exampleRepo,
      patternRepo,
      stockpileRepo,
      farmAttemptRepo,
    });

    const replyGuyTelegramToken = config.TELEGRAM_BOT_TOKEN;
    const replyGuyAdminChatId = adminChatId;

    onNewTweets = (tweets) => {
      void replyGuy.processCycle(tweets).catch(async (err) => {
        logger.error({ err }, 'Reply guy cycle failed');
        try {
          const { sendReplyGuyNotification } = await import('./reply-guy/reply-guy-notify.js');
          const errMsg = err instanceof Error ? err.message : String(err);
          await sendReplyGuyNotification(
            replyGuyTelegramToken,
            replyGuyAdminChatId,
            `🚨 <b>Reply Guy cycle crashed</b>\n\n<code>${errMsg.slice(0, 500)}</code>`,
          );
        } catch {
          // Telegram alert failed — already logged above
        }
      });
    };

    logger.info(
      { dryRun: config.REPLY_GUY_DRY_RUN, dailyCap: config.REPLY_GUY_DAILY_CAP, minRoastability: config.REPLY_GUY_MIN_ROASTABILITY },
      'Reply guy pipeline enabled',
    );
  }

  const monitor = new TimelineMonitor({
    twitter: twitter as TwitterClient,
    configRepo,
    monitorRepo,
    telegramToken: config.TELEGRAM_BOT_TOKEN,
    monitorChatId,
    logger,
    onNewTweets,
  });

  scheduler.register({
    name: 'timeline-monitor',
    cronTime: '*/10 * * * *',
    jitterMs: 2 * 60 * 1000,
    handler: async () => {
      const result = await monitor.poll();
      if (result.budgetExceeded) {
        logger.warn('Timeline monitor: API budget ceiling reached — pausing until next month');
      }
    },
  });
  logger.info('Timeline monitor registered (every 10 min + jitter)');
}

// --- Telegram Bot ---
let bot: ReturnType<typeof createBot> | null = null;
if (config.TELEGRAM_BOT_TOKEN) {
  bot = createBot({
    token: config.TELEGRAM_BOT_TOKEN,
    adminIds: config.TELEGRAM_ADMIN_IDS,
    openAccess: config.TELEGRAM_OPEN_ACCESS,
    feedbackRepo,
    provider,
    logger,
    queueManager: queueManager ?? undefined,
    configRepo,
    exampleRepo,
    patternRepo,
    stockpileRepo,
    farmAttemptRepo,
    roastRepo,
    postingMode: {
      autonomous: config.ENABLE_AUTONOMOUS_POSTING,
      mentionReplies: config.ENABLE_MENTION_REPLIES,
    },
    pollMentions: mentionHandler ? () => mentionHandler.poll() : undefined,
    getSchedulerJobs: () => scheduler.getJobsInfo(),
    twitterEnabled: config.ENABLE_TWITTER,
    beefEnv: config.BEEF_ENV,
    twitterUsername: botUsername,
    twitterClient: twitter,
    twitterEnricher,
    memeGenerator,
    memeHistoryRepo,
    metricsRepo,
    anthropicApiKey: config.ANTHROPIC_API_KEY,
    openaiApiKey: config.OPENAI_API_KEY,
    resetCircuitBreaker: playwrightClientRef ? (() => { const pw = playwrightClientRef; pw?.resetCircuitBreaker(); }) : undefined,
  });

  void bot.start({
    drop_pending_updates: true,
    onStart: async () => {
      logger.info(
        { admins: config.TELEGRAM_ADMIN_IDS, openAccess: config.TELEGRAM_OPEN_ACCESS },
        'Telegram bot polling started',
      );

      // Clean up duplicate pending_approval roasts before showing recovery list
      const rejectedDuplicates = roastRepo.rejectDuplicatePending();
      if (rejectedDuplicates > 0) {
        logger.info({ rejectedDuplicates }, 'Rejected duplicate pending_approval roasts on startup');
      }

      // Recover orphaned pending_approval roasts after restart
      const pending = roastRepo.getPendingApproval();
      if (pending.length > 0) {
        logger.info({ count: pending.length }, 'Found orphaned pending_approval roasts on startup');
        const chatId = config.TELEGRAM_CHAT_ID ?? config.TELEGRAM_ADMIN_IDS[0];
        if (chatId) {
          try {
            const lines = pending.map((r) =>
              `• ${r.targetName} (ID ${String(r.id)}) — /pending to review`,
            );
            await bot!.api.sendMessage(
              chatId,
              `🔄 <b>${String(pending.length)} roast(s) pending approval</b> (recovered after restart)\n${lines.join('\n')}`,
              { parse_mode: 'HTML' },
            );
          } catch (err) {
            logger.warn({ err }, 'Failed to send pending approval recovery notification');
          }
        }
      }
    },
  });
} else {
  logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
}

// --- API Server ---
const apiServer = new ApiServer({
  port: config.API_PORT,
  logger,
  apiToken: config.API_AUTH_TOKEN,
  stockpileRepo,
  roastRepo,
  queueRepo,
  configRepo,
  feedbackRepo,
  healthMonitor,
  scheduler,
  provider,
  queueManager: queueManager ?? undefined,
});

// Start services
healthMonitor.start();
apiServer.start();
scheduler.start();

// --- Graceful shutdown ---
const shutdown = async () => {
  logger.info('Shutting down...');
  activityLogger?.emit({ type: 'sleep' });
  activityLogger?.setStatus('offline');
  try {
    scheduler.stop();
    apiServer.stop();
    healthMonitor.stop();
    if (bot) await bot.stop();
    if (provider) {
      await provider.waitForIdle(185_000);
      provider.shutdown();
    }
    if (twitter?.shutdown) await twitter.shutdown();
  } finally {
    activityLogger?.flush();
    db.close();
  }
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown();
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection');
  void shutdown();
});
