import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { TaskProfile } from '@agent/agent.types.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { RoastRepository } from '@storage/repositories/roast.repository.js';
import type { QueueManager } from '@queue/queue-manager.js';
import { isTweetUrl } from '@queue/queue-manager.js';
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
import {
  escapeHtml,
  formatStatsMessage,
  formatStockpileRoast,
  formatStockpileList,
} from './formatters.js';

function tweetLink(tweetId: string, username: string): string {
  return `<a href="https://x.com/${username}/status/${tweetId}">Tweet</a>`;
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
  const hasEval = /\s--eval\b/.test(input);
  const hasMutate = /\s--mutate\b/.test(input);
  const hasQuick = /\s--quick\b/.test(input);

  const variantsMatch = /\s--variants\s+(\d+)/.exec(input);
  const mutationsMatch = /\s--mutations\s+(\d+)/.exec(input);
  const thresholdMatch = /\s--threshold\s+([\d.]+)/.exec(input);

  const target = input
    .replace(/\s--(?:eval|mutate|quick)\b/g, '')
    .replace(/\s--variants\s+\d+/g, '')
    .replace(/\s--mutations\s+\d+/g, '')
    .replace(/\s--threshold\s+[\d.]+/g, '')
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
}): Bot {
  const { token, adminIds, openAccess, feedbackRepo, provider, logger, queueManager, configRepo, exampleRepo, patternRepo, stockpileRepo, farmAttemptRepo, roastRepo, postingMode, pollMentions } = opts;
  const twitterUsername = opts.twitterUsername || '0xBeefer';
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
        '/power &lt;target&gt; — Opus, 6 variants + quick eval',
        '/farm &lt;target&gt; — 6 variants + mutations + serious eval',
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
        'Sonnet · 3 strategies × 3 = <b>9 variants</b> · no eval',
        '  <code>--eval</code>        add quick eval (1 judge)',
        '  <code>--mutate</code>      add creative mutations',
        '  <code>--variants N</code>  per strategy <i>(default: 3, total: N×3)</i>',
        '  <code>--mutations N</code> mutation count <i>(default: 1)</i>',
        '',
        '<b>⚡ /power</b> &lt;target&gt; [flags]',
        'Opus · 3 strategies × 2 = <b>6 variants</b> · quick eval (1 judge)',
        '  <code>--mutate</code>      add creative mutations',
        '  <code>--variants N</code>  per strategy <i>(default: 2, total: N×3)</i>',
        '  <code>--mutations N</code> mutation count <i>(default: 1)</i>',
        '',
        '<b>🌾 /farm</b> &lt;target&gt; [flags]',
        'Farm · 3 strategies × 2 = <b>6 variants</b> · 2 mutations · serious eval (5 judges)',
        '  <code>--variants N</code>  per strategy <i>(default: 2, total: N×3)</i>',
        '  <code>--mutations N</code> creative mutations <i>(default: 2)</i>',
        '  <code>--threshold N</code> stockpile min score <i>(default: 3.5)</i>',
        '  <code>--quick</code>       1-judge eval instead of 5-judge',
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
        '<code>/stats</code> — feedback statistics',
        '<code>/diagnose</code> — provider health check',
        '<code>/reset</code> — force-reset provider to primary',
        '',
        '<b>📦 Stockpile</b>',
        '<code>/stockpile &lt;target&gt;</code> — list roasts for a target',
        '<code>/stockpile top [N]</code> — top N ready to post <i>(default 5)</i>',
        '<code>/unrated</code> — roasts missing human score',
        '<code>/srate &lt;id&gt; &lt;1-5&gt;</code> — set human score',
        '<code>/sdel &lt;id&gt;</code> — delete from stockpile',
        '<code>/sadd &lt;target&gt;</code> — add text (reply to msg or next line)',
        '',
        '<b>🏆 Curation</b>',
        '<code>/promote &lt;id&gt;</code> — stockpile → CreativeMemory',
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
          undefined, undefined, o.evaluationMode, stockpileRepo, o.mutationCount,
          farmAttemptRepo, o.evaluationThreshold,
        );

        clearInterval(progressInterval);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        // Build combined message: status header + results in a single message
        const researchNote = output.researchNotes
          ? `\n<i>${escapeHtml(output.researchNotes.slice(0, 200))}</i>`
          : '';
        const header = `✅ <b>${escapeHtml(o.target)}</b> — ${String(output.variants.length)} variants, ${String(elapsed)}s${researchNote}`;
        const result = formatRoastOutput(o.target, output, o.evaluationMode);
        await api.editMessageText(
          chatId,
          statusMsg.message_id,
          header + '\n\n' + result,
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

  bot.command('roast', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply('Usage: /roast &lt;target&gt; [--eval] [--mutate] [--variants N]\nExample: /roast hyperliquid --eval', {
        parse_mode: 'HTML',
      });
      return;
    }

    if (!provider) {
      await ctx.reply('⚠️ LLM provider not configured. Paste roasts manually for evaluation.');
      return;
    }

    const flags = parseRoastFlags(raw);
    if (!flags.target) {
      await ctx.reply('Usage: /roast &lt;target&gt; [--eval] [--mutate] [--variants N]\nExample: /roast hyperliquid --eval', {
        parse_mode: 'HTML',
      });
      return;
    }

    const variants = flags.variants ?? 3;
    const evalMode = flags.eval ? 'quick' as const : undefined;
    const mutations = flags.mutate ? (flags.mutations ?? 1) : undefined;

    handleRoastCommand({
      ctx, target: flags.target, profile: 'roast-research',
      variantCount: variants, progressEmoji: '🔍', progressLabel: 'Researching',
      evaluationMode: evalMode, mutationCount: mutations,
    });
  });

  bot.command('power', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply('Usage: /power &lt;target&gt; [--mutate] [--variants N]\nExample: /power hyperliquid', {
        parse_mode: 'HTML',
      });
      return;
    }

    if (!provider) {
      await ctx.reply('⚠️ LLM provider not configured. Paste roasts manually for evaluation.');
      return;
    }

    const flags = parseRoastFlags(raw);
    if (!flags.target) {
      await ctx.reply('Usage: /power &lt;target&gt; [--mutate] [--variants N]\nExample: /power hyperliquid', {
        parse_mode: 'HTML',
      });
      return;
    }

    const variants = flags.variants ?? 2;
    const mutations = flags.mutate ? (flags.mutations ?? 1) : undefined;

    handleRoastCommand({
      ctx, target: flags.target, profile: 'roast-power',
      variantCount: variants, progressEmoji: '⚡', progressLabel: 'Power mode (Opus) —',
      evaluationMode: 'quick', mutationCount: mutations,
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
        await ctx.reply(fullMessage, { parse_mode: 'HTML' });
      } else {
        await ctx.reply(title, { parse_mode: 'HTML' });
        for (let i = 0; i < roasts.length; i++) {
          await ctx.reply(formatStockpileRoast(roasts[i]!, i), { parse_mode: 'HTML' });
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
      await ctx.reply(fullMessage, { parse_mode: 'HTML' });
    } else {
      // Send roasts one by one with summary header
      const available = roasts.filter((r) => r.status === 'available');
      const header = `<b>📦 ${escapeHtml(rawArg)}</b> — ${String(roasts.length)} roasts (${String(available.length)} available)`;
      await ctx.reply(header, { parse_mode: 'HTML' });

      for (let i = 0; i < roasts.length; i++) {
        const msg = formatStockpileRoast(roasts[i]!, i);
        await ctx.reply(msg, { parse_mode: 'HTML' });
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

    const title = `<b>📋 Unrated Roasts</b> (${String(roasts.length)})`;
    const fullMessage = formatStockpileList(roasts, title, false);

    if (fullMessage.length <= 4000) {
      await ctx.reply(fullMessage, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(title, { parse_mode: 'HTML' });
      for (let i = 0; i < roasts.length; i++) {
        const msg = formatStockpileRoast(roasts[i]!, i);
        await ctx.reply(msg, { parse_mode: 'HTML' });
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
    }
  });

  return bot;
}
