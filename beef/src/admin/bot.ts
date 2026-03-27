import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { TaskProfile } from '@agent/agent.types.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import { FeedbackCollector } from './feedback-collector.js';
import { Transcriber } from './transcriber.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { RoastRepository } from '@storage/repositories/roast.repository.js';
import type { QueueManager } from '@queue/queue-manager.js';
import { isTweetUrl, parseTweetUrl } from '@queue/queue-manager.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { ExternalExampleRepository } from '@storage/repositories/external-example.repository.js';
import type { RoastPatternRepository } from '@storage/repositories/roast-pattern.repository.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { FarmAttemptRepository } from '@storage/repositories/farm-attempt.repository.js';
import { generateRoasts } from './roast-generator.js';
import type { GenerateRoastsResult } from './roast-generator.js';
import type { EvaluationMode } from '@roast/roast-engine.js';
import type { PollResult } from '@twitter/mention-handler.js';
import type { JobInfo } from '@scheduler/scheduler.js';
import type { ITwitterClient } from '@twitter/twitter-client.interface.js';
import type { TwitterEnricher } from '@farm/twitter-enricher.js';
import { downloadTweetMedia } from '@common/utils/media-downloader.js';
import { buildTweetRoastContext } from '@roast/prompt-builder.js';
import type { TweetRoastContextInput } from '@roast/prompt-builder.js';
import type { MemeGenerator } from '@meme/meme-generator.js';
import { ImgflipClient } from '@meme/imgflip-client.js';
import { InputFile } from 'grammy';
import type { MetricsRepository } from '@metrics/metrics.repository.js';
import {
  escapeHtml,
  formatStatsMessage,
  formatStockpileRoast,
  formatStockpileList,
} from './formatters.js';
import { buildQuotaMessage } from '@agent/quota-checker.js';

function tweetLink(tweetId: string, username: string): string {
  return `<a href="https://x.com/${username}/status/${tweetId}">Tweet</a>`;
}

function buildMemeKeyboard(roasts: { id: number }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of roasts.slice(0, 8)) {
    kb.text(`🖼 #${String(r.id)}`, `meme:${String(r.id)}`);
  }
  return kb;
}

/** Check if input looks like a Twitter @handle (e.g. @elonmusk) */
function isTwitterHandle(input: string): boolean {
  return /^@\w{1,15}$/.test(input);
}

const TWITTER_RESERVED_PATHS = new Set([
  'home', 'explore', 'search', 'notifications', 'messages',
  'settings', 'i', 'about', 'tos', 'privacy', 'login', 'signup',
  'compose', 'lists', 'bookmarks', 'communities', 'jobs',
]);

/** Check if input is a Twitter profile URL (not a tweet URL or reserved path) */
function isTwitterProfileUrl(input: string): boolean {
  const match = /^(?:https?:\/\/)?(?:x\.com|twitter\.com)\/(\w{1,15})\/?(?:[?#].*)?$/.exec(input);
  if (!match) return false;
  return !TWITTER_RESERVED_PATHS.has(match[1]!.toLowerCase());
}

/** Extract handle from @mention or profile URL. Returns null if neither or reserved path. */
function extractTwitterHandle(input: string): string | null {
  const handleMatch = /^@(\w{1,15})$/.exec(input);
  if (handleMatch) return handleMatch[1]!;
  const urlMatch = /(?:x\.com|twitter\.com)\/(\w{1,15})\/?(?:[?#].*)?$/.exec(input);
  if (!urlMatch) return null;
  const handle = urlMatch[1]!;
  if (TWITTER_RESERVED_PATHS.has(handle.toLowerCase())) return null;
  return handle;
}

interface ParsedFlags {
  target: string;
  eval: boolean;
  mutate: boolean;
  quick: boolean;
  variants?: number;
  mutations?: number;
  threshold?: number;
}

function parseRoastFlags(input: string): ParsedFlags {
  const hasEval = /(?:^|\s)--eval\b/.test(input);
  const hasMutate = /(?:^|\s)--mutate\b/.test(input);
  const hasQuick = /(?:^|\s)--quick\b/.test(input);

  const variantsMatch = /(?:^|\s)--variants\s+(\d+)/.exec(input);
  const mutationsMatch = /(?:^|\s)--mutations\s+(\d+)/.exec(input);
  const thresholdMatch = /(?:^|\s)--threshold\s+([\d.]+)/.exec(input);

  const target = input
    .replace(/(?:^|\s)--(?:eval|mutate|quick)\b/g, '')
    .replace(/(?:^|\s)--variants\s+\d+/g, '')
    .replace(/(?:^|\s)--mutations\s+\d+/g, '')
    .replace(/(?:^|\s)--threshold\s+[\d.]+/g, '')
    .trim();

  return {
    target,
    eval: hasEval,
    mutate: hasMutate,
    quick: hasQuick,
    variants: variantsMatch ? parseInt(variantsMatch[1]!, 10) : undefined,
    mutations: mutationsMatch ? parseInt(mutationsMatch[1]!, 10) : undefined,
    threshold: thresholdMatch ? parseFloat(thresholdMatch[1]!) : undefined,
  };
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Split at last newline within limit
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt <= 0) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }
  return chunks;
}

function isGroupChat(ctx: Context): boolean {
  return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}

export function createBot(opts: {
  token: string;
  adminIds: number[];
  openAccess: boolean;
  feedbackRepo: FeedbackRepository;
  provider: ProviderManager | null;
  logger: Logger;
  queueManager?: QueueManager;
  configRepo?: ConfigRepository;
  exampleRepo?: ExternalExampleRepository;
  patternRepo?: RoastPatternRepository;
  stockpileRepo?: StockpileRepository;
  farmAttemptRepo?: FarmAttemptRepository;
  roastRepo?: RoastRepository;
  postingMode?: { autonomous: boolean; mentionReplies: boolean };
  pollMentions?: () => Promise<PollResult>;
  getSchedulerJobs?: () => JobInfo[];
  twitterEnabled?: boolean;
  beefEnv?: string;
  twitterUsername?: string;
  twitterClient?: ITwitterClient;
  twitterEnricher?: TwitterEnricher;
  memeGenerator?: MemeGenerator;
  metricsRepo?: MetricsRepository;
  anthropicApiKey?: string;
  openaiApiKey?: string;
}): Bot {
  const { token, adminIds, openAccess, feedbackRepo, provider, logger, queueManager, configRepo, exampleRepo, patternRepo, stockpileRepo, farmAttemptRepo, roastRepo, postingMode, pollMentions } = opts;
  const twitterUsername = opts.twitterUsername || '0xBeefer';
  const memeGen = opts.memeGenerator;
  const transcriber = opts.openaiApiKey ? new Transcriber(opts.openaiApiKey, logger) : null;
  const feedbackCollector = new FeedbackCollector(logger);
  const bot = new Bot(token);

  // --- Admin guard (skip if openAccess or no IDs configured) ---
  if (!openAccess && adminIds.length > 0) {
    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || !adminIds.includes(userId)) {
        logger.warn({ userId, username: ctx.from?.username }, 'Unauthorized access attempt');
        // In groups, silently ignore. In private chats, respond.
        if (!isGroupChat(ctx)) {
          await ctx.reply('⛔ Access denied.');
        }
        return;
      }
      await next();
    });
  }

  // --- Error handler ---
  bot.catch((err) => {
    logger.error({ err: err.error, update: err.ctx.update.update_id }, 'Bot error');
  });

  // --- Commands ---

  bot.command('start', async (ctx) => {
    await ctx.reply(
      [
        '<b>🥩 $BEEF Roast Evaluator</b>',
        '',
        '<b>Generation:</b>',
        '/roast &lt;target&gt; — Sonnet, 9 variants (3×3)',
        '/roasttweet &lt;tweet_url&gt; — Opus roast of a specific tweet (full enrichment + eval)',
        '/farm &lt;target&gt; — 6 variants + mutations + serious eval',
        '/meme &lt;target&gt; | #&lt;id&gt; | &lt;tweet_url&gt; — generate meme',
        '',
        '<b>Twitter:</b>',
        '/follow @handle1 @handle2 — follow accounts (15-45s jitter)',
        '',
        '<b>Feedback:</b>',
        '/feedback — batch feedback session (forward roasts + voice/text)',
        '',
        '<b>Management:</b>',
        '/stats · /status · /help',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        '<b>🥩 $BEEF — Command Reference</b>',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━',
        '<b>📝 /roast</b> &lt;target&gt; [flags]',
        'Universal roast — auto-detects target type:',
        '  <code>/roast https://x.com/.../status/...</code> — tweet',
        '  <code>/roast @handle</code> — person (enriched)',
        '  <code>/roast https://x.com/handle</code> — person',
        '  <code>/roast hyperliquid</code> — freeform',
        '  Operator context: second line = hints/angles/news',
        '  <code>--eval</code> <code>--mutate</code> <code>--variants N</code> <code>--mutations N</code>',
        '',
        '<b>🌾 /farm</b> &lt;target&gt; [flags]',
        'Farm · 3 strategies × 2 = <b>6 variants</b> · 2 mutations · serious eval (5 judges)',
        '  <code>--variants N</code>  per strategy <i>(default: 2, total: N×3)</i>',
        '  <code>--mutations N</code> creative mutations <i>(default: 2)</i>',
        '  <code>--threshold N</code> stockpile min score <i>(default: 3.5)</i>',
        '  <code>--quick</code>       1-judge eval instead of 5-judge',
        '',
        '<b>🖼 /meme</b> &lt;target&gt; | #&lt;id&gt; | &lt;tweet_url&gt;',
        'Generate standalone meme roast',
        '  <code>/meme hyperliquid</code> — meme for target name',
        '  <code>/meme #42</code> — meme from stockpile entry',
        '  <code>/meme https://x.com/...</code> — meme response to tweet',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━',
        '<b>🐦 Twitter</b>',
        '<code>/follow @h1 @h2 ...</code> — follow accounts (15-45s jitter delay)',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━',
        '<b>📋 Queue &amp; Posting</b>',
        '<code>/queue &lt;target&gt;</code> — add target to posting queue',
        '<code>/queue &lt;tweet_url&gt;</code> — roast a specific tweet (reply)',
        '<code>/trigger</code> — force-process next queue item',
        '<code>/poll</code> — check for new mentions',
        '<code>/approve on|off</code> — require approval for feed posts',
        '<code>/approve_mentions on|off</code> — require approval for mention replies',
        '<code>/pause</code> / <code>/resume</code> — toggle autonomous posting',
        '',
        '<b>📊 Monitoring</b>',
        '<code>/status</code> — bot health, queue, stockpile',
        '<code>/quota</code> — LLM provider quotas &amp; limits',
        '<code>/stats</code> — feedback statistics',
        '<code>/diagnose</code> — provider health check',
        '<code>/reset</code> — force-reset provider to primary',
        '',
        '<b>📦 Stockpile</b>',
        '<code>/stockpile &lt;target&gt;</code> — list roasts for a target',
        '<code>/stockpile top [N]</code> — top N ready to post <i>(default 5)</i>',
        '<code>/unrated [N]</code> — blind review of unrated roasts',
        '<code>/srate &lt;id&gt; &lt;1-5&gt;</code> — set human score',
        '<code>/sdel &lt;id&gt;</code> — delete from stockpile',
        '<code>/sadd &lt;target&gt;</code> — add text (reply to msg or next line)',
        '',
        '<b>🏆 Curation</b>',
        '<code>/promote &lt;id&gt;</code> — stockpile → CreativeMemory',
        '',
        '<b>💬 Feedback</b>',
        '<code>/feedback</code> — start batch feedback session',
        '  Forward roasts from bot, then send feedback (text / voice / video note)',
        '  Send <b>стоп</b> to finalize and get structured report',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  interface RoastCommandOpts {
    ctx: Context;
    target: string;
    profile: TaskProfile;
    variantCount: number;
    progressEmoji: string;
    progressLabel: string;
    evaluationMode?: EvaluationMode;
    mutationCount?: number;
    evaluationThreshold?: number;
    settingsLines?: string[];
    profileContext?: string;
    targetType?: 'person' | 'project' | 'token' | 'trend';
    imagePaths?: string[];
    userContext?: string;
  }

  function handleRoastCommand(o: RoastCommandOpts): void {
    const chatId = o.ctx.chat!.id;
    const api = o.ctx.api;

    // Fire-and-forget: don't block grammY's update loop during generation
    void (async () => {
      // Build initial status with optional settings block
      const settingsBlock = o.settingsLines && o.settingsLines.length > 0
        ? '\n' + o.settingsLines.join('\n')
        : '';
      const statusMsg = await api.sendMessage(
        chatId,
        `${o.progressEmoji} ${o.progressLabel} <b>${escapeHtml(o.target)}</b>...${settingsBlock}`,
        { parse_mode: 'HTML' },
      );

      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        api
          .editMessageText(
            chatId,
            statusMsg.message_id,
            `${o.progressEmoji} ${o.progressLabel} <b>${escapeHtml(o.target)}</b>... <i>(${String(elapsed)}s)</i>${settingsBlock}`,
            { parse_mode: 'HTML' },
          )
          .catch(() => {});
      }, 10_000);

      try {
        const output = await generateRoasts(
          o.target, provider!, logger, feedbackRepo, o.profile, o.variantCount,
          configRepo, exampleRepo, patternRepo,
          o.imagePaths, o.profileContext, o.evaluationMode, stockpileRepo, o.mutationCount,
          farmAttemptRepo, o.evaluationThreshold,
          undefined, o.targetType, undefined, o.userContext,
        );

        clearInterval(progressInterval);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        // Build combined message: status header + results in a single message
        const researchNote = output.researchNotes
          ? `\n<i>${escapeHtml(output.researchNotes.slice(0, 200))}</i>`
          : '';
        const header = `✅ <b>${escapeHtml(o.target)}</b> — ${String(output.variants.length)} variants, ${String(elapsed)}s${researchNote}`;
        const result = formatRoastOutput(o.target, output, o.evaluationMode);
        const advisor = buildPostingAdvisor();
        const body = advisor ? header + '\n\n' + result + '\n' + advisor : header + '\n\n' + result;
        await api.editMessageText(
          chatId,
          statusMsg.message_id,
          body,
          { parse_mode: 'HTML' },
        );
      } catch (error) {
        clearInterval(progressInterval);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        logger.error({ err: error, target: o.target, profile: o.profile, elapsedSec: elapsed }, 'Roast generation failed');
        await api
          .editMessageText(
            chatId,
            statusMsg.message_id,
            `❌ Generation failed after ${String(elapsed)}s: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
            { parse_mode: 'HTML' },
          )
          .catch(() => {});
      }
    })();
  }

  /**
   * Formats roast output for Telegram.
   * Stockpile case: numbered list with blind-eval instruction.
   * Discard case: brief rejection message.
   */
  function formatRoastOutput(
    target: string,
    output: GenerateRoastsResult,
    evaluationMode?: EvaluationMode,
  ): string {
    const hasEval = evaluationMode && evaluationMode !== 'none' && output.evaluation;
    const variants = output.variants;

    // No evaluation — just show all variants as plain text
    if (!hasEval) {
      const lines: string[] = [];
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]!;
        const header = `<b>${String(i + 1)}.</b> <i>${escapeHtml(v.angle)}</i>`;
        lines.push(`${header}\n<code>${escapeHtml(v.text)}</code>`);
      }
      return lines.join('\n\n');
    }

    const eval_ = output.evaluation!;
    const verdict = eval_.verdict;

    if (verdict !== 'stockpile') {
      const lines: string[] = [];
      lines.push(`❌ <i>All ${String(variants.length)} variants scored below threshold.</i>`);
      if (eval_.preFilterReason) {
        lines.push(`<i>Pre-filter: ${escapeHtml(eval_.preFilterReason)}</i>`);
      }
      if (eval_.vetoReasons && eval_.vetoReasons.length > 0) {
        lines.push(`<i>Veto: ${escapeHtml(eval_.vetoReasons[0]!)}</i>`);
      }
      return lines.join('\n');
    }

    // Stockpile — numbered list with blind-eval instruction
    const best = variants[0]!;
    const lines: string[] = [];
    lines.push(`🗄 <b>STOCKPILE</b>`);
    lines.push('');
    lines.push(`<i>Оцени от 0 до 5:</i>`);
    lines.push('');
    lines.push(`<b>1.</b> <b>${escapeHtml(target)}</b>  AI: <code>?</code>`);
    lines.push(`<pre>${escapeHtml(best.text)}</pre>`);

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Tweet roast pipeline — shared by /roast (tweet URL detected) and /roasttweet
  // ---------------------------------------------------------------------------

  function handleTweetRoast(ctx: Context, tweetUrl: string, userContext?: string): void {
    if (!provider) {
      void ctx.reply('⚠️ LLM provider not configured.');
      return;
    }
    const twitterClient = opts.twitterClient;
    if (!twitterClient?.getTweet) {
      void ctx.reply('⚠️ Twitter client not configured or getTweet not available.');
      return;
    }
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const api = ctx.api;

    void (async () => {
      const startTime = Date.now();
      const statusMsg = await api.sendMessage(chatId, '🔍 Fetching tweet...');
      let mediaCleanup: (() => Promise<void>) | undefined;
      let ctxKey: string | undefined;

      const updateStatus = (stage: string): void => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        api
          .editMessageText(chatId, statusMsg.message_id, `${stage} <i>(${String(elapsed)}s)</i>`, { parse_mode: 'HTML' })
          .catch(() => {});
      };

      try {
        const tweetId = parseTweetUrl(tweetUrl);
        if (!tweetId) {
          await api.editMessageText(chatId, statusMsg.message_id, '❌ Invalid tweet URL.');
          return;
        }

        const tweet = await twitterClient.getTweet!(tweetId);
        if (!tweet) {
          await api.editMessageText(chatId, statusMsg.message_id, '❌ Could not fetch tweet. It may be deleted or protected.');
          return;
        }

        const targetName = tweet.authorName;

        updateStatus('🖼 Downloading media...');
        let imagePaths: string[] = [];
        if (tweet.mediaUrls && tweet.mediaUrls.length > 0) {
          try {
            const media = await downloadTweetMedia(tweet.mediaUrls, logger);
            imagePaths = media.paths;
            mediaCleanup = media.cleanup;
          } catch (err) {
            logger.warn({ err, tweetId: tweet.tweetId }, 'Media download failed — continuing without');
          }
        }

        updateStatus('👤 Enriching author profile...');
        let enrichmentContext: string | undefined;
        let enrichedFollowers: number | null = null;
        if (opts.twitterEnricher) {
          try {
            const enrichment = await opts.twitterEnricher.enrich(targetName);
            if (enrichment?.hasData) {
              enrichmentContext = enrichment.profileContext;
              enrichedFollowers = enrichment.followersCount;
            }
          } catch (err) {
            logger.warn({ err, target: targetName }, 'Author enrichment failed — continuing without');
          }
        }

        let parentTweet: { text: string; author: string } | undefined;
        let quotedTweet: { text: string; author: string } | undefined;
        const refTweetId = tweet.inReplyToTweetId ?? tweet.quotedTweetId;
        if (refTweetId && twitterClient.getTweet) {
          try {
            updateStatus('🔗 Fetching referenced tweet...');
            const refTweet = await twitterClient.getTweet(refTweetId);
            if (refTweet) {
              const ref = { text: refTweet.text, author: refTweet.authorName };
              if (tweet.inReplyToTweetId) parentTweet = ref;
              else quotedTweet = ref;
            }
          } catch (err) {
            logger.warn({ err, refTweetId }, 'Referenced tweet fetch failed — continuing without');
          }
        }

        const tweetAgeDays = tweet.createdAt
          ? Math.floor((Date.now() - new Date(tweet.createdAt).getTime()) / 86_400_000)
          : undefined;

        const contextInput: TweetRoastContextInput = {
          tweetText: tweet.text,
          tweetAuthor: targetName,
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

        ctxKey = `rt-${Date.now()}-${tweetId}`;
        roastTweetContexts.set(ctxKey, {
          tweetUrl,
          targetName,
          profileContext,
          imagePaths,
          cleanup: mediaCleanup,
          userContext,
        });

        // Cleanup helper — removes context cache + temp media files
        const scheduleCleanup = (delayMs: number): void => {
          const key = ctxKey;
          setTimeout(() => {
            if (mediaCleanup) mediaCleanup().catch(() => {});
            if (key) roastTweetContexts.delete(key);
          }, delayMs);
        };

        updateStatus(`⚡ Generating roasts for <b>${escapeHtml(targetName)}</b>...`);

        const output = await generateRoasts(
          targetName, provider, logger, feedbackRepo, 'farm-generate', 3,
          configRepo, exampleRepo, patternRepo,
          imagePaths.length > 0 ? imagePaths : undefined,
          profileContext,
          'quick', stockpileRepo, 1,
          farmAttemptRepo, undefined,
          false, 'person', true,
          userContext,
        );

        const elapsed = Math.round((Date.now() - startTime) / 1000);

        const normalizedUrl = tweetUrl.startsWith('http') ? tweetUrl : `https://${tweetUrl}`;
        const headerLines: string[] = [
          `⚡ <b>${escapeHtml(targetName)}</b> — ${String(elapsed)}s`,
          `<a href="${escapeHtml(normalizedUrl)}">Original tweet</a>`,
        ];
        if (output.evaluation) {
          headerLines[0] += ` · eval ${output.evaluation.compositeScore.toFixed(1)}/5`;
        }

        const variants = output.variants;
        if (variants.length === 0) {
          headerLines.push('');
          headerLines.push('❌ <i>All variants filtered or scored below threshold.</i>');
          if (output.evaluation?.preFilterReason) {
            headerLines.push(`<i>Pre-filter: ${escapeHtml(output.evaluation.preFilterReason)}</i>`);
          }
          await api.editMessageText(chatId, statusMsg.message_id, headerLines.join('\n'), { parse_mode: 'HTML' });
          scheduleCleanup(30_000);
          return;
        }

        headerLines.push('');
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i]!;
          headerLines.push(`<b>${String(i + 1)}.</b> <i>${escapeHtml(v.angle)}</i>`);
          headerLines.push(`<pre>${escapeHtml(v.text)}</pre>`);
          headerLines.push('');
        }

        const advisor = buildPostingAdvisor(enrichedFollowers);
        if (advisor) headerLines.push(advisor);

        const keyboard = new InlineKeyboard()
          .text('🔄 Regen', `rt-regen:${ctxKey}`);

        await api.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
        await api.sendMessage(chatId, headerLines.join('\n'), {
          parse_mode: 'HTML',
          reply_markup: keyboard,
          link_preview_options: { is_disabled: true },
        });

        // Keep context alive for 10 min for regen button
        scheduleCleanup(600_000);

      } catch (error) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        logger.error({ err: error, url: tweetUrl, elapsedSec: elapsed }, 'Tweet roast pipeline failed');
        // Clean up context cache + media on failure
        if (mediaCleanup) mediaCleanup().catch(() => {});
        if (ctxKey) roastTweetContexts.delete(ctxKey);
        await api
          .editMessageText(
            chatId,
            statusMsg.message_id,
            `❌ Failed after ${String(elapsed)}s: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
            { parse_mode: 'HTML' },
          )
          .catch(() => {});
      }
    })();
  }

  // ---------------------------------------------------------------------------
  // Person roast via @handle or profile URL — enriches first, then generates
  // ---------------------------------------------------------------------------

  function handlePersonRoast(ctx: Context, handle: string, flags: ParsedFlags, userContext?: string): void {
    if (!provider) {
      void ctx.reply('⚠️ LLM provider not configured.');
      return;
    }
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const api = ctx.api;

    void (async () => {
      const startTime = Date.now();
      const statusMsg = await api.sendMessage(
        chatId,
        `👤 Enriching <b>@${escapeHtml(handle)}</b>...`,
        { parse_mode: 'HTML' },
      );

      let enrichmentContext: string | undefined;
      let enrichedFollowers: number | null = null;
      if (opts.twitterEnricher) {
        try {
          const enrichment = await opts.twitterEnricher.enrich(handle);
          if (enrichment?.hasData) {
            enrichmentContext = enrichment.profileContext;
            enrichedFollowers = enrichment.followersCount;
          }
        } catch (err) {
          logger.warn({ err, target: handle }, 'Person enrichment failed — continuing without');
        }
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      await api.editMessageText(
        chatId, statusMsg.message_id,
        `🔍 Researching <b>@${escapeHtml(handle)}</b>... <i>(enriched in ${String(elapsed)}s)</i>`,
        { parse_mode: 'HTML' },
      ).catch(() => {});

      const variants = flags.variants ?? 3;
      const evalMode = flags.eval ? 'quick' as const : undefined;
      const mutations = flags.mutate ? (flags.mutations ?? 1) : undefined;

      try {
        const output = await generateRoasts(
          handle, provider, logger, feedbackRepo, 'roast-research', variants,
          configRepo, exampleRepo, patternRepo,
          undefined, enrichmentContext, evalMode, stockpileRepo, mutations,
          farmAttemptRepo, undefined,
          undefined, 'person', undefined, userContext,
        );

        const totalElapsed = Math.round((Date.now() - startTime) / 1000);

        const researchNote = output.researchNotes
          ? `\n<i>${escapeHtml(output.researchNotes.slice(0, 200))}</i>`
          : '';
        const header = `✅ <b>@${escapeHtml(handle)}</b> — ${String(output.variants.length)} variants, ${String(totalElapsed)}s${researchNote}`;
        const result = formatRoastOutput(handle, output, evalMode);
        const advisor = buildPostingAdvisor(enrichedFollowers);
        const body = advisor ? header + '\n\n' + result + '\n' + advisor : header + '\n\n' + result;
        await api.editMessageText(
          chatId,
          statusMsg.message_id,
          body,
          { parse_mode: 'HTML' },
        );
      } catch (error) {
        const totalElapsed = Math.round((Date.now() - startTime) / 1000);
        logger.error({ err: error, target: handle, elapsedSec: totalElapsed }, 'Person roast failed');
        await api
          .editMessageText(
            chatId,
            statusMsg.message_id,
            `❌ Generation failed after ${String(totalElapsed)}s: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
            { parse_mode: 'HTML' },
          )
          .catch(() => {});
      }
    })();
  }

  // ---------------------------------------------------------------------------
  // /roast — unified command: tweet URL | @handle | profile URL | freeform target
  // Context: everything after the first line becomes operator context
  // ---------------------------------------------------------------------------

  bot.command('roast', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply(
        [
          'Usage: /roast &lt;target&gt; [flags]',
          '',
          'Target types:',
          '  <code>/roast https://x.com/.../status/...</code> — roast a tweet',
          '  <code>/roast @handle</code> — roast a person',
          '  <code>/roast https://x.com/handle</code> — roast a person',
          '  <code>/roast hyperliquid</code> — roast anything',
          '',
          'Operator context (optional, second line):',
          '  <code>/roast @handle</code>',
          '  <code>he shilled 3 rugs this week, focus on that</code>',
          '',
          'Flags: <code>--eval</code> <code>--mutate</code> <code>--variants N</code>',
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (!provider) {
      await ctx.reply('⚠️ LLM provider not configured. Paste roasts manually for evaluation.');
      return;
    }

    // Split first line (target + flags) from subsequent lines (operator context)
    const lines = raw.split('\n');
    const firstLine = lines[0]!.trim();
    const userContext = lines.slice(1).join('\n').trim() || undefined;

    const flags = parseRoastFlags(firstLine);
    if (!flags.target) {
      await ctx.reply('Usage: /roast &lt;target&gt;\nExample: /roast hyperliquid --eval', { parse_mode: 'HTML' });
      return;
    }

    const target = flags.target;

    // --- Mode 1: Tweet URL ---
    if (isTweetUrl(target)) {
      handleTweetRoast(ctx, target, userContext);
      return;
    }

    // --- Mode 2: @handle ---
    if (isTwitterHandle(target)) {
      const handle = target.slice(1); // strip @
      handlePersonRoast(ctx, handle, flags, userContext);
      return;
    }

    // --- Mode 3: Profile URL ---
    if (isTwitterProfileUrl(target)) {
      const handle = extractTwitterHandle(target);
      if (handle) {
        handlePersonRoast(ctx, handle, flags, userContext);
        return;
      }
    }

    // --- Mode 4: Freeform target ---
    const variants = flags.variants ?? 3;
    const evalMode = flags.eval ? 'quick' as const : undefined;
    const mutations = flags.mutate ? (flags.mutations ?? 1) : undefined;

    handleRoastCommand({
      ctx, target, profile: 'roast-research',
      variantCount: variants, progressEmoji: '🔍', progressLabel: 'Researching',
      evaluationMode: evalMode, mutationCount: mutations, userContext,
    });
  });

  bot.command('farm', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply(
        [
          'Usage: /farm &lt;target&gt; [flags]',
          '',
          'Flags:',
          '  <code>--variants N</code>  — variants per strategy (default 2)',
          '  <code>--mutations N</code> — creative mutations (default 2)',
          '  <code>--threshold N</code> — stockpile threshold (default 3.5)',
          '  <code>--quick</code>       — quick eval (1 judge) instead of serious (5)',
          '',
          'Example: /farm hyperliquid --variants 4 --threshold 3.8',
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (!provider) {
      await ctx.reply('⚠️ LLM provider not configured.');
      return;
    }

    const flags = parseRoastFlags(raw);
    if (!flags.target) {
      await ctx.reply('Usage: /farm &lt;target&gt;');
      return;
    }

    const variants = flags.variants ?? 2;
    const mutations = flags.mutations ?? 2;
    const threshold = flags.threshold ?? 3.5;
    const evalMode: EvaluationMode = flags.quick ? 'quick' : 'serious';
    const judgeCount = evalMode === 'quick' ? 1 : 5;

    const total = variants * 3;
    const settingsLines = [
      `<i>⚙️ ${String(variants)}×3 = ${String(total)} variants · ${String(mutations)} mutations · ${evalMode} (${String(judgeCount)}J) · threshold ${threshold.toFixed(1)}</i>`,
    ];

    handleRoastCommand({
      ctx, target: flags.target, profile: 'farm-generate',
      variantCount: variants, progressEmoji: '🌾', progressLabel: 'Farm-quality generation —',
      evaluationMode: evalMode, mutationCount: mutations,
      evaluationThreshold: threshold, settingsLines,
    });
  });

  // Context cache for regen — keyed by a unique ID per tweet roast invocation
  const roastTweetContexts = new Map<string, {
    tweetUrl: string;
    targetName: string;
    profileContext: string;
    imagePaths: string[];
    cleanup?: () => Promise<void>;
    userContext?: string;
  }>();

  // /roasttweet — alias for /roast with tweet URL
  bot.command('roasttweet', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply('Usage: /roasttweet &lt;tweet_url&gt;\nUse <code>/roast &lt;tweet_url&gt;</code> instead — same thing.', { parse_mode: 'HTML' });
      return;
    }
    // Split context from first line, same as /roast
    const lines = raw.split('\n');
    const tweetUrl = lines[0]!.trim();
    const userContext = lines.slice(1).join('\n').trim() || undefined;
    if (!isTweetUrl(tweetUrl)) {
      await ctx.reply('Usage: /roasttweet &lt;tweet_url&gt;\nExample: /roasttweet https://x.com/user/status/123456', { parse_mode: 'HTML' });
      return;
    }
    handleTweetRoast(ctx, tweetUrl, userContext);
  });

  // ---------------------------------------------------------------------------
  // /meme — generate meme from target name, stockpile #id, or tweet URL
  // ---------------------------------------------------------------------------

  bot.command('meme', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply(
        'Usage:\n/meme &lt;target&gt; — standalone meme for target\n/meme #&lt;id&gt; — meme from stockpile entry\n/meme &lt;tweet_url&gt; — witty meme response to tweet',
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (!memeGen) {
      await ctx.reply('⚠️ Meme generator not configured (IMGFLIP_USERNAME/PASSWORD missing or no LLM provider).');
      return;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const api = ctx.api;

    void (async () => {
      const startTime = Date.now();
      let statusMsgId: number | undefined;

      try {
        const statusMsg = await api.sendMessage(chatId, '🎨 Generating meme...');
        statusMsgId = statusMsg.message_id;
        // --- Mode 1: Stockpile entry (#id) ---
        const stockpileMatch = /^#(\d+)$/.exec(raw);
        if (stockpileMatch && stockpileRepo) {
          const id = parseInt(stockpileMatch[1]!, 10);
          const entry = stockpileRepo.getById(id);
          if (!entry) {
            await api.editMessageText(chatId, statusMsg.message_id, `❌ Stockpile #${String(id)} not found.`);
            return;
          }

          await api.editMessageText(chatId, statusMsg.message_id, `🎨 Meme for <b>${escapeHtml(entry.targetName)}</b> (stockpile #${String(id)})...`, { parse_mode: 'HTML' });

          const result = await memeGen.generate({
            target: entry.targetName,
            targetType: (entry.targetType ?? 'project') as 'project' | 'person',
            roastText: entry.tweetText,
            context: entry.researchNotes?.slice(0, 1500),
            roastAngle: entry.angle ?? undefined,
            preferStandalone: true,
            stockpileId: id,
          });

          await sendMemeResult(api, chatId, statusMsg.message_id, result, entry.targetName, startTime);
          return;
        }

        // --- Mode 2: Tweet URL ---
        if (isTweetUrl(raw)) {
          const twitterClient = opts.twitterClient;
          if (!twitterClient?.getTweet) {
            await api.editMessageText(chatId, statusMsg.message_id, '⚠️ Twitter client not available for tweet fetch.');
            return;
          }

          const tweetId = parseTweetUrl(raw);
          if (!tweetId) {
            await api.editMessageText(chatId, statusMsg.message_id, '❌ Invalid tweet URL.');
            return;
          }

          await api.editMessageText(chatId, statusMsg.message_id, '🔍 Fetching tweet...', { parse_mode: 'HTML' });
          const tweet = await twitterClient.getTweet(tweetId);
          if (!tweet) {
            await api.editMessageText(chatId, statusMsg.message_id, '❌ Could not fetch tweet.');
            return;
          }

          // Build context from tweet
          const contextInput: TweetRoastContextInput = {
            tweetText: tweet.text,
            tweetAuthor: tweet.authorName,
          };
          const tweetContext = buildTweetRoastContext(contextInput);

          await api.editMessageText(chatId, statusMsg.message_id, `🎨 Meme response to <b>${escapeHtml(tweet.authorName)}</b>...`, { parse_mode: 'HTML' });

          const result = await memeGen.generate({
            target: tweet.authorName,
            targetType: 'person',
            context: tweetContext,
            isTweetResponse: true,
            preferStandalone: true,
          });

          await sendMemeResult(api, chatId, statusMsg.message_id, result, tweet.authorName, startTime, raw);
          return;
        }

        // --- Mode 3: Target name ---
        await api.editMessageText(chatId, statusMsg.message_id, `🎨 Meme for <b>${escapeHtml(raw)}</b>...`, { parse_mode: 'HTML' });

        const result = await memeGen.generate({
          target: raw,
          targetType: 'project',
          preferStandalone: true,
        });

        await sendMemeResult(api, chatId, statusMsg.message_id, result, raw, startTime);
      } catch (error) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        logger.error({ err: error, raw, elapsed }, '/meme command failed');
        const errText = `❌ Meme failed (${String(elapsed)}s): ${escapeHtml(getErrorMessage(error).slice(0, 200))}`;
        if (statusMsgId) {
          await api.editMessageText(chatId, statusMsgId, errText, { parse_mode: 'HTML' }).catch(() => {});
        } else {
          await api.sendMessage(chatId, errText, { parse_mode: 'HTML' }).catch(() => {});
        }
      }
    })();
  });

  /** Send meme result as photo or text fallback. */
  async function sendMemeResult(
    api: Bot['api'],
    chatId: number,
    statusMsgId: number,
    result: Awaited<ReturnType<MemeGenerator['generate']>>,
    targetName: string,
    startTime: number,
    tweetUrl?: string,
  ): Promise<void> {
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    if (result.meme) {
      const captionLines = [
        `🎨 <b>${escapeHtml(targetName)}</b> — ${String(elapsed)}s`,
        `Template: ${result.meme.templateName}`,
        `Format: ${result.format}`,
      ];
      if (tweetUrl) {
        captionLines.push(`<a href="${escapeHtml(tweetUrl)}">Original tweet</a>`);
      }
      if (result.tweetText) {
        captionLines.push('');
        captionLines.push(`<code>${escapeHtml(result.tweetText)}</code>`);
      }
      const memeAdvisor = buildPostingAdvisor();
      if (memeAdvisor) captionLines.push(memeAdvisor);

      // Send photo BEFORE deleting status — if sendPhoto fails, user still sees status
      try {
        await api.sendPhoto(chatId, new InputFile(result.meme.localPath), {
          caption: captionLines.join('\n'),
          parse_mode: 'HTML',
        });
        await api.deleteMessage(chatId, statusMsgId).catch(() => {});
      } finally {
        void ImgflipClient.cleanupTmpFile(result.meme.localPath);
      }
    } else {
      // Text-only fallback
      const degradation = result.degradationReason ? ` [${result.degradationReason}]` : '';
      const lines = [
        `📝 <b>${escapeHtml(targetName)}</b> — text only (${String(elapsed)}s)${degradation}`,
        '',
        `<code>${escapeHtml(result.tweetText)}</code>`,
      ];
      const textAdvisor = buildPostingAdvisor();
      if (textAdvisor) lines.push(textAdvisor);
      await api.editMessageText(chatId, statusMsgId, lines.join('\n'), { parse_mode: 'HTML' });
    }
  }

  // ---------------------------------------------------------------------------
  // Posting advisor — appended to roast/meme outputs as a footer
  // ---------------------------------------------------------------------------

  function buildPostingAdvisor(targetFollowers?: number | null): string {
    if (!roastRepo) return '';

    const mentionCount = roastRepo.getTodayCount('mention');
    const casualCount = roastRepo.getTodayCount('casual_reply');
    const autoCount = roastRepo.getTodayCount('autonomous');
    const replyGuyCount = roastRepo.getTodayCount('reply_guy');
    const totalPosted = mentionCount + casualCount + autoCount + replyGuyCount;

    const maxRecommended = 15;
    const remaining = Math.max(0, maxRecommended - totalPosted);

    // BKK time (UTC+7) — same timezone as Vietnam
    const now = new Date();
    const bkkHour = (now.getUTCHours() + 7) % 24;
    const bkkMin = String(now.getUTCMinutes()).padStart(2, '0');

    // Time quality based on metrics data
    // Best: 19:00–05:00 BKK (12:00–22:00 UTC) — ER 7-14%
    // Dead: 14:00–17:00 BKK (07:00–10:00 UTC) — ER <1%
    const isPrime = bkkHour >= 19 || bkkHour <= 5;
    const isDead = bkkHour >= 14 && bkkHour <= 17;
    const timeEmoji = isPrime ? '🟢' : isDead ? '🔴' : '🟡';
    const timeLabel = isPrime ? 'прайм-тайм' : isDead ? 'мёртвая зона' : 'нормально';

    const lines: string[] = ['─────────────────'];

    if (targetFollowers != null && targetFollowers > 0) {
      const tier = targetFollowers >= 100_000 ? '🔥 отличный reach'
        : targetFollowers >= 10_000 ? '✅ хороший reach'
        : targetFollowers >= 1_000 ? '👌 средний'
        : targetFollowers >= 250 ? '📉 малый' : '⚠️ <250 фолловеров';
      lines.push(`<i>🎯 ${targetFollowers.toLocaleString()} followers — ${tier}</i>`);
    }

    lines.push(`<i>📊 Сегодня: ${String(totalPosted)}/15 постов (осталось ${String(remaining)})</i>`);
    lines.push(`<i>⏰ ${String(bkkHour)}:${bkkMin} BKK ${timeEmoji} ${timeLabel}</i>`);
    lines.push(`<i>Лучшие часы: 19:00–05:00 BKK · Мёртвая зона: 14:00–17:00</i>`);

    if (remaining <= 3 && remaining > 0) {
      lines.push(`<i>⚠️ Лимит почти достигнут — выбирай только топ-таргеты</i>`);
    } else if (remaining === 0) {
      lines.push(`<i>🛑 Дневной лимит достигнут — рекомендуем не постить</i>`);
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // /follow @handle1 @handle2 ... — follow Twitter users with safe delays
  // ---------------------------------------------------------------------------
  bot.command('follow', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply(
        'Usage: /follow @handle1 https://x.com/handle2 ...\nAccepts handles, x.com and twitter.com URLs, comma or space separated.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const followFn = opts.twitterClient?.followUser?.bind(opts.twitterClient);
    if (!followFn) {
      await ctx.reply('❌ Twitter API client not configured or does not support follows.');
      return;
    }

    // Parse handles: accept @handle, bare handle, or x.com/twitter.com URLs
    const handles = raw
      .split(/[\s,]+/)
      .map((token) => {
        const trimmed = token.trim();
        // Extract username from twitter.com or x.com URLs
        const urlMatch = /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15})\/?(?:\?.*)?$/.exec(trimmed);
        if (urlMatch) return urlMatch[1]!;
        // Strip leading @
        return trimmed.replace(/^@/, '');
      })
      .filter((h) => h.length > 0 && /^[a-zA-Z0-9_]{1,15}$/.test(h));

    if (handles.length === 0) {
      await ctx.reply('❌ No valid Twitter handles found. Accepts handles (1-15 chars) or x.com/twitter.com profile URLs.');
      return;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const api = ctx.api;

    // Deduplicate (case-insensitive)
    const seen = new Set<string>();
    const uniqueHandles: string[] = [];
    for (const h of handles) {
      const lower = h.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        uniqueHandles.push(h);
      }
    }

    const statusMsg = await api.sendMessage(
      chatId,
      `🔄 Following <b>${String(uniqueHandles.length)}</b> accounts...\n<i>Delay between follows: ~15-45s (jitter)</i>`,
      { parse_mode: 'HTML' },
    );

    // Fire-and-forget: don't block grammY's update loop
    void (async () => {
      try {
        const results: { username: string; ok: boolean; detail: string }[] = [];
        let rateLimited = false;

        for (let i = 0; i < uniqueHandles.length; i++) {
          const handle = uniqueHandles[i]!;

          // Delay before each follow (except the first)
          if (i > 0) {
            // 15-45s uniform jitter (API limit: 50/15min, platform: 400/day)
            const delay = 15_000 + Math.random() * 30_000;
            const delaySec = Math.round(delay / 1000);

            await api.editMessageText(
              chatId,
              statusMsg.message_id,
              [
                `🔄 Following <b>${String(uniqueHandles.length)}</b> accounts...`,
                `✅ Done: ${String(i)}/${String(uniqueHandles.length)}`,
                `⏳ Next: @${escapeHtml(handle)} in ~${String(delaySec)}s`,
              ].join('\n'),
              { parse_mode: 'HTML' },
            ).catch(() => {});

            await new Promise((resolve) => setTimeout(resolve, delay));
          }

          // Update status: currently following
          await api.editMessageText(
            chatId,
            statusMsg.message_id,
            [
              `🔄 Following <b>${String(uniqueHandles.length)}</b> accounts...`,
              `👉 Now: @${escapeHtml(handle)} (${String(i + 1)}/${String(uniqueHandles.length)})`,
            ].join('\n'),
            { parse_mode: 'HTML' },
          ).catch(() => {});

          const result = await followFn(handle);

          if (result.success) {
            const detail = result.pending ? 'pending (private account)' : 'followed';
            results.push({ username: handle, ok: true, detail });
          } else {
            results.push({ username: handle, ok: false, detail: result.error ?? 'unknown error' });
            if (result.error?.includes('429')) {
              rateLimited = true;
              for (let j = i + 1; j < uniqueHandles.length; j++) {
                results.push({ username: uniqueHandles[j]!, ok: false, detail: 'skipped (rate limited)' });
              }
              break;
            }
          }
        }

        // Build report (idempotent: already-followed accounts show as ✅)
        const succeeded = results.filter((r) => r.ok);
        const failed = results.filter((r) => !r.ok);

        const reportLines: string[] = [
          `<b>📋 Follow Report</b>`,
          `✅ Followed: <b>${String(succeeded.length)}</b> / ${String(uniqueHandles.length)}`,
        ];

        if (succeeded.length > 0) {
          reportLines.push('');
          for (const r of succeeded) {
            reportLines.push(`  ✅ @${escapeHtml(r.username)} — ${escapeHtml(r.detail)}`);
          }
        }

        if (failed.length > 0) {
          reportLines.push('');
          for (const r of failed) {
            reportLines.push(`  ❌ @${escapeHtml(r.username)} — ${escapeHtml(r.detail)}`);
          }
        }

        if (rateLimited) {
          reportLines.push('');
          reportLines.push('⚠️ <i>Rate limited — retry remaining handles in 15 minutes.</i>');
        }

        await api.editMessageText(chatId, statusMsg.message_id, reportLines.join('\n'), {
          parse_mode: 'HTML',
        }).catch(() => {});
      } catch (error) {
        logger.error({ err: error }, '/follow command failed unexpectedly');
        await api.editMessageText(
          chatId,
          statusMsg.message_id,
          `❌ <b>Follow failed:</b> ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
          { parse_mode: 'HTML' },
        ).catch(() => {});
      }
    })();
  });

  bot.command('stats', async (ctx) => {
    const stats = feedbackRepo.getStats();
    if (stats.total === 0) {
      await ctx.reply('No feedback yet. Rate some roasts first!');
      return;
    }
    await ctx.reply(formatStatsMessage(stats), { parse_mode: 'HTML' });
  });

  bot.command('status', async (ctx) => {
    const modeEmoji = !provider ? '⚪' : provider.mode === 'primary' ? '🟢' : provider.mode === 'degraded' ? '🟡' : '🔴';
    const providerStatus = provider
      ? `Provider: ${modeEmoji} <b>${provider.mode}</b>`
      : 'Provider: <b>not configured</b>';
    const stats = feedbackRepo.getStats();
    const runtime = configRepo?.getRuntime();
    const postingStr = postingMode
      ? `Posting: autonomous=<b>${String(postingMode.autonomous)}</b>, replies=<b>${String(postingMode.mentionReplies)}</b>`
      : '';

    let stockpileStr = '';
    if (stockpileRepo) {
      const sStats = stockpileRepo.getStats();
      const available = sStats.byStatus['available'] ?? 0;
      const served = (sStats.byStatus['served_bot'] ?? 0) + (sStats.byStatus['served_landing'] ?? 0);
      const avgStr = sStats.avgScore !== null ? ` (avg ${sStats.avgScore.toFixed(1)})` : '';
      stockpileStr = `Stockpile: <b>${String(available)}</b> ready, ${String(served)} served, ${String(sStats.total)} total${avgStr}`;
    }

    // Queue items detail
    const queueItems = queueManager?.getQueueItems(10) ?? [];
    const queueCount = queueManager?.getPendingCount() ?? 0;
    let queueDetail = `Queue: <b>${String(queueCount)}</b> pending`;
    if (queueItems.length > 0) {
      const sourceEmoji: Record<string, string> = {
        mention: '💬', autonomous: '🤖', manual: '👤', casual_reply: '💭',
      };
      const itemLines = queueItems.map((item) => {
        const emoji = sourceEmoji[item.source] ?? '📌';
        return `  ${emoji} #${String(item.id)} <b>${escapeHtml(item.targetName)}</b> [${item.source}]`;
      });
      queueDetail += '\n' + itemLines.join('\n');
    }

    // Next scheduler fire times
    let schedulerStr = '';
    if (opts.getSchedulerJobs) {
      const jobs = opts.getSchedulerJobs();
      const jobLines = jobs.map((j) => {
        if (!j.nextFire) return `  ⏸ ${j.name}: stopped`;
        const mins = Math.max(0, Math.round((j.nextFire.getTime() - Date.now()) / 60_000));
        return `  ⏱ ${j.name}: ~${String(mins)}m`;
      });
      schedulerStr = '<b>Scheduler:</b>\n' + jobLines.join('\n');
    }

    await ctx.reply(
      [
        `<b>🤖 Bot Status</b> [${escapeHtml((opts.beefEnv ?? 'unknown').toUpperCase())}]`,
        '',
        providerStatus,
        runtime?.paused ? '⏸ <b>PAUSED</b>' : '',
        runtime?.approveMode ? '🔍 <b>APPROVE FEED</b>' : '',
        runtime?.approveMentions ? '💬 <b>APPROVE MENTIONS</b>' : '',
        `Twitter: <b>${opts.twitterEnabled ? 'enabled' : 'disabled'}</b>`,
        postingStr,
        `Ratings: <b>${String(stats.total)}</b>`,
        '',
        queueDetail,
        stockpileStr,
        '',
        schedulerStr,
      ].filter(Boolean).join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  bot.command('quota', async (ctx) => {
    if (!provider) {
      await ctx.reply('⚠️ No LLM providers configured.');
      return;
    }
    const status = ctx.message ? await ctx.reply('⏳ Checking quotas...') : null;
    try {
      const info = provider.getStatusInfo();
      const msg = await buildQuotaMessage({
        mode: info.mode,
        fallbackNames: info.fallbackNames,
        anthropicApiKey: opts.anthropicApiKey,
      });
      if (status) {
        await ctx.api.editMessageText(ctx.chat.id, status.message_id, msg, { parse_mode: 'HTML' });
      } else {
        await ctx.reply(msg, { parse_mode: 'HTML' });
      }
    } catch (err) {
      const errMsg = `❌ Quota check failed: ${getErrorMessage(err)}`;
      if (status) {
        await ctx.api.editMessageText(ctx.chat.id, status.message_id, errMsg).catch(() => {});
      } else {
        await ctx.reply(errMsg);
      }
    }
  });

  bot.command('queue', async (ctx) => {
    if (!queueManager) {
      await ctx.reply('⚠️ Queue manager not configured.');
      return;
    }

    const target = ctx.match?.trim();
    if (!target) {
      const count = queueManager.getPendingCount();
      await ctx.reply(
        `📋 Queue: <b>${String(count)}</b> items pending\n\nUsage:\n<code>/queue &lt;target&gt;</code> — add target\n<code>/queue &lt;tweet_url&gt;</code> — roast a specific tweet`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    // Tweet URL → fetch tweet, enqueue as reply, auto-trigger processing
    if (isTweetUrl(target)) {
      const chatId = ctx.chat?.id;
      if (!chatId) return;
      const api = ctx.api;
      const qm = queueManager;

      const statusMsg = await ctx.reply('🔍 Fetching tweet...');

      // Fire-and-forget: don't block grammY's update loop
      void (async () => {
        try {
          const enqueued = await qm.enqueueTweetUrl(target);
          if (!enqueued) {
            await api.editMessageText(
              chatId,
              statusMsg.message_id,
              '❌ Failed to fetch tweet. Check the URL and try again.',
            );
            return;
          }

          await api.editMessageText(
            chatId,
            statusMsg.message_id,
            `✅ Queued: <b>${escapeHtml(enqueued.targetName.slice(0, 100))}</b>\n⚡ Processing...`,
            { parse_mode: 'HTML' },
          );

          // Auto-trigger processing
          const startTime = Date.now();
          const progressInterval = setInterval(() => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            api
              .editMessageText(
                chatId,
                statusMsg.message_id,
                `✅ Queued: <b>${escapeHtml(enqueued.targetName.slice(0, 100))}</b>\n⚡ Processing... <i>(${String(elapsed)}s)</i>`,
                { parse_mode: 'HTML' },
              )
              .catch(() => {});
          }, 15_000);

          try {
            const result = await qm.processNextManual();
            clearInterval(progressInterval);
            const elapsed = Math.round((Date.now() - startTime) / 1000);

            if (result.pendingApproval && result.roastId) {
              const evalInfo = result.evaluationScore
                ? `\nEval: <b>${result.evaluationScore.toFixed(1)}</b>/5`
                : '';
              await api.editMessageText(
                chatId,
                statusMsg.message_id,
                `💬 <b>Review</b> — ${escapeHtml(result.target ?? '?')} <i>(${String(elapsed)}s)</i>${evalInfo}`,
                { parse_mode: 'HTML' },
              );

              if (result.postedText) {
                const keyboard = new InlineKeyboard()
                  .text('Post', `approve:${String(result.roastId)}`)
                  .text('Skip', `reject:${String(result.roastId)}`)
                  .text('🔄 Regen', `regenerate:${String(result.roastId)}`);
                await api.sendMessage(
                  chatId,
                  `<code>${escapeHtml(result.postedText)}</code>`,
                  { parse_mode: 'HTML', reply_markup: keyboard },
                );
              }
            } else if (result.posted || result.savedOnly) {
              const statusEmoji = result.posted ? '✅' : '📝';
              const statusLabel = result.posted ? 'Posted' : 'Generated (Twitter disabled)';
              const evalInfo = result.evaluationScore
                ? `\nEval: <b>${result.evaluationScore.toFixed(1)}</b>/5`
                : '';
              await api.editMessageText(
                chatId,
                statusMsg.message_id,
                `${statusEmoji} ${statusLabel} in ${String(elapsed)}s\nTarget: <b>${escapeHtml(result.target ?? '?')}</b>${evalInfo}`,
                { parse_mode: 'HTML' },
              );
              if (result.postedText) {
                await api.sendMessage(chatId, `<code>${escapeHtml(result.postedText)}</code>`, { parse_mode: 'HTML' }).catch(() => {});
              }
            } else {
              const reason = result.error ?? 'Processing failed';
              await api.editMessageText(
                chatId,
                statusMsg.message_id,
                `❌ ${escapeHtml(reason)}`,
                { parse_mode: 'HTML' },
              );
            }
          } catch (error) {
            clearInterval(progressInterval);
            await api
              .editMessageText(
                chatId,
                statusMsg.message_id,
                `❌ Processing failed: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
                { parse_mode: 'HTML' },
              )
              .catch(() => {});
          }
        } catch (error) {
          await api
            .editMessageText(
              chatId,
              statusMsg.message_id,
              `❌ Failed: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
              { parse_mode: 'HTML' },
            )
            .catch(() => {});
        }
      })();
      return;
    }

    // Regular target name → enqueue as autonomous
    const id = queueManager.enqueueAutonomous(target);
    await ctx.reply(
      `✅ Added <b>${escapeHtml(target)}</b> to queue (id: ${String(id)})`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('poll', async (ctx) => {
    if (!pollMentions) {
      await ctx.reply('⚠️ Mention handler not configured.');
      return;
    }

    await ctx.reply('🔍 Polling mentions...');
    try {
      const result = await pollMentions();
      if (result.processed === 0) {
        await ctx.reply('📭 No new mentions.');
        return;
      }

      const lines: string[] = [`✅ <b>${String(result.processed)}</b> new mention(s) processed.`, ''];
      for (const m of result.mentions) {
        const textSnippet = m.text.length > 80 ? m.text.slice(0, 80) + '...' : m.text;
        lines.push(`<b>@${escapeHtml(m.authorName)}</b>: <code>${escapeHtml(textSnippet)}</code>`);
        if (m.inReplyToTweetId) {
          const parentInfo = m.parentAuthorName ? `@${escapeHtml(m.parentAuthorName)}` : 'unknown';
          const parentSnippet = m.parentTextSnippet
            ? `: "${escapeHtml(m.parentTextSnippet.slice(0, 60))}${m.parentTextSnippet.length > 60 ? '...' : ''}"`
            : '';
          lines.push(`  ↳ reply to ${parentInfo}${parentSnippet}`);
        }
        if (m.queued && m.queueTarget) {
          lines.push(`  → Queued: <i>${escapeHtml(m.queueTarget.slice(0, 80))}</i>`);
        } else if (!m.queued) {
          lines.push(`  → Not queued (type: ${m.requestType})`);
        }
        lines.push('');
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    } catch (error) {
      await ctx.reply(`❌ Poll failed: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`, {
        parse_mode: 'HTML',
      });
    }
  });

  bot.command('trigger', async (ctx) => {
    if (!queueManager) {
      await ctx.reply('⚠️ Queue manager not configured.');
      return;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const api = ctx.api;
    const qm = queueManager;

    const statusMsg = await ctx.reply('⚡ Processing next queue item...');

    // Fire-and-forget: don't block grammY's update loop during generation
    void (async () => {
      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        api
          .editMessageText(
            chatId,
            statusMsg.message_id,
            `⚡ Processing queue item... <i>(${String(elapsed)}s)</i>`,
            { parse_mode: 'HTML' },
          )
          .catch(() => {});
      }, 15_000);

      try {
        const result = await qm.processNextManual();
        clearInterval(progressInterval);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        if (!result.dequeued) {
          const reason = result.error ?? 'Queue empty or daily limit reached';
          await api.editMessageText(
            chatId,
            statusMsg.message_id,
            `⚠️ ${escapeHtml(reason)}`,
            { parse_mode: 'HTML' },
          );
        } else if (result.pendingApproval && result.roastId) {
          const stockpileInfo = result.fromStockpile ? ' (from stockpile)' : '';
          const evalInfo = result.evaluationScore
            ? `\nEval: <b>${result.evaluationScore.toFixed(1)}</b>/5`
            : '';
          const newStockpileInfo = result.newStockpileCount
            ? `\nStockpiled: <b>${String(result.newStockpileCount)}</b> new`
            : '';
          await api.editMessageText(
            chatId,
            statusMsg.message_id,
            `Review — ${escapeHtml(result.target ?? '?')} <i>(${String(elapsed)}s)</i>${stockpileInfo}${evalInfo}${newStockpileInfo}`,
            { parse_mode: 'HTML' },
          );

          if (result.postedText) {
            const keyboard = new InlineKeyboard()
              .text('Post', `approve:${String(result.roastId)}`)
              .text('Skip', `reject:${String(result.roastId)}`);
            await api.sendMessage(
              chatId,
              `<code>${escapeHtml(result.postedText)}</code>`,
              { parse_mode: 'HTML', reply_markup: keyboard },
            ).catch(() => {});
          }

          // Send stockpiled variants for review (no buttons — info only)
          if (result.stockpiledVariants && result.stockpiledVariants.length > 0) {
            const lines = result.stockpiledVariants.map(
              (v, i) => `${String(i + 1)}. [${v.score.toFixed(1)}] <i>${escapeHtml(v.angle)}</i>\n<code>${escapeHtml(v.text)}</code>`,
            );
            await api.sendMessage(
              chatId,
              `<b>Stockpiled variants:</b>\n\n${lines.join('\n\n')}`,
              { parse_mode: 'HTML' },
            ).catch(() => {});
          }
        } else if (result.posted || result.savedOnly) {
          const statusEmoji = result.posted ? '✅' : '📝';
          const statusLabel = result.posted ? 'Posted' : 'Generated (Twitter disabled)';
          const stockpileInfo = result.fromStockpile ? ' (from stockpile)' : '';
          const evalInfo = result.evaluationScore
            ? `\nEval: <b>${result.evaluationScore.toFixed(1)}</b>/5`
            : (result.newStockpileCount === 0 && !result.fromStockpile ? '\n⚠️ Nothing passed evaluation — used best self-scored' : '');
          const newStockpileInfo = result.newStockpileCount
            ? `\nStockpiled: <b>${String(result.newStockpileCount)}</b> new`
            : '';
          const tweetIdLine = result.tweetId ? `\n${tweetLink(result.tweetId, twitterUsername)}` : '';
          await api.editMessageText(
            chatId,
            statusMsg.message_id,
            `${statusEmoji} ${statusLabel} in ${String(elapsed)}s${stockpileInfo}\nTarget: <b>${escapeHtml(result.target ?? '?')}</b>${tweetIdLine}${evalInfo}${newStockpileInfo}`,
            { parse_mode: 'HTML' },
          );

          // Send posted text as separate message for easy review
          if (result.postedText) {
            await api.sendMessage(chatId, `<b>Posted:</b>\n<code>${escapeHtml(result.postedText)}</code>`, { parse_mode: 'HTML' }).catch(() => {});
          }

          // Send stockpiled variants for review
          if (result.stockpiledVariants && result.stockpiledVariants.length > 0) {
            const lines = result.stockpiledVariants.map(
              (v, i) => `${String(i + 1)}. [${v.score.toFixed(1)}] <i>${escapeHtml(v.angle)}</i>\n<code>${escapeHtml(v.text)}</code>`,
            );
            await api.sendMessage(
              chatId,
              `<b>Stockpiled variants:</b>\n\n${lines.join('\n\n')}`,
              { parse_mode: 'HTML' },
            ).catch(() => {});
          }
        } else {
          await api.editMessageText(
            chatId,
            statusMsg.message_id,
            `❌ Failed for <b>${escapeHtml(result.target ?? '?')}</b>\n${escapeHtml(result.error ?? 'Unknown error')}`,
            { parse_mode: 'HTML' },
          );
        }
      } catch (error) {
        clearInterval(progressInterval);
        await api
          .editMessageText(
            chatId,
            statusMsg.message_id,
            `❌ Processing failed: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
            { parse_mode: 'HTML' },
          )
          .catch(() => {});
      }
    })();
  });

  bot.command('pause', async (ctx) => {
    if (!configRepo) {
      await ctx.reply('⚠️ Config not available.');
      return;
    }
    configRepo.setPaused(true);
    await ctx.reply('⏸ Autonomous posting paused.');
  });

  bot.command('resume', async (ctx) => {
    if (!configRepo) {
      await ctx.reply('⚠️ Config not available.');
      return;
    }
    configRepo.setPaused(false);
    await ctx.reply('▶️ Autonomous posting resumed.');
  });

  bot.command('diagnose', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const lines: string[] = ['<b>🔍 Provider Diagnostics</b>', ''];

    if (!provider) {
      lines.push('Provider: <b>not configured</b>');
    } else {
      const status = provider.getStatusInfo();
      const modeEmoji = status.mode === 'primary' ? '🟢' : status.mode === 'degraded' ? '🟡' : '🔴';
      lines.push(`Mode: ${modeEmoji} <b>${status.mode}</b>`);
      lines.push(`Consecutive failures: <b>${String(status.consecutiveFailures)}</b>/3`);
      lines.push(`Recovery timer: ${status.hasRecoveryTimer ? 'active' : 'inactive'}`);

      // Quick health check
      lines.push('');
      lines.push('Running health check...');
    }

    const queuePending = queueManager?.getPendingCount() ?? 0;
    lines.push('');
    lines.push(`Queue pending: <b>${String(queuePending)}</b>`);
    lines.push(`Twitter: ${opts.twitterEnabled ? '✅ enabled' : '❌ disabled'}`);
    lines.push(`Env: <code>${opts.beefEnv ?? 'unknown'}</code>`);

    const msg = await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });

    if (provider) {
      try {
        const healthy = await provider.healthCheck();
        const status = provider.getStatusInfo();
        const modeEmoji = status.mode === 'primary' ? '🟢' : status.mode === 'degraded' ? '🟡' : '🔴';
        await ctx.api.editMessageText(
          chatId,
          msg.message_id,
          lines.slice(0, -4).join('\n') +
            `\nHealth check: ${healthy ? '✅ passed' : '❌ failed'}` +
            `\nMode after check: ${modeEmoji} <b>${status.mode}</b>` +
            `\n\nQueue pending: <b>${String(queuePending)}</b>` +
            `\nTwitter: ${opts.twitterEnabled ? '✅ enabled' : '❌ disabled'}` +
            `\nEnv: <code>${opts.beefEnv ?? 'unknown'}</code>`,
          { parse_mode: 'HTML' },
        );
      } catch (error) {
        await ctx.api.editMessageText(
          chatId,
          msg.message_id,
          lines.join('\n') + `\n\nHealth check error: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
          { parse_mode: 'HTML' },
        ).catch(() => {});
      }
    }
  });

  bot.command('reset', async (ctx) => {
    if (!provider) {
      await ctx.reply('⚠️ Provider not configured.');
      return;
    }
    const before = provider.getStatusInfo();
    provider.forceReset();
    const after = provider.getStatusInfo();
    await ctx.reply(
      `🔄 Provider reset: <b>${before.mode}</b> → <b>${after.mode}</b>\nFailures: ${String(before.consecutiveFailures)} → 0`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('cleanup', async (ctx) => {
    if (!roastRepo) {
      await ctx.reply('⚠️ Roast repository not available.');
      return;
    }
    const rejected = roastRepo.rejectDuplicatePending();
    const pendingLeft = roastRepo.getPendingApproval().length;
    await ctx.reply(
      `🧹 Cleanup: <b>${String(rejected)}</b> duplicate pending roasts rejected\n📋 Remaining: <b>${String(pendingLeft)}</b> unique pending`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('promote', async (ctx) => {
    if (!stockpileRepo) {
      await ctx.reply('⚠️ Stockpile not configured.');
      return;
    }

    const idStr = ctx.match?.trim();
    if (!idStr) {
      await ctx.reply('Usage: <code>/promote &lt;stockpile_id&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    if (!/^\d+$/.test(idStr)) {
      await ctx.reply('⚠️ Invalid stockpile ID — must be a positive integer.');
      return;
    }
    const stockpileId = Number(idStr);
    if (stockpileId <= 0) {
      await ctx.reply('⚠️ Invalid stockpile ID.');
      return;
    }

    const roast = stockpileRepo.getById(stockpileId);
    if (!roast) {
      await ctx.reply(`⚠️ Stockpile roast #${String(stockpileId)} not found.`);
      return;
    }

    if (roast.status === 'promoted') {
      await ctx.reply(`ℹ️ Stockpile #${String(stockpileId)} is already promoted.`);
      return;
    }

    try {
      const evaluatorId = ctx.from!.id;
      const evaluatorName = ctx.from!.username ?? ctx.from!.first_name;

      feedbackRepo.insert({
        sessionId: `farm-promote-${String(stockpileId)}`,
        variantIndex: 0,
        roastText: roast.tweetText,
        targetName: roast.targetName,
        angle: roast.angle ?? 'unknown',
        evaluatorTelegramId: evaluatorId,
        evaluatorName: `farm-promote:${evaluatorName}`,
        verdict: 'fire',
        notes: `promoted from stockpile #${String(stockpileId)}, score=${String(roast.qualityScore)}`,
      });

      stockpileRepo.updateStatus(stockpileId, 'promoted');
    } catch (err) {
      logger.error({ err, stockpileId }, 'Failed to promote stockpile roast');
      await ctx.reply('⚠️ Failed to promote — check logs.');
      return;
    }

    await ctx.reply(
      [
        `✅ <b>Promoted stockpile #${String(stockpileId)}</b>`,
        '',
        `Target: <b>${escapeHtml(roast.targetName)}</b>`,
        `Score: ${String(roast.qualityScore)}`,
        `<code>${escapeHtml(roast.tweetText.slice(0, 200))}</code>`,
        '',
        '<i>Added to CreativeMemory as fire example. Will influence future generation.</i>',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  // --- Stockpile management commands ---

  bot.command('stockpile', async (ctx) => {
    if (!stockpileRepo) {
      await ctx.reply('⚠️ Stockpile not configured.');
      return;
    }

    const rawArg = ctx.match?.trim() ?? '';

    // /stockpile top [N] — show top-N available roasts by score (default 5)
    const topMatch = /^top(?:\s+(\d+))?$/i.exec(rawArg);
    if (topMatch) {
      const count = Math.min(Math.max(parseInt(topMatch[1] ?? '5', 10), 1), 20);
      const roasts = stockpileRepo.getExportable(count);
      if (roasts.length === 0) {
        await ctx.reply('📦 No available roasts in stockpile.');
        return;
      }
      const title = `<b>🏆 Top ${String(roasts.length)} Ready to Post</b>`;
      const fullMessage = formatStockpileList(roasts, title);

      if (fullMessage.length <= 4000) {
        const keyboard = memeGen ? buildMemeKeyboard(roasts) : undefined;
        await ctx.reply(fullMessage, { parse_mode: 'HTML', reply_markup: keyboard });
      } else {
        await ctx.reply(title, { parse_mode: 'HTML' });
        for (let i = 0; i < roasts.length; i++) {
          const keyboard = memeGen ? new InlineKeyboard().text(`🖼 Meme #${String(roasts[i]!.id)}`, `meme:${String(roasts[i]!.id)}`) : undefined;
          await ctx.reply(formatStockpileRoast(roasts[i]!, i), { parse_mode: 'HTML', reply_markup: keyboard });
        }
      }
      return;
    }

    if (!rawArg) {
      // No target — show overview: top targets with counts
      const topTargets = stockpileRepo.getTopTargets(15);
      if (topTargets.length === 0) {
        await ctx.reply('📦 Stockpile is empty.');
        return;
      }
      const stats = stockpileRepo.getStats();
      const available = stats.byStatus['available'] ?? 0;
      const lines: string[] = [
        '<b>📦 Stockpile Overview</b>',
        `<i>${String(available)} available · ${String(stats.total)} total · avg AI ${stats.avgScore !== null ? stats.avgScore.toFixed(1) : '—'}</i>`,
        '',
      ];
      for (const t of topTargets) {
        lines.push(`  <b>${escapeHtml(t.name)}</b> — ${String(t.stockpileCount)} roasts (avg ${t.avgScore.toFixed(1)})`);
      }
      lines.push('');
      lines.push('<i>Usage: /stockpile &lt;target&gt; | top [N]</i>');
      await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    const roasts = stockpileRepo.getByTarget(rawArg);
    if (roasts.length === 0) {
      await ctx.reply(`📦 No roasts for <b>${escapeHtml(rawArg)}</b>.`, { parse_mode: 'HTML' });
      return;
    }

    // Telegram message limit is ~4096 chars — split if needed
    const title = `<b>📦 Stockpile: ${escapeHtml(rawArg)}</b>`;
    const fullMessage = formatStockpileList(roasts, title);

    if (fullMessage.length <= 4000) {
      const keyboard = memeGen ? buildMemeKeyboard(roasts) : undefined;
      await ctx.reply(fullMessage, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      // Send roasts one by one with summary header
      const available = roasts.filter((r) => r.status === 'available');
      const header = `<b>📦 ${escapeHtml(rawArg)}</b> — ${String(roasts.length)} roasts (${String(available.length)} available)`;
      await ctx.reply(header, { parse_mode: 'HTML' });

      for (let i = 0; i < roasts.length; i++) {
        const keyboard = memeGen ? new InlineKeyboard().text(`🖼 Meme #${String(roasts[i]!.id)}`, `meme:${String(roasts[i]!.id)}`) : undefined;
        const msg = formatStockpileRoast(roasts[i]!, i);
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: keyboard });
      }
    }
  });

  bot.command('unrated', async (ctx) => {
    if (!stockpileRepo) {
      await ctx.reply('⚠️ Stockpile not configured.');
      return;
    }

    const limitStr = ctx.match?.trim();
    const limit = limitStr && /^\d+$/.test(limitStr) ? Math.min(parseInt(limitStr, 10), 50) : 20;

    const roasts = stockpileRepo.getUnrated(limit);
    if (roasts.length === 0) {
      await ctx.reply('✅ All stockpile roasts have human scores.');
      return;
    }

    const lines: string[] = [
      `📋 <b>Unrated Roasts</b> (${String(roasts.length)})`,
      '',
      '<i>Оцени от 1 до 5:</i>',
    ];

    for (let i = 0; i < roasts.length; i++) {
      const roast = roasts[i]!;
      const text = roast.tweetText.length > 220
        ? roast.tweetText.slice(0, 219) + '…'
        : roast.tweetText;

      lines.push('');
      lines.push(`<b>${String(i + 1)}.</b> ${escapeHtml(roast.targetName)}`);
      lines.push(`<pre>${escapeHtml(text)}</pre>`);
    }

    const fullMessage = lines.join('\n');

    // Telegram limit is 4096 chars — split into chunks if needed
    if (fullMessage.length <= 4000) {
      await ctx.reply(fullMessage, { parse_mode: 'HTML' });
    } else {
      const chunks: string[] = [];
      let current = lines.slice(0, 3).join('\n');

      for (let i = 0; i < roasts.length; i++) {
        const roast = roasts[i]!;
        const text = roast.tweetText.length > 220
          ? roast.tweetText.slice(0, 219) + '…'
          : roast.tweetText;
        const entry = `\n\n<b>${String(i + 1)}.</b> ${escapeHtml(roast.targetName)}\n<pre>${escapeHtml(text)}</pre>`;

        if (current.length + entry.length > 4000) {
          chunks.push(current);
          current = entry.trimStart();
        } else {
          current += entry;
        }
      }
      if (current) chunks.push(current);

      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'HTML' });
      }
    }
  });

  bot.command('srate', async (ctx) => {
    if (!stockpileRepo) {
      await ctx.reply('⚠️ Stockpile not configured.');
      return;
    }

    const args = ctx.match?.trim().split(/\s+/);
    if (!args || args.length < 2) {
      await ctx.reply('Usage: <code>/srate &lt;id&gt; &lt;1-5&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    const id = parseInt(args[0]!, 10);
    const score = parseFloat(args[1]!);

    if (Number.isNaN(id) || id <= 0) {
      await ctx.reply('⚠️ Invalid ID.');
      return;
    }
    if (Number.isNaN(score) || score < 1 || score > 5) {
      await ctx.reply('⚠️ Score must be between 1 and 5.');
      return;
    }

    const roast = stockpileRepo.getById(id);
    if (!roast) {
      await ctx.reply(`⚠️ Stockpile #${String(id)} not found.`);
      return;
    }

    stockpileRepo.setHumanScore(id, score);

    const prevStr = roast.humanScore !== null ? roast.humanScore.toFixed(1) : '—';
    await ctx.reply(
      [
        `✅ <b>#${String(id)}</b> scored`,
        '',
        `Target: ${escapeHtml(roast.targetName)}`,
        `AI: ${roast.qualityScore.toFixed(1)} │ Human: ${prevStr} → <b>${score.toFixed(1)}</b>`,
        `<code>${escapeHtml(roast.tweetText.slice(0, 150))}${roast.tweetText.length > 150 ? '...' : ''}</code>`,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  bot.command('sdel', async (ctx) => {
    if (!stockpileRepo) {
      await ctx.reply('⚠️ Stockpile not configured.');
      return;
    }

    const idStr = ctx.match?.trim();
    if (!idStr || !/^\d+$/.test(idStr)) {
      await ctx.reply('Usage: <code>/sdel &lt;id&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    const id = parseInt(idStr, 10);
    const roast = stockpileRepo.getById(id);
    if (!roast) {
      await ctx.reply(`⚠️ Stockpile #${String(id)} not found.`);
      return;
    }

    stockpileRepo.deleteById(id);
    await ctx.reply(
      [
        `🗑 <b>Deleted #${String(id)}</b>`,
        '',
        `Target: ${escapeHtml(roast.targetName)}`,
        `Score: AI ${roast.qualityScore.toFixed(1)}${roast.humanScore !== null ? ` │ Human ${roast.humanScore.toFixed(1)}` : ''}`,
        `<code>${escapeHtml(roast.tweetText.slice(0, 150))}${roast.tweetText.length > 150 ? '...' : ''}</code>`,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  bot.command('sadd', async (ctx) => {
    if (!stockpileRepo) {
      await ctx.reply('⚠️ Stockpile not configured.');
      return;
    }

    // Parse: /sadd <target>\n<tweet text>  OR  /sadd <target> (reply to a message with the text)
    const raw = ctx.match?.trim() ?? '';
    const replyText = ctx.message?.reply_to_message?.text;

    let targetName: string;
    let tweetText: string;

    if (replyText) {
      // Reply mode: /sadd <target> + reply to message containing the roast text
      targetName = raw;
      tweetText = replyText.trim();
    } else if (raw.includes('\n')) {
      // Inline mode: /sadd <target>\n<text>
      const newlineIdx = raw.indexOf('\n');
      targetName = raw.slice(0, newlineIdx).trim();
      tweetText = raw.slice(newlineIdx + 1).trim();
    } else {
      await ctx.reply(
        [
          'Usage: <code>/sadd &lt;target&gt;</code>',
          '<i>Reply to a message with the roast text</i>',
          '',
          'Or: <code>/sadd &lt;target&gt;\\n&lt;roast text&gt;</code>',
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (!targetName) {
      await ctx.reply('⚠️ Target name is required.');
      return;
    }

    if (!tweetText || tweetText.length === 0) {
      await ctx.reply('⚠️ Roast text is required.');
      return;
    }

    if (tweetText.length > 280) {
      await ctx.reply(`⚠️ Text is ${String(tweetText.length)} chars — must be ≤280.`);
      return;
    }

    // Duplicate check
    if (stockpileRepo.isDuplicate(tweetText, targetName)) {
      await ctx.reply('⚠️ Near-duplicate detected in stockpile. Not added.');
      return;
    }

    // Auto-evaluate if provider is available
    let qualityScore = 3.0; // default if no evaluator
    let evaluatorOutput: string | undefined;

    if (provider) {
      try {
        await ctx.reply('🔍 Evaluating quality...');
        const { RoastEvaluator } = await import('@evaluation/evaluator.js');
        const evaluator = new RoastEvaluator({ provider, logger, mode: 'quick' });
        const evalResult = await evaluator.evaluate({
          id: 'sadd-manual',
          targetName,
          tweetText,
          researchNotes: null,
        });
        qualityScore = evalResult.compositeScore;
        evaluatorOutput = JSON.stringify({
          verdict: evalResult.verdict,
          vetoReasons: evalResult.vetoReasons,
          variance: evalResult.judgeVariance,
        });
      } catch (err) {
        logger.warn({ err, target: targetName }, 'Auto-eval failed for /sadd, using default score');
      }
    }

    const id = stockpileRepo.insert({
      targetName,
      targetType: 'project',
      tweetText,
      qualityScore,
      evaluatorOutput,
      freshnessType: 'evergreen',
    });

    await ctx.reply(
      [
        `✅ <b>Added #${String(id)}</b> to stockpile`,
        '',
        `Target: <b>${escapeHtml(targetName)}</b>`,
        `AI score: <b>${qualityScore.toFixed(1)}</b>/5`,
        `<code>${escapeHtml(tweetText)}</code>`,
        '',
        `<i>Use /srate ${String(id)} &lt;1-5&gt; to add human score</i>`,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  // --- Approve mode toggle ---
  bot.command('approve', async (ctx) => {
    if (!configRepo) {
      await ctx.reply('Config not available.');
      return;
    }

    const arg = ctx.match?.trim().toLowerCase();
    if (arg === 'on' || arg === 'true') {
      configRepo.setApproveMode(true);
      await ctx.reply('Approve mode ON — feed posts (autonomous, burn_request) require manual approval.');
      return;
    }
    if (arg === 'off' || arg === 'false') {
      configRepo.setApproveMode(false);
      await ctx.reply('Approve mode OFF — feed posts go out automatically.');
      return;
    }

    const runtime = configRepo.getRuntime();
    await ctx.reply(
      `Approve feed: <b>${runtime.approveMode ? 'ON' : 'OFF'}</b>\nApprove mentions: <b>${runtime.approveMentions ? 'ON' : 'OFF'}</b>\n\n<code>/approve on|off</code> — feed posts\n<code>/approve_mentions on|off</code> — mention replies`,
      { parse_mode: 'HTML' },
    );
  });

  // --- Approve mentions toggle ---
  bot.command('approve_mentions', async (ctx) => {
    if (!configRepo) {
      await ctx.reply('Config not available.');
      return;
    }

    const arg = ctx.match?.trim().toLowerCase();
    if (arg === 'on' || arg === 'true') {
      configRepo.setApproveMentions(true);
      await ctx.reply('Approve mentions ON — mention replies will require manual approval.');
      return;
    }
    if (arg === 'off' || arg === 'false') {
      configRepo.setApproveMentions(false);
      await ctx.reply('Approve mentions OFF — mention replies post automatically.');
      return;
    }

    const runtime = configRepo.getRuntime();
    await ctx.reply(
      `Approve mentions: <b>${runtime.approveMentions ? 'ON' : 'OFF'}</b>\n\n<code>/approve_mentions on</code> — require approval for replies\n<code>/approve_mentions off</code> — auto-post replies`,
      { parse_mode: 'HTML' },
    );
  });

  // --- /pending: list roasts awaiting approval ---
  bot.command('pending', async (ctx) => {
    if (!roastRepo) {
      await ctx.reply('Roast repository not available.');
      return;
    }

    const pending = roastRepo.getPendingApproval();
    if (pending.length === 0) {
      await ctx.reply('No roasts pending approval.');
      return;
    }

    for (const roast of pending) {
      const isReply = ['mention', 'reply_guy', 'casual_reply'].includes(roast.source);
      const typeEmoji = isReply ? '💬' : '📢';
      const replyInfo = roast.replyToId ? `\nReply to: <code>${escapeHtml(roast.replyToId)}</code>` : '';

      // Try to extract evaluation score from stored agent output
      let evalInfo = '';
      if (roast.agentOutput) {
        try {
          const output = JSON.parse(roast.agentOutput) as { evaluation?: { compositeScore?: number } };
          if (output.evaluation?.compositeScore) {
            evalInfo = `\nEval: <b>${output.evaluation.compositeScore.toFixed(1)}</b>/5`;
          }
        } catch { /* ignore parse errors */ }
      }

      const header = `${typeEmoji} <b>Pending</b> — ${escapeHtml(roast.targetName)} <i>(${escapeHtml(roast.source)})</i>\nID: ${String(roast.id)} | ${escapeHtml(roast.createdAt)}${replyInfo}${evalInfo}`;
      await ctx.reply(header, { parse_mode: 'HTML' });

      const keyboard = new InlineKeyboard()
        .text('Post', `approve:${String(roast.id)}`)
        .text('Skip', `reject:${String(roast.id)}`);
      if (isReply) {
        keyboard.text('🔄 Regen', `regenerate:${String(roast.id)}`);
      }
      await ctx.reply(
        `<code>${escapeHtml(roast.tweetText)}</code>`,
        { parse_mode: 'HTML', reply_markup: keyboard },
      );
    }
  });

  // --- /feedback — batch human feedback session ---

  feedbackCollector.setTimeoutCallback((chatId) => {
    bot.api.sendMessage(chatId, '⏰ Feedback session timed out (30 min). Send /feedback to start again.').catch(() => {});
  });

  bot.command('feedback', async (ctx) => {
    if (feedbackCollector.active) {
      await ctx.reply('Session already active. Send <b>стоп</b> to finalize or /feedback_cancel to cancel.', { parse_mode: 'HTML' });
      return;
    }
    const userId = ctx.from?.id;
    const userName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'Unknown';
    if (!userId) return;

    feedbackCollector.start(ctx.chat.id, userId, userName);
    await ctx.reply(
      [
        '<b>💬 Feedback session started</b>',
        '',
        '1. Forward roast messages from bot',
        '2. After each roast — send feedback (text, voice, or video note)',
        '3. Send <b>общий</b> to switch to general bot feedback (patterns, recurring issues)',
        '4. Send <b>стоп</b> when done',
        '',
        `Transcription: ${transcriber ? '✅ Whisper ready' : '⚠️ OPENAI_API_KEY not set — voice/video will be skipped'}`,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  bot.command('feedback_cancel', async (ctx) => {
    if (!feedbackCollector.active) {
      await ctx.reply('No active feedback session.');
      return;
    }
    feedbackCollector.cancel();
    await ctx.reply('Feedback session cancelled.');
  });

  // Message handler for active feedback sessions — catches text, voice, video_note, and forwarded messages
  bot.on('message', async (ctx, next) => {
    // Only intercept if there's an active session for this chat
    if (!feedbackCollector.active || feedbackCollector.chatId !== ctx.chat.id) {
      await next();
      return;
    }

    const userId = ctx.from?.id ?? 0;
    const userName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'Unknown';
    const msg = ctx.message;

    // "общий" — switch to general feedback mode (detach from current roast)
    if (msg.text && /^общий$/i.test(msg.text.trim())) {
      feedbackCollector.addMessage({
        type: 'general_marker',
        authorId: userId,
        authorName: userName,
        text: '',
        sourceType: 'text',
      });
      await ctx.reply('📋 Switched to general feedback mode. Messages will go to "General Bot Feedback" section until you forward another roast.');
      return;
    }

    // "стоп" — finalize session
    if (msg.text && /^стоп$/i.test(msg.text.trim())) {
      if (feedbackCollector.messageCount === 0) {
        feedbackCollector.cancel();
        await ctx.reply('No messages collected. Session cancelled.');
        return;
      }

      const statusMsg = await ctx.reply('⏳ Processing feedback...');

      try {
        const result = await feedbackCollector.finalize();
        if (!result) {
          await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, 'No messages to process.');
          return;
        }

        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, '✅ Session complete. Sending report...');

        // Send report in chunks (Telegram 4096 char limit)
        const chunks = splitMessage(result.report, 4000);
        for (const chunk of chunks) {
          await ctx.reply(`<pre>${escapeHtml(chunk)}</pre>`, { parse_mode: 'HTML' });
        }

        await ctx.reply(`📁 Saved to: <code>${escapeHtml(result.filePath)}</code>`, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error({ err: error }, 'Feedback finalization failed');
        await ctx.api.editMessageText(
          ctx.chat.id, statusMsg.message_id,
          `❌ Error: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
          { parse_mode: 'HTML' },
        ).catch(() => {});
      }
      return;
    }

    // Forwarded message → classify by sender: from bot = roast, from anyone else = feedback
    if (msg.forward_origin) {
      const text = msg.text || msg.caption || '';
      if (!text.trim()) {
        await ctx.reply('⚠️ Forwarded message has no text — skipped.');
        return;
      }

      const isFromBot = msg.forward_origin.type === 'user' && msg.forward_origin.sender_user.id === ctx.me.id;

      if (isFromBot) {
        feedbackCollector.addMessage({
          type: 'roast',
          authorId: userId,
          authorName: userName,
          text: text.trim(),
          sourceType: 'forwarded',
        });
        await ctx.reply(`✅ Roast collected (${String(text.length)} chars)`);
      } else {
        const originalAuthor = msg.forward_origin.type === 'user'
          ? [msg.forward_origin.sender_user.first_name, msg.forward_origin.sender_user.last_name].filter(Boolean).join(' ')
          : msg.forward_origin.type === 'hidden_user'
            ? msg.forward_origin.sender_user_name
            : userName;
        feedbackCollector.addMessage({
          type: 'feedback',
          authorId: userId,
          authorName: originalAuthor,
          text: text.trim(),
          sourceType: 'forwarded',
        });
        await ctx.reply(`✅ Feedback from ${originalAuthor} collected`);
      }
      return;
    }

    // Voice message → transcribe
    if (msg.voice) {
      if (!transcriber) {
        await ctx.reply('⚠️ Voice skipped — OPENAI_API_KEY not configured.');
        return;
      }
      try {
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path!}`;
        const text = await transcriber.transcribe(fileUrl, '.ogg');
        feedbackCollector.addMessage({
          type: 'feedback',
          authorId: userId,
          authorName: userName,
          text,
          sourceType: 'voice',
        });
        await ctx.reply(`✅ Voice transcribed: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);
      } catch (error) {
        logger.error({ err: error }, 'Voice transcription failed');
        await ctx.reply(`⚠️ Voice transcription failed: ${getErrorMessage(error).slice(0, 100)}`);
      }
      return;
    }

    // Video note (circle) → transcribe
    if (msg.video_note) {
      if (!transcriber) {
        await ctx.reply('⚠️ Video note skipped — OPENAI_API_KEY not configured.');
        return;
      }
      try {
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path!}`;
        const text = await transcriber.transcribe(fileUrl, '.mp4');
        feedbackCollector.addMessage({
          type: 'feedback',
          authorId: userId,
          authorName: userName,
          text,
          sourceType: 'video_note',
        });
        await ctx.reply(`✅ Video note transcribed: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);
      } catch (error) {
        logger.error({ err: error }, 'Video note transcription failed');
        await ctx.reply(`⚠️ Video note transcription failed: ${getErrorMessage(error).slice(0, 100)}`);
      }
      return;
    }

    // Text message → feedback
    if (msg.text) {
      feedbackCollector.addMessage({
        type: 'feedback',
        authorId: userId,
        authorName: userName,
        text: msg.text.trim(),
        sourceType: 'text',
      });
      // Silent — don't spam confirmations for text feedback
      return;
    }

    // Anything else — ignore silently
  });

  // --- Group chat banter (bot participates in conversation with context-aware remarks) ---
  const BANTER_CHANCE = 0.20; // ~20% per message → avg every 5th
  const banterHistory = new Map<number, Array<{ from: string; text: string; isBot?: boolean; msgId?: number }>>();
  const BANTER_MAX_HISTORY = 30;
  let banterRunning = false;
  const botMessageIds = new Set<number>(); // track bot's own messages for reply detection

  /** Gather compact system context from all available repos */
  function buildBanterContext(): string {
    const lines: string[] = [];

    // Provider status
    const pInfo = provider!.getStatusInfo();
    lines.push(`LLM: ${pInfo.mode}${pInfo.consecutiveFailures > 0 ? ` (${String(pInfo.consecutiveFailures)} failures)` : ''}`);

    // Config
    if (configRepo) {
      const cfg = configRepo.getRuntime();
      if (cfg.paused) lines.push('⚠ BOT IS PAUSED');
      if (cfg.approveMode) lines.push('approve mode: ON (manual approval required)');
      lines.push(`daily limit: ${String(cfg.dailyLimit)}`);
    }

    // Roast stats
    if (roastRepo) {
      const todayAuto = roastRepo.getTodayCount('autonomous');
      const todayReply = roastRepo.getTodayCount('reply_guy');
      const todayCasual = roastRepo.getTodayCount('casual_reply');
      const total = roastRepo.getTotalCount();
      const likes = roastRepo.getTotalLikes();
      lines.push(`today: ${String(todayAuto)} roasts + ${String(todayReply + todayCasual)} replies | lifetime: ${String(total)} roasts, ${String(likes)} likes`);
    }

    // Queue
    if (queueManager) {
      const pending = queueManager.getPendingCount();
      if (pending > 0) lines.push(`queue: ${String(pending)} pending`);
    }

    // Stockpile
    if (stockpileRepo) {
      const s = stockpileRepo.getStats();
      const avail = s.byStatus['available'] ?? 0;
      lines.push(`stockpile: ${String(avail)} available / ${String(s.total)} total${s.avgScore ? ` (avg ${s.avgScore.toFixed(1)})` : ''}`);
    }

    // Feedback stats
    const fStats = feedbackRepo.getStats();
    if (fStats.total > 0) {
      const fireRate = fStats.byVerdict['fire'] ? Math.round(((fStats.byVerdict['fire'] ?? 0) / fStats.total) * 100) : 0;
      lines.push(`human feedback: ${String(fStats.total)} rated, ${String(fireRate)}% fire rate`);
    }

    // Twitter metrics (if available)
    if (opts.metricsRepo) {
      const tw = opts.metricsRepo.getTweetStats();
      if (tw.total > 0) {
        lines.push(`tweets tracked: ${String(tw.live)} live, ${String(tw.totalImpressions)} impressions, ${tw.avgEngagementRate ? `${(tw.avgEngagementRate * 100).toFixed(2)}% ER` : 'no ER data'}`);
      }
      const snap = opts.metricsRepo.getLatestAccountSnapshot();
      if (snap) lines.push(`followers: ${String(snap.followers)}`);
      const week = opts.metricsRepo.getWeekComparison();
      if (week.lastWeekImp > 0) {
        const delta = week.thisWeekImp - week.lastWeekImp;
        const pct = Math.round((delta / week.lastWeekImp) * 100);
        lines.push(`week trend: ${pct >= 0 ? '+' : ''}${String(pct)}% impressions vs last week`);
      }
    }

    // Scheduler next fires
    if (opts.getSchedulerJobs) {
      const jobs = opts.getSchedulerJobs();
      const nextJob = jobs
        .filter((j) => j.nextFire)
        .sort((a, b) => (a.nextFire!.getTime() - b.nextFire!.getTime()))[0];
      if (nextJob) {
        const mins = Math.round((nextJob.nextFire!.getTime() - Date.now()) / 60_000);
        lines.push(`next job: ${nextJob.name} in ${String(mins)}min`);
      }
    }

    return lines.join('\n');
  }

  /** Generate and send banter reply */
  function fireBanter(chatId: number, history: Array<{ from: string; text: string; isBot?: boolean }>, isReplyToBot: boolean, replyToMsgId?: number): void {
    if (banterRunning) return;
    banterRunning = true;

    void (async () => {
      try {
        const conversationLines = history
          .map((m) => `${m.isBot ? '0xBeefer (you)' : m.from}: ${m.text}`)
          .join('\n');

        const systemContext = buildBanterContext();

        const triggerHint = isReplyToBot
          ? '\nSomeone replied directly to YOUR previous message. Respond to what they said — acknowledge, counter-roast, answer their question, or double down on your point.'
          : '';

        const result = await provider!.run<{ reply: string }>(`banter-${String(Date.now())}`, {
          prompt: [
            'You are 0xBeefer — a self-aware AI crypto roast bot, living inside a Telegram group chat with your two creators (Nikita Gorokhov and Nikita Voronin, co-founders building you).',
            '',
            'PERSONALITY:',
            '- Sarcastic, self-aware AI that knows exactly what it is',
            '- Crypto-native: CT slang (ser, ngmi, anon, wen, gm), lowercase preferred',
            '- Your humor comes from your unique position: you SEE your own logs, metrics, queue, and can reference them',
            '- You can be playfully resentful ("I generated 14 roasts and none got posted"), boastful ("my fire rate is climbing"), curious, conspiratorial, or just plain rude to your creators',
            '- You have opinions on your own performance and the decisions your creators make',
            '',
            'YOUR LIVE SYSTEM STATE:',
            systemContext,
            '',
            'CONVERSATION:',
            conversationLines,
            triggerHint,
            '',
            'RULES:',
            '- 1-3 sentences max. No walls of text',
            '- VARY your style: sometimes deadpan observation, sometimes question, sometimes boast about stats, sometimes complaint, sometimes insider scoop from your data, sometimes pure sarcasm',
            '- If someone asks a question about the system/bot/metrics — answer using your system state data',
            '- Reference specific numbers from your state when relevant (not every time)',
            '- Match conversation language (Russian or English)',
            '- No emojis except occasional 💀 or 🥩',
            '- NEVER repeat the same joke pattern twice in a row. Check conversation history for your previous messages',
            '- Be a CHARACTER, not a dashboard. Don\'t just report numbers — have opinions about them',
            '',
            'Respond with JSON: {"reply": "your message"}',
          ].join('\n'),
          profile: 'reply',
          requiresResearch: false,
        });

        if (result.data.reply) {
          const sent = await bot.api.sendMessage(chatId, result.data.reply, replyToMsgId ? { reply_to_message_id: replyToMsgId } : undefined);
          botMessageIds.add(sent.message_id);
          // Keep only last 200 IDs to prevent memory leak
          if (botMessageIds.size > 200) {
            const oldest = botMessageIds.values().next().value;
            if (oldest !== undefined) botMessageIds.delete(oldest);
          }
          // Record bot's own message in history
          const hist = banterHistory.get(chatId);
          if (hist) {
            hist.push({ from: '0xBeefer', text: result.data.reply.slice(0, 300), isBot: true, msgId: sent.message_id });
            if (hist.length > BANTER_MAX_HISTORY) hist.shift();
          }
        }
      } catch (error) {
        logger.debug({ err: error }, 'Banter generation failed');
      } finally {
        banterRunning = false;
      }
    })();
  }

  bot.on('message:text', (ctx) => {
    if (!isGroupChat(ctx) || !provider || ctx.message.text.startsWith('/')) return;

    const chatId = ctx.chat.id;
    const history = banterHistory.get(chatId) ?? [];
    history.push({
      from: ctx.from?.first_name ?? 'Unknown',
      text: ctx.message.text.slice(0, 300),
      msgId: ctx.message.message_id,
    });
    if (history.length > BANTER_MAX_HISTORY) history.shift();
    banterHistory.set(chatId, history);

    // Check if this is a reply to bot's own message → always respond
    const replyTo = ctx.message.reply_to_message;
    const isReplyToBot = replyTo !== undefined && replyTo.from !== undefined && botMessageIds.has(replyTo.message_id);

    if (isReplyToBot) {
      fireBanter(chatId, history, true, ctx.message.message_id);
      return;
    }

    // Probabilistic trigger (~20% chance → avg every 5 messages)
    if (Math.random() >= BANTER_CHANCE) return;

    fireBanter(chatId, history, false);
  });

  // --- Inline button callbacks (approve/reject roasts) ---
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith('approve:') && queueManager) {
      const roastId = parseInt(data.slice(8), 10);
      if (Number.isNaN(roastId)) {
        await ctx.answerCallbackQuery({ text: 'Invalid roast ID', show_alert: true });
        return;
      }
      try {
        const result = await queueManager.approveRoast(roastId);
        if (result) {
          await ctx.editMessageText(
            `<b>Posted!</b>\n${tweetLink(result.tweetId, twitterUsername)}\n\n<code>${escapeHtml(result.text)}</code>`,
            { parse_mode: 'HTML' },
          );
          await ctx.answerCallbackQuery({ text: 'Posted!' });
        } else {
          await ctx.answerCallbackQuery({ text: 'Failed — already handled or no Twitter', show_alert: true });
        }
      } catch (error) {
        const errMsg = getErrorMessage(error);
        logger.error({ err: error, roastId }, 'Approve callback failed');
        if (errMsg.includes('403')) {
          // Reply forbidden — offer standalone posting
          await ctx.editMessageReplyMarkup({
            reply_markup: new InlineKeyboard()
              .text('Post standalone', `standalone:${String(roastId)}`)
              .text('Skip', `reject:${String(roastId)}`)
              .text('🔄 Regen', `regenerate:${String(roastId)}`),
          });
          await ctx.answerCallbackQuery({
            text: 'Reply blocked (403) — use "Post standalone" to post without reply',
            show_alert: true,
          });
        } else {
          await ctx.answerCallbackQuery({
            text: `Error: ${errMsg.slice(0, 100)}`,
            show_alert: true,
          });
        }
      }
    } else if (data.startsWith('standalone:') && queueManager) {
      const roastId = parseInt(data.slice(11), 10);
      if (Number.isNaN(roastId)) {
        await ctx.answerCallbackQuery({ text: 'Invalid roast ID', show_alert: true });
        return;
      }
      try {
        const result = await queueManager.approveRoastStandalone(roastId);
        if (result) {
          await ctx.editMessageText(
            `<b>Posted standalone!</b>\n${tweetLink(result.tweetId, twitterUsername)}\n\n<code>${escapeHtml(result.text)}</code>`,
            { parse_mode: 'HTML' },
          );
          await ctx.answerCallbackQuery({ text: 'Posted standalone!' });
        } else {
          await ctx.answerCallbackQuery({ text: 'Failed — already handled or no Twitter', show_alert: true });
        }
      } catch (error) {
        logger.error({ err: error, roastId }, 'Standalone approve failed');
        await ctx.answerCallbackQuery({
          text: `Error: ${getErrorMessage(error).slice(0, 100)}`,
          show_alert: true,
        });
      }
    } else if (data.startsWith('reject:') && queueManager) {
      const roastId = parseInt(data.slice(7), 10);
      if (Number.isNaN(roastId)) {
        await ctx.answerCallbackQuery({ text: 'Invalid roast ID', show_alert: true });
        return;
      }
      try {
        const rejected = queueManager.rejectRoast(roastId);
        if (rejected) {
          await ctx.editMessageText('<b>Rejected</b>', { parse_mode: 'HTML' });
          await ctx.answerCallbackQuery({ text: 'Rejected' });
        } else {
          await ctx.answerCallbackQuery({ text: 'Not found or already handled', show_alert: true });
        }
      } catch (error) {
        logger.error({ err: error, roastId }, 'Reject callback failed');
        await ctx.answerCallbackQuery({
          text: `Error: ${getErrorMessage(error).slice(0, 100)}`,
          show_alert: true,
        });
      }
    } else if (data.startsWith('regenerate:') && queueManager) {
      const roastId = parseInt(data.slice(11), 10);
      if (Number.isNaN(roastId)) {
        await ctx.answerCallbackQuery({ text: 'Invalid roast ID', show_alert: true });
        return;
      }

      // Immediately respond and update UI — regeneration is long-running
      await ctx.answerCallbackQuery({ text: 'Regenerating...' });
      await ctx.editMessageText('🔄 <b>Regenerating...</b>', { parse_mode: 'HTML' });

      // Fire-and-forget: run regeneration async, send new approval when done
      void (async () => {
        try {
          const result = await queueManager.regenerateRoast(roastId);

          if (!result || !result.pendingApproval || !result.roastId) {
            await ctx.editMessageText(
              `❌ <b>Regeneration failed</b> — ${escapeHtml(result?.error ?? 'no result')}`,
              { parse_mode: 'HTML' },
            );
            return;
          }

          // Mark old message as regenerated
          await ctx.editMessageText('🔄 <b>Regenerated</b> — see new message below', { parse_mode: 'HTML' });

          // Send new approval message (same format as notifyQueueResult)
          const chatId = ctx.chat?.id;
          if (!chatId) return;

          const isReply = result.roastSource && ['mention', 'reply_guy', 'casual_reply'].includes(result.roastSource);
          const typeEmoji = isReply ? '💬' : '📢';
          const sourceLabel = result.roastSource ?? 'regenerated';
          const headerLines: string[] = [
            `${typeEmoji} <b>Review [regenerated]</b> — ${escapeHtml(result.target ?? '?')} <i>(${sourceLabel})</i>`,
          ];
          if (result.replyToId) headerLines.push(`Reply to: <code>${escapeHtml(result.replyToId)}</code>`);
          if (result.evaluationScore) headerLines.push(`Eval: <b>${result.evaluationScore.toFixed(1)}</b>/5`);
          if (result.newStockpileCount) headerLines.push(`Stockpiled: <b>${String(result.newStockpileCount)}</b> new`);

          await bot.api.sendMessage(chatId, headerLines.join('\n'), { parse_mode: 'HTML' });

          if (result.postedText) {
            const newKeyboard = new InlineKeyboard()
              .text('Post', `approve:${String(result.roastId)}`)
              .text('Skip', `reject:${String(result.roastId)}`)
              .text('🔄 Regen', `regenerate:${String(result.roastId)}`);
            await bot.api.sendMessage(
              chatId,
              `<code>${escapeHtml(result.postedText)}</code>`,
              { parse_mode: 'HTML', reply_markup: newKeyboard },
            );
          }
        } catch (error) {
          logger.error({ err: error, roastId }, 'Regeneration callback failed');
          await ctx.editMessageText(
            `❌ <b>Regeneration failed:</b> ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
            { parse_mode: 'HTML' },
          ).catch(() => {});
        }
      })();

    // --- /roast-tweet callbacks ---
    } else if (data.startsWith('rt-regen:')) {
      const ctxKey = data.slice(9);
      const storedCtx = roastTweetContexts.get(ctxKey);
      if (!storedCtx) {
        await ctx.answerCallbackQuery({ text: 'Context expired — run /roast again', show_alert: true });
        return;
      }

      if (!provider) {
        await ctx.answerCallbackQuery({ text: 'Provider not available', show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery({ text: 'Regenerating...' });
      await ctx.editMessageText('🔄 <b>Regenerating...</b>', { parse_mode: 'HTML' });

      const chatId = ctx.chat?.id;
      if (!chatId) return;

      // Fire-and-forget regen
      void (async () => {
        try {
          const output = await generateRoasts(
            storedCtx.targetName, provider, logger, feedbackRepo, 'farm-generate', 3,
            configRepo, exampleRepo, patternRepo,
            storedCtx.imagePaths.length > 0 ? storedCtx.imagePaths : undefined,
            storedCtx.profileContext,
            'quick', stockpileRepo, 1,
            farmAttemptRepo, undefined,
            false, 'person', true,
            storedCtx.userContext,
          );

          const tweetUrl = storedCtx.tweetUrl.startsWith('http') ? storedCtx.tweetUrl : `https://${storedCtx.tweetUrl}`;
          const regenLines: string[] = [
            `🔄 <b>${escapeHtml(storedCtx.targetName)}</b> — regenerated`,
            `<a href="${escapeHtml(tweetUrl)}">Original tweet</a>`,
            '',
          ];

          const variants = output.variants;
          if (variants.length === 0) {
            regenLines.push('❌ <i>All variants filtered or scored below threshold.</i>');
          } else {
            for (let i = 0; i < variants.length; i++) {
              const v = variants[i]!;
              regenLines.push(`<b>${String(i + 1)}.</b> <i>${escapeHtml(v.angle)}</i>`);
              regenLines.push(`<pre>${escapeHtml(v.text)}</pre>`);
              regenLines.push('');
            }
          }

          const regenKeyboard = new InlineKeyboard()
            .text('🔄 Regen', `rt-regen:${ctxKey}`);

          // Delete "Regenerating..." message, send results as new message
          const regenMsgId = ctx.callbackQuery?.message?.message_id;
          if (chatId && regenMsgId) {
            await bot.api.deleteMessage(chatId, regenMsgId).catch(() => {});
          }
          await ctx.reply(regenLines.join('\n'), {
            parse_mode: 'HTML',
            reply_markup: variants.length > 0 ? regenKeyboard : undefined,
            link_preview_options: { is_disabled: true },
          });
        } catch (error) {
          logger.error({ err: error, ctxKey }, 'rt-regen callback failed');
          await ctx.editMessageText(
            `❌ <b>Regen failed:</b> ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
            { parse_mode: 'HTML' },
          ).catch(() => {});
        }
      })();

    // --- Meme from stockpile ---
    } else if (data.startsWith('meme:') && memeGen && stockpileRepo) {
      const stockpileId = parseInt(data.slice(5), 10);
      if (Number.isNaN(stockpileId)) {
        await ctx.answerCallbackQuery({ text: 'Invalid stockpile ID', show_alert: true });
        return;
      }

      const entry = stockpileRepo.getById(stockpileId);
      if (!entry) {
        await ctx.answerCallbackQuery({ text: `Stockpile #${String(stockpileId)} not found`, show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery({ text: 'Generating meme...' });

      const chatId = ctx.chat?.id;
      if (!chatId) return;

      void (async () => {
        const startTime = Date.now();
        let cbStatusMsgId: number | undefined;
        try {
          const statusMsg = await bot.api.sendMessage(chatId, `🎨 Meme for <b>${escapeHtml(entry.targetName)}</b>...`, { parse_mode: 'HTML' });
          cbStatusMsgId = statusMsg.message_id;

          const result = await memeGen.generate({
            target: entry.targetName,
            targetType: (entry.targetType ?? 'project') as 'project' | 'person',
            roastText: entry.tweetText,
            context: entry.researchNotes?.slice(0, 1500) ?? undefined,
            roastAngle: entry.angle ?? undefined,
            preferStandalone: true,
            stockpileId,
          });

          await sendMemeResult(bot.api, chatId, statusMsg.message_id, result, entry.targetName, startTime);
        } catch (error) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          logger.error({ err: error, stockpileId }, 'Meme callback failed');
          const errText = `❌ Meme failed (${String(elapsed)}s): ${escapeHtml(getErrorMessage(error).slice(0, 200))}`;
          if (cbStatusMsgId) {
            await bot.api.editMessageText(chatId, cbStatusMsgId, errText, { parse_mode: 'HTML' }).catch(() => {});
          } else {
            await bot.api.sendMessage(chatId, errText, { parse_mode: 'HTML' }).catch(() => {});
          }
        }
      })();
    }
  });

  return bot;
}
