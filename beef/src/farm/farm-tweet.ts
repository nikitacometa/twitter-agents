#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Tweet Farm — local CLI for batch-roasting specific tweets.
 *
 * Unlike the target farm (pnpm farm), this operates on tweet URLs:
 *   1. Fetches each tweet + author profile via Scraper
 *   2. Generates 2 rounds x 3 variants = 6 roast candidates per tweet
 *   3. Evaluates all 6 with serious eval (5 judges, Sonnet)
 *   4. Sends best results per tweet to Telegram with original link, tweet preview, context
 *
 * Usage:
 *   pnpm farm:tweet https://x.com/user/status/123 https://x.com/user/status/456
 *   pnpm farm:tweet --threshold 3.8 https://x.com/user/status/123
 *   pnpm farm:tweet --quick https://x.com/user/status/123   # 1 judge instead of 5
 */

import { config } from 'dotenv';
config({ override: true });
config({ path: '.env.production' });

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@storage/database.js';
import { FarmAttemptRepository } from '@storage/repositories/farm-attempt.repository.js';
import { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import { ConfigRepository } from '@storage/repositories/config.repository.js';
import { ExternalExampleRepository } from '@storage/repositories/external-example.repository.js';
import { RoastPatternRepository } from '@storage/repositories/roast-pattern.repository.js';
import { LlmLogRepository } from '@storage/repositories/llm-log.repository.js';
import { ClaudeCodeProvider } from '@agent/claude-code.provider.js';
import { ProviderManager } from '@agent/provider-manager.js';
import { generateRoasts } from '@admin/roast-generator.js';
import type { GenerateRoastsResult } from '@admin/roast-generator.js';
import { parseTweetUrl, isTweetUrl } from '@queue/queue-manager.js';
import { buildTweetRoastContext } from '@roast/prompt-builder.js';
import type { TweetRoastContextInput } from '@roast/prompt-builder.js';
import { downloadTweetMedia } from '@common/utils/media-downloader.js';
import { TwitterEnricher } from './twitter-enricher.js';
import { SelfEvaluator } from './self-evaluator.js';
import { sendFarmNotification } from './notify.js';
import { createFarmLogger } from './logger.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import type { TweetData } from '@twitter/twitter-client.interface.js';
import type { Scraper } from '@the-convocation/twitter-scraper';
import type { FarmAttempt } from './types.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = resolve(__dirname, '../../data/beef.db');

interface TweetFarmFlags {
  urls: string[];
  threshold: number;
  quick: boolean;
  dbPath: string;
}

function parseArgs(): TweetFarmFlags {
  const args = process.argv.slice(2);
  const urls: string[] = [];
  let threshold = 3.5;
  let quick = false;
  let dbPath = DEFAULT_DB_PATH;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--threshold' && args[i + 1]) {
      threshold = parseFloat(args[++i]!);
    } else if (arg === '--quick') {
      quick = true;
    } else if (arg === '--db' && args[i + 1]) {
      dbPath = args[++i]!;
    } else if (isTweetUrl(arg)) {
      urls.push(arg);
    }
  }

  return { urls, threshold, quick, dbPath };
}

// ---------------------------------------------------------------------------
// Scraper init (reused from farm/index.ts pattern)
// ---------------------------------------------------------------------------

interface ScraperHandle {
  getTweet: (tweetId: string) => Promise<TweetData | null>;
  enricher: TwitterEnricher | undefined;
}

function tweetFromRaw(
  raw: Awaited<ReturnType<Scraper['getTweet']>>,
  fallbackId: string,
): TweetData | null {
  if (!raw) return null;
  const mediaUrls = raw.photos?.map((p) => p.url).filter(Boolean) as string[] | undefined;
  return {
    tweetId: raw.id ?? fallbackId,
    authorId: raw.userId ?? 'unknown',
    authorName: raw.username ?? 'unknown',
    text: raw.text ?? '',
    mediaUrls: mediaUrls && mediaUrls.length > 0 ? mediaUrls : undefined,
    likes: raw.likes ?? undefined,
    retweets: raw.retweets ?? undefined,
    replies: raw.replies ?? undefined,
    views: raw.views ?? undefined,
    createdAt: raw.timeParsed ? raw.timeParsed.toISOString() : undefined,
    inReplyToTweetId: raw.inReplyToStatusId ?? undefined,
    quotedTweetId: raw.quotedStatusId ?? undefined,
  };
}

async function createTwitterHandle(logger: ReturnType<typeof createFarmLogger>): Promise<ScraperHandle | null> {
  // --- Try Scraper first (richer data, no API quota) ---
  const scraperUsername = process.env['TWITTER_USERNAME'];
  const scraperPassword = process.env['TWITTER_PASSWORD'];

  if (scraperUsername && scraperPassword) {
    try {
      const { Scraper } = await import('@the-convocation/twitter-scraper');
      const { cycleTLSFetch } = await import('@the-convocation/twitter-scraper/cycletls');
      const scraper = new Scraper({ fetch: cycleTLSFetch as unknown as typeof fetch });

      const { CookieStore } = await import('@twitter/cookie-store.js');
      const cookieStore = new CookieStore(logger);
      const savedCookies = cookieStore.load();

      let loggedIn = false;
      if (savedCookies) {
        await scraper.setCookies(savedCookies);
        loggedIn = await scraper.isLoggedIn();
        if (loggedIn) logger.info('Farm-tweet: scraper logged in via saved cookies');
      }

      if (!loggedIn) {
        await scraper.login(scraperUsername, scraperPassword, process.env['TWITTER_PHONE'], process.env['TWITTER_2FA_SECRET']);
        loggedIn = await scraper.isLoggedIn();
        if (loggedIn) logger.info('Farm-tweet: scraper logged in via credentials');
      }

      if (loggedIn) {
        const enricher = new TwitterEnricher({ scraper, logger });
        return {
          getTweet: async (tweetId: string) => {
            const raw = await scraper.getTweet(tweetId);
            return tweetFromRaw(raw, tweetId);
          },
          enricher,
        };
      }
    } catch (err) {
      logger.warn({ err }, 'Farm-tweet: scraper initialization failed');
    }
  }

  // --- Fallback: Official API v2 ---
  const apiKey = process.env['TWITTER_API_KEY'];
  const apiSecret = process.env['TWITTER_API_SECRET'];
  const accessToken = process.env['TWITTER_ACCESS_TOKEN'];
  const accessSecret = process.env['TWITTER_ACCESS_SECRET'];

  if (apiKey && apiSecret && accessToken && accessSecret) {
    try {
      const { TwitterApi } = await import('twitter-api-v2');
      const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret }).readOnly.v2;
      logger.info('Farm-tweet: using Official API v2');

      // Enricher via Official API
      const apiClient = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret });
      const enricher = new TwitterEnricher({ apiClient, logger });

      return {
        getTweet: async (tweetId: string): Promise<TweetData | null> => {
          const resp = await client.singleTweet(tweetId, {
            'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'referenced_tweets'],
            expansions: ['author_id', 'referenced_tweets.id', 'attachments.media_keys'],
            'media.fields': ['url', 'preview_image_url', 'type'],
            'user.fields': ['username', 'name', 'public_metrics'],
          });

          const author = resp.includes?.users?.[0];
          const metrics = resp.data.public_metrics;
          const refs = resp.data.referenced_tweets;
          const replyTo = refs?.find((r) => r.type === 'replied_to');
          const quoted = refs?.find((r) => r.type === 'quoted');
          const mediaUrls = resp.includes?.media
            ?.map((m) => m.url ?? m.preview_image_url)
            .filter((u): u is string => !!u);

          return {
            tweetId,
            authorId: resp.data.author_id ?? 'unknown',
            authorName: author?.username ?? 'unknown',
            text: resp.data.text,
            mediaUrls: mediaUrls && mediaUrls.length > 0 ? mediaUrls : undefined,
            likes: metrics?.like_count,
            retweets: metrics?.retweet_count,
            replies: metrics?.reply_count,
            views: metrics?.impression_count,
            createdAt: resp.data.created_at,
            inReplyToTweetId: replyTo?.id,
            quotedTweetId: quoted?.id,
          };
        },
        enricher,
      };
    } catch (err) {
      logger.warn({ err }, 'Farm-tweet: Official API initialization failed');
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + '\u2026';
}

// ---------------------------------------------------------------------------
// Per-tweet result type
// ---------------------------------------------------------------------------

interface TweetFarmResult {
  tweetUrl: string;
  authorName: string;
  tweetPreview: string;
  contextSummary: string;
  rounds: GenerateRoastsResult[];
  evaluation?: {
    bestText: string;
    bestAngle: string;
    bestScore: number;
    allScores: Array<{ text: string; angle: string; score: number; verdict: string }>;
  };
  elapsedMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const flags = parseArgs();

  if (flags.urls.length === 0) {
    console.log('Usage: pnpm farm:tweet <url1> [url2] [...] [--threshold N] [--quick] [--db path]');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm farm:tweet https://x.com/user/status/123456');
    console.log('  pnpm farm:tweet --threshold 3.8 https://x.com/a/status/1 https://x.com/b/status/2');
    process.exit(0);
  }

  const logger = createFarmLogger();
  const db = createDatabase(flags.dbPath, logger);
  const farmAttemptRepo = new FarmAttemptRepository(db);
  const stockpileRepo = new StockpileRepository(db);
  const feedbackRepo = new FeedbackRepository(db);
  const configRepo = new ConfigRepository(db);
  const exampleRepo = new ExternalExampleRepository(db);
  const patternRepo = new RoastPatternRepository(db);
  const llmLog = new LlmLogRepository(db);
  const primary = new ClaudeCodeProvider(logger, llmLog);
  const alerter = { send: (msg: string) => Promise.resolve(logger.warn({ alert: msg }, 'Farm-tweet alert')) };
  const provider = new ProviderManager(primary, [], alerter, logger);

  console.log(`\n\ud83d\udc26 Tweet Farm \u2014 ${String(flags.urls.length)} tweet(s), 2 rounds each, ${flags.quick ? 'quick' : 'serious'} eval, threshold ${flags.threshold.toFixed(1)}\n`);

  // --- Init scraper ---
  const scraperHandle = await createTwitterHandle(logger);
  if (!scraperHandle) {
    console.error('\u274c Cannot initialize Twitter client. Need TWITTER_USERNAME/PASSWORD or TWITTER_API_KEY/SECRET + ACCESS_TOKEN/SECRET in .env');
    db.close();
    process.exit(1);
  }

  const startedAt = Date.now();
  const results: TweetFarmResult[] = [];

  // --- Process tweets sequentially ---
  for (let idx = 0; idx < flags.urls.length; idx++) {
    const url = flags.urls[idx]!;
    const tweetStart = Date.now();
    console.log(`\n\u2501\u2501\u2501 [${String(idx + 1)}/${String(flags.urls.length)}] ${url} \u2501\u2501\u2501\n`);

    try {
      // 1. Fetch tweet
      const tweetId = parseTweetUrl(url);
      if (!tweetId) {
        console.log('  \u2717 Invalid tweet URL');
        results.push({ tweetUrl: url, authorName: '?', tweetPreview: '', contextSummary: '', rounds: [], elapsedMs: 0, error: 'Invalid URL' });
        continue;
      }

      console.log('  \ud83d\udce5 Fetching tweet...');
      const tweet = await scraperHandle.getTweet(tweetId);
      if (!tweet) {
        console.log('  \u2717 Could not fetch tweet');
        results.push({ tweetUrl: url, authorName: '?', tweetPreview: '', contextSummary: '', rounds: [], elapsedMs: 0, error: 'Fetch failed' });
        continue;
      }

      console.log(`  \ud83d\udc64 @${tweet.authorName}: "${truncate(tweet.text, 80)}"`);

      // 2. Download media
      let imagePaths: string[] = [];
      let mediaCleanup: (() => Promise<void>) | undefined;
      if (tweet.mediaUrls && tweet.mediaUrls.length > 0) {
        try {
          console.log('  \ud83d\uddbc Downloading media...');
          const media = await downloadTweetMedia(tweet.mediaUrls, logger);
          imagePaths = media.paths;
          mediaCleanup = media.cleanup;
        } catch (err) {
          logger.warn({ err }, 'Media download failed');
        }
      }

      // 3. Enrich author
      let enrichmentContext: string | undefined;
      if (scraperHandle.enricher) {
        try {
          console.log('  \ud83d\udc64 Enriching author profile...');
          const enrichment = await scraperHandle.enricher.enrich(tweet.authorName);
          if (enrichment?.hasData) {
            enrichmentContext = enrichment.profileContext;
          }
        } catch (err) {
          logger.warn({ err }, 'Enrichment failed');
        }
      }

      // 4. Fetch parent/quoted tweet
      let parentTweet: { text: string; author: string } | undefined;
      let quotedTweet: { text: string; author: string } | undefined;
      const refTweetId = tweet.inReplyToTweetId ?? tweet.quotedTweetId;
      if (refTweetId) {
        try {
          console.log('  \ud83d\udd17 Fetching referenced tweet...');
          const refTweet = await scraperHandle.getTweet(refTweetId);
          if (refTweet) {
            const ref = { text: refTweet.text, author: refTweet.authorName };
            if (tweet.inReplyToTweetId) parentTweet = ref;
            else quotedTweet = ref;
          }
        } catch (err) {
          logger.warn({ err }, 'Referenced tweet fetch failed');
        }
      }

      // 5. Build context
      const tweetAgeDays = tweet.createdAt
        ? Math.floor((Date.now() - new Date(tweet.createdAt).getTime()) / 86_400_000)
        : undefined;

      const contextInput: TweetRoastContextInput = {
        tweetText: tweet.text,
        tweetAuthor: tweet.authorName,
        enrichmentContext,
        imagePaths: imagePaths.length > 0 ? imagePaths : undefined,
        metrics: tweet.likes != null ? {
          likes: tweet.likes ?? 0,
          retweets: tweet.retweets ?? 0,
          replies: tweet.replies ?? 0,
          views: tweet.views,
        } : undefined,
        tweetAgeDays,
        parentTweet,
        quotedTweet,
      };

      const profileContext = buildTweetRoastContext(contextInput);

      // Build context summary for Telegram message
      const contextParts: string[] = [];
      if (tweet.likes != null || tweet.retweets != null) {
        contextParts.push(`${String(tweet.likes ?? 0)}L / ${String(tweet.retweets ?? 0)}RT / ${String(tweet.views ?? 0)}V`);
      }
      if (enrichmentContext) {
        const followerMatch = /followers?:\s*([\d,.]+[kKmM]?)/i.exec(enrichmentContext);
        if (followerMatch) contextParts.push(`${followerMatch[1]} followers`);
      }
      if (parentTweet) contextParts.push(`reply to @${parentTweet.author}`);
      if (quotedTweet) contextParts.push(`quoting @${quotedTweet.author}`);
      if (tweetAgeDays && tweetAgeDays > 0) contextParts.push(`${String(tweetAgeDays)}d old`);
      const contextSummary = contextParts.join(' \u00b7 ');

      // 6. Generate — 2 rounds x 3 variants = 6 total
      const rounds: GenerateRoastsResult[] = [];
      for (let round = 0; round < 2; round++) {
        console.log(`  \u26a1 Round ${String(round + 1)}/2 \u2014 generating 3 variants...`);
        const output = await generateRoasts(
          tweet.authorName, provider, logger, feedbackRepo, 'farm-generate', 3,
          configRepo, exampleRepo, patternRepo,
          imagePaths.length > 0 ? imagePaths : undefined,
          profileContext,
          'none', stockpileRepo, 1,
          farmAttemptRepo, undefined,
          false, 'person', true,
        );
        rounds.push(output);
        console.log(`    \u2192 ${String(output.variants.length)} variants generated`);
      }

      // 7. Evaluate all variants
      const allVariants = rounds.flatMap((r) => r.variants);

      const evalResults: Array<{
        text: string;
        angle: string;
        score: number;
        verdict: string;
      }> = [];

      if (flags.quick) {
        // Quick mode: use LLM self-scores, skip judge panel
        console.log(`  \u2696\ufe0f Ranking ${String(allVariants.length)} variants by self-score (quick mode)...`);
        for (const variant of allVariants) {
          const verdict = variant.score >= flags.threshold ? 'stockpile' : 'discard';
          evalResults.push({ text: variant.text, angle: variant.angle, score: variant.score, verdict });
          const mark = verdict === 'stockpile' ? '\u2713' : '\u2717';
          console.log(`    ${mark} ${variant.score.toFixed(1)} [${variant.angle}] ${truncate(variant.text, 60)}`);
        }
      } else {
        // Serious mode: 5-judge panel via SelfEvaluator
        console.log(`  \u2696\ufe0f Evaluating ${String(allVariants.length)} variants (5 judges)...`);
        const evaluator = new SelfEvaluator({ provider, logger, threshold: flags.threshold });

        for (const variant of allVariants) {
          const fakeAttempt: FarmAttempt = {
            id: Date.now() + Math.floor(Math.random() * 10000),
            targetName: tweet.authorName,
            targetType: 'person',
            tweetText: variant.text,
            angle: variant.angle,
            strategy: 'unified',
            mutationSeed: null,
            llmSelfScore: variant.score,
            evaluatorScore: null,
            evaluatorOutput: null,
            researchNotes: rounds[0]?.researchNotes ?? null,
            factCheckPassed: rounds[0]?.factCheckPassed ?? true,
            agentOutput: null,
            promoted: false,
            createdAt: new Date().toISOString(),
          };

          try {
            const evalOut = await evaluator.evaluate(fakeAttempt);
            evalResults.push({
              text: variant.text,
              angle: variant.angle,
              score: evalOut.compositeScore,
              verdict: evalOut.verdict,
            });
            const mark = evalOut.verdict === 'stockpile' ? '\u2713' : '\u2717';
            console.log(`    ${mark} ${evalOut.compositeScore.toFixed(1)} [${variant.angle}] ${truncate(variant.text, 60)}`);
          } catch (err) {
            logger.warn({ err, text: variant.text }, 'Evaluation failed for variant');
            evalResults.push({ text: variant.text, angle: variant.angle, score: 0, verdict: 'error' });
          }
        }
      }

      // Pick best
      const sorted = [...evalResults].sort((a, b) => b.score - a.score);
      const best = sorted[0];

      const result: TweetFarmResult = {
        tweetUrl: url,
        authorName: tweet.authorName,
        tweetPreview: truncate(tweet.text, 120),
        contextSummary,
        rounds,
        evaluation: best ? {
          bestText: best.text,
          bestAngle: best.angle,
          bestScore: best.score,
          allScores: sorted,
        } : undefined,
        elapsedMs: Date.now() - tweetStart,
      };

      results.push(result);

      if (best) {
        console.log(`\n  \ud83c\udfc6 Best: ${best.score.toFixed(1)} [${best.angle}]`);
        console.log(`     ${best.text}`);
      }

      // Cleanup media
      if (mediaCleanup) await mediaCleanup().catch(() => {});

    } catch (error) {
      const msg = getErrorMessage(error);
      console.log(`  \u274c Error: ${msg.slice(0, 200)}`);
      logger.error({ err: error, url }, 'Tweet farm failed for URL');
      results.push({
        tweetUrl: url,
        authorName: '?',
        tweetPreview: '',
        contextSummary: '',
        rounds: [],
        elapsedMs: Date.now() - tweetStart,
        error: msg.slice(0, 200),
      });
    }
  }

  // --- Send to Telegram ---
  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  const chatId = process.env['TELEGRAM_CHAT_ID'];

  if (botToken && chatId) {
    console.log('\n\ud83d\udce4 Sending results to Telegram...');
    const totalElapsed = Math.round((Date.now() - startedAt) / 1000);
    const message = formatTweetFarmMessage(results, flags, totalElapsed);
    try {
      await sendFarmNotification(botToken, chatId, message);
      console.log('\u2705 Sent to Telegram');
    } catch (err) {
      console.error(`\u274c Telegram send failed: ${getErrorMessage(err)}`);
    }
  } else {
    console.log('\n\u26a0\ufe0f TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set \u2014 skipping Telegram notification');
  }

  // --- Summary ---
  const successful = results.filter((r) => !r.error);
  const passed = results.filter((r) => r.evaluation && r.evaluation.bestScore >= flags.threshold);
  console.log(`\n\u2501\u2501\u2501 Done: ${String(successful.length)}/${String(results.length)} tweets processed, ${String(passed.length)} above threshold (${flags.threshold.toFixed(1)}) \u2501\u2501\u2501\n`);

  db.close();
}

// ---------------------------------------------------------------------------
// Telegram formatter
// ---------------------------------------------------------------------------

function formatTweetFarmMessage(
  results: TweetFarmResult[],
  flags: TweetFarmFlags,
  totalElapsedSec: number,
): string {
  const lines: string[] = [];
  const date = new Date().toISOString().slice(0, 10);
  const evalLabel = flags.quick ? '1J' : '5J';
  const min = Math.floor(totalElapsedSec / 60);
  const sec = totalElapsedSec % 60;
  const duration = min > 0 ? `${String(min)}m ${String(sec)}s` : `${String(sec)}s`;

  // Header
  lines.push(`\ud83d\udc26 <b>Tweet Farm</b>`);
  lines.push('');
  lines.push(`\ud83d\udcc5 ${date}  \u23f1 ${duration}  \u2699\ufe0f 2 rounds \u00d7 3 var \u00b7 ${evalLabel} \u00b7 thr ${flags.threshold.toFixed(1)}`);

  const successful = results.filter((r) => !r.error);
  const aboveThreshold = results.filter((r) => r.evaluation && r.evaluation.bestScore >= flags.threshold);

  lines.push(`\ud83d\udcca ${String(results.length)} tweets \u2192 ${String(successful.length)} processed \u2192 ${String(aboveThreshold.length)} above threshold`);
  lines.push('');

  // Per-tweet results
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    lines.push('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

    if (r.error) {
      lines.push(`\u274c <b>${String(i + 1)}.</b> <a href="${escapeHtml(r.tweetUrl)}">Tweet</a> \u2014 ${escapeHtml(r.error)}`);
      lines.push('');
      continue;
    }

    // Tweet link + author (link is the EXACT url from input)
    lines.push(`<b>${String(i + 1)}.</b> <a href="${escapeHtml(r.tweetUrl)}">@${escapeHtml(r.authorName)}</a>  \u23f1 ${String(Math.round(r.elapsedMs / 1000))}s`);

    // Tweet preview
    lines.push(`<i>"${escapeHtml(r.tweetPreview)}"</i>`);

    // Gathered context
    if (r.contextSummary) {
      lines.push(`\ud83d\udccb ${escapeHtml(r.contextSummary)}`);
    }

    lines.push('');

    if (!r.evaluation) {
      lines.push('<i>No variants generated</i>');
      lines.push('');
      continue;
    }

    // Show all scored variants for blind evaluation
    lines.push('<i>\u041e\u0446\u0435\u043d\u0438 \u043e\u0442 0 \u0434\u043e 5:</i>');
    lines.push('');

    // Show top variants (all that passed threshold, or top 3 if none passed)
    const passed = r.evaluation.allScores.filter((s) => s.score >= flags.threshold);
    const toShow = passed.length > 0 ? passed : r.evaluation.allScores.slice(0, 3);

    for (let j = 0; j < toShow.length; j++) {
      const v = toShow[j]!;
      lines.push(`  <b>${String(j + 1)}.</b> [${escapeHtml(v.angle)}]  AI: <code>${v.score.toFixed(1)}</code>`);
      lines.push(`  <pre>${escapeHtml(v.text)}</pre>`);
      lines.push('');
    }

    if (passed.length === 0 && r.evaluation.allScores.length > 0) {
      lines.push(`<i>\u26a0\ufe0f All ${String(r.evaluation.allScores.length)} variants below threshold ${flags.threshold.toFixed(1)}</i>`);
      lines.push('');
    }
  }

  // Footer
  lines.push('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  lines.push(`<i>#BeefFarm #tweetfarm</i>`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
