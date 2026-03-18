import { Bot } from 'grammy';
import type { Context } from 'grammy';
import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { TaskProfile } from '@agent/agent.types.js';
import type { HumanVerdict } from '@common/types/index.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { QueueManager } from '@queue/queue-manager.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import { ratingKeyboard, sessionDoneKeyboard } from './keyboards.js';
import { SessionStore } from './session-store.js';
import type { RoastSession } from './types.js';
import { generateRoasts } from './roast-generator.js';
import {
  escapeHtml,
  formatManualEvalMessage,
  formatSessionSummary,
  formatStatsMessage,
  formatVariantMessage,
  RATING_LEGEND,
} from './formatters.js';

const VALID_VERDICTS = new Set<HumanVerdict>(['fire', 'post', 'iterate', 'reject']);

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
}): Bot {
  const { token, adminIds, openAccess, feedbackRepo, provider, logger, queueManager, configRepo } = opts;
  const bot = new Bot(token);
  const sessions = new SessionStore();

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
    const groupNote = isGroupChat(ctx)
      ? '\n\nIn group chat: paste text as a <b>reply to my message</b> to evaluate it.'
      : '\nOr just <b>paste any text</b> to evaluate it as a roast.';
    await ctx.reply(
      [
        '<b>🥩 $BEEF Roast Evaluator</b>',
        '',
        '/roast &lt;target&gt; — generate roast variants',
        '/power &lt;target&gt; — Opus-quality roast (5 variants)',
        '/stats — feedback statistics',
        '/status — bot health',
        '/help — this message',
        groupNote,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        '<b>🥩 $BEEF Roast Evaluator — Help</b>',
        '',
        '<b>Generate roasts:</b>',
        '<code>/roast hyperliquid</code> — Sonnet, 3 variants',
        '<code>/power hyperliquid</code> — Opus, 5 variants, 10min timeout',
        '',
        '<b>Examples:</b>',
        '<code>/roast pump.fun</code> · <code>/roast opensea</code>',
        '<code>/roast virtuals protocol</code> · <code>/roast worldcoin</code>',
        '',
        '<b>Manual evaluation:</b>',
        'Paste any roast text (50-280 chars) → rate it with buttons',
        '',
        '<b>Rating scale:</b>',
        '🔥 GOLD — best quality, used as training example',
        '✅ GOOD — good enough to post',
        '❌ BAD — not good enough',
        '✏️ EDIT — write your own version (saved as gold)',
        '',
        '<b>Other commands:</b>',
        '<code>/stats</code> — feedback statistics',
        '<code>/status</code> — bot health + provider info',
        '<code>/queue &lt;target&gt;</code> — add target to posting queue',
        '<code>/trigger</code> — force-process next queue item',
        '<code>/pause</code> / <code>/resume</code> — toggle autonomous posting',
        '',
        isGroupChat(ctx)
          ? '<i>In groups: paste text as a reply to my message.</i>'
          : '<i>In DM: just paste any text to evaluate.</i>',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  function handleRoastCommand(
    ctx: Context,
    target: string,
    profile: TaskProfile,
    variantCount: number,
    progressEmoji: string,
    progressLabel: string,
  ): void {
    const chatId = ctx.chat!.id;
    const api = ctx.api;

    // Fire-and-forget: don't block grammY's update loop during generation
    void (async () => {
      const statusMsg = await api.sendMessage(
        chatId,
        `${progressEmoji} ${progressLabel} <b>${escapeHtml(target)}</b>...`,
        { parse_mode: 'HTML' },
      );

      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        api
          .editMessageText(
            chatId,
            statusMsg.message_id,
            `${progressEmoji} ${progressLabel} <b>${escapeHtml(target)}</b>... <i>(${String(elapsed)}s)</i>`,
            { parse_mode: 'HTML' },
          )
          .catch(() => {});
      }, 10_000);

      try {
        const output = await generateRoasts(target, provider!, logger, feedbackRepo, profile, variantCount);

        // Create session
        const session = sessions.createSession(
          target,
          'generate',
          output.variants.map((v) => ({
            text: v.text,
            angle: v.angle,
            score: v.score,
          })),
          chatId,
        );

        clearInterval(progressInterval);

        // Update status message
        const researchNote = output.researchNotes
          ? `\n\n<i>📝 ${escapeHtml(output.researchNotes.slice(0, 200))}</i>`
          : '';
        await api.editMessageText(
          chatId,
          statusMsg.message_id,
          `✅ Generated ${String(output.variants.length)} variants for <b>${escapeHtml(target)}</b>${researchNote}\n\n<i>${RATING_LEGEND}</i>`,
          { parse_mode: 'HTML' },
        );

        // Send each variant with rating buttons
        for (let i = 0; i < session.variants.length; i++) {
          const variant = session.variants[i];
          if (!variant) continue;
          const msg = await api.sendMessage(
            chatId,
            formatVariantMessage(variant.text, i, variant.angle, variant.score, session.variants.length),
            {
              parse_mode: 'HTML',
              reply_markup: ratingKeyboard(session.id, i),
            },
          );
          variant.messageId = msg.message_id;
        }

        // Session control message with Done button
        await api.sendMessage(
          chatId,
          '<i>Rate the variants above, then press Done for a summary.</i>',
          {
            parse_mode: 'HTML',
            reply_markup: sessionDoneKeyboard(session.id),
          },
        );
      } catch (error) {
        clearInterval(progressInterval);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        logger.error({ err: error, target, profile, elapsedSec: elapsed }, 'Roast generation failed');
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

  bot.command('roast', async (ctx) => {
    const target = ctx.match?.trim();
    if (!target) {
      await ctx.reply('Usage: /roast &lt;target name&gt;\nExample: /roast hyperliquid', {
        parse_mode: 'HTML',
      });
      return;
    }

    if (!provider) {
      await ctx.reply('⚠️ LLM provider not configured. Paste roasts manually for evaluation.');
      return;
    }

    handleRoastCommand(ctx, target, 'roast-research', 3, '🔍', 'Researching');
  });

  bot.command('power', async (ctx) => {
    const target = ctx.match?.trim();
    if (!target) {
      await ctx.reply('Usage: /power &lt;target name&gt;\nExample: /power hyperliquid', {
        parse_mode: 'HTML',
      });
      return;
    }

    if (!provider) {
      await ctx.reply('⚠️ LLM provider not configured. Paste roasts manually for evaluation.');
      return;
    }

    handleRoastCommand(ctx, target, 'roast-power', 5, '⚡', 'Power mode (Opus) —');
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
    const providerStatus = provider
      ? `Provider: <b>${provider.mode}</b>`
      : 'Provider: <b>not configured</b>';
    const stats = feedbackRepo.getStats();
    const adminStr = openAccess ? 'open access' : adminIds.length > 0 ? adminIds.map(String).join(', ') : 'no admins configured (open)';
    const runtime = configRepo?.getRuntime();
    const queueCount = queueManager?.getPendingCount() ?? 0;
    await ctx.reply(
      [
        '<b>🤖 Bot Status</b>',
        '',
        providerStatus,
        `Total ratings: <b>${String(stats.total)}</b>`,
        `Queue: <b>${String(queueCount)}</b> pending`,
        runtime ? `Paused: <b>${String(runtime.paused)}</b>` : '',
        `Access: ${adminStr}`,
        `Chat type: ${ctx.chat.type}`,
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
    if (target) {
      const id = queueManager.enqueueAutonomous(target);
      await ctx.reply(
        `✅ Added <b>${escapeHtml(target)}</b> to queue (id: ${String(id)})`,
        { parse_mode: 'HTML' },
      );
    } else {
      const count = queueManager.getPendingCount();
      await ctx.reply(
        `📋 Queue: <b>${String(count)}</b> items pending\n\nUsage: <code>/queue &lt;target&gt;</code> to add`,
        { parse_mode: 'HTML' },
      );
    }
  });

  bot.command('trigger', async (ctx) => {
    if (!queueManager) {
      await ctx.reply('⚠️ Queue manager not configured.');
      return;
    }

    await ctx.reply('⚡ Force-processing next queue item...');

    try {
      const processed = await queueManager.processNextForce();
      await ctx.reply(processed ? '✅ Queue item processed.' : '⚠️ Queue is empty.');
    } catch (error) {
      await ctx.reply(`❌ Processing failed: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`, {
        parse_mode: 'HTML',
      });
    }
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

  // --- Callback: rating buttons ---

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Parse: rate:{sessionId}:{variantIdx}:{verdict}
    if (data.startsWith('rate:')) {
      const parts = data.split(':');
      if (parts.length !== 4) {
        try { await ctx.answerCallbackQuery({ text: 'Invalid callback data' }); } catch { /* expired */ }
        return;
      }
      const sessionId = parts[1]!;
      const variantIdx = parseInt(parts[2]!, 10);
      const verdict = parts[3] as HumanVerdict;

      if (!VALID_VERDICTS.has(verdict) || isNaN(variantIdx)) {
        try { await ctx.answerCallbackQuery({ text: 'Invalid rating' }); } catch { /* expired */ }
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) {
        try { await ctx.answerCallbackQuery({ text: 'Session expired' }); } catch { /* expired */ }
        return;
      }

      const evaluatorId = ctx.from.id;
      const evaluatorName = ctx.from.username ?? ctx.from.first_name;

      // Answer callback query first (must happen within 30s of button click)
      const existingRating = sessions.getRating(sessionId, evaluatorId, variantIdx);
      const ackText = existingRating
        ? `Updated: ${verdict.toUpperCase()}`
        : `Rated: ${verdict.toUpperCase()}`;
      try { await ctx.answerCallbackQuery({ text: ackText }); } catch { /* expired */ }

      // Store in session
      sessions.addRating(sessionId, evaluatorId, variantIdx, verdict);

      // Store in database
      const variant = session.variants[variantIdx];
      if (variant) {
        feedbackRepo.insert({
          sessionId,
          variantIndex: variantIdx,
          roastText: variant.text,
          targetName: session.targetName,
          angle: variant.angle,
          llmSelfScore: variant.score ? Math.round(variant.score) : undefined,
          evaluatorTelegramId: evaluatorId,
          evaluatorName,
          verdict,
        });
      }

      // Update message to show ratings
      if (variant?.messageId && ctx.chat) {
        const ratingLabels = buildRatingLabels(session, variantIdx, evaluatorId, evaluatorName);
        const originalText = session.source === 'manual'
          ? formatManualEvalMessage(variant.text)
          : formatVariantMessage(variant.text, variantIdx, variant.angle, variant.score, session.variants.length);
        const ratingsLine = `\n\n<b>Ratings:</b> ${ratingLabels.join(' · ')}`;

        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            variant.messageId,
            originalText + ratingsLine,
            { parse_mode: 'HTML', reply_markup: ratingKeyboard(sessionId, variantIdx) },
          );
        } catch { /* message not modified */ }
      }

      // Auto-summary if all variants rated
      const evaluatorRatings = session.ratings.get(evaluatorId);
      if (evaluatorRatings && evaluatorRatings.size === session.variants.length) {
        await sendSessionReport(ctx, session, feedbackRepo);
      }

      return;
    }

    // --- Callback: EDIT button ---
    if (data.startsWith('edit:')) {
      const parts = data.split(':');
      if (parts.length !== 3) {
        try { await ctx.answerCallbackQuery({ text: 'Invalid edit data' }); } catch { /* expired */ }
        return;
      }
      const sessionId = parts[1]!;
      const variantIdx = parseInt(parts[2]!, 10);

      const session = sessions.get(sessionId);
      if (!session) {
        try { await ctx.answerCallbackQuery({ text: 'Session expired' }); } catch { /* expired */ }
        return;
      }

      if (isNaN(variantIdx) || variantIdx < 0 || variantIdx >= session.variants.length) {
        try { await ctx.answerCallbackQuery({ text: 'Invalid variant' }); } catch { /* expired */ }
        return;
      }

      sessions.setPendingEdit(ctx.from.id, sessionId, variantIdx);
      try { await ctx.answerCallbackQuery({ text: 'Send your version as a text message' }); } catch { /* expired */ }

      const variant = session.variants[variantIdx];
      const originalPreview = variant ? variant.text.slice(0, 100) : '';
      await ctx.reply(
        `✏️ <b>Edit mode</b>\n\nOriginal: <code>${escapeHtml(originalPreview)}${variant && variant.text.length > 100 ? '...' : ''}</code>\n\nSend your improved version (50-280 chars):`,
        { parse_mode: 'HTML' },
      );

      return;
    }

    // --- Callback: Done button ---
    if (data.startsWith('done:')) {
      const sessionId = data.slice(5);
      const session = sessions.get(sessionId);
      if (!session) {
        try { await ctx.answerCallbackQuery({ text: 'Session expired' }); } catch { /* expired */ }
        return;
      }

      try { await ctx.answerCallbackQuery({ text: 'Session finished' }); } catch { /* expired */ }

      // Remove the Done button from the control message
      if (ctx.chat && ctx.callbackQuery.message) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            ctx.callbackQuery.message.message_id,
            '<i>Session completed.</i>',
            { parse_mode: 'HTML' },
          );
        } catch { /* message not modified */ }
      }

      await sendSessionReport(ctx, session, feedbackRepo);
      sessions.delete(sessionId);
      return;
    }

    try { await ctx.answerCallbackQuery({ text: 'Unknown action' }); } catch { /* expired */ }
  });

  // --- Text messages: manual evaluation ---
  // In private chats: any text becomes a roast to evaluate
  // In groups: only text that's a reply to the bot's message

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();

    // Skip if it looks like a command
    if (text.startsWith('/')) return;

    // In group chats: only respond if message is a reply to the bot
    if (isGroupChat(ctx)) {
      const replyTo = ctx.message.reply_to_message;
      if (!replyTo || replyTo.from?.id !== bot.botInfo.id) {
        return; // Silently ignore non-reply messages in groups
      }
    }

    // --- Handle pending edits ---
    const pendingEdit = sessions.getPendingEdit(ctx.from.id);
    if (pendingEdit) {
      sessions.clearPendingEdit(ctx.from.id);

      if (text.length < 50 || text.length > 280) {
        await ctx.reply('Edit must be 50-280 characters. Try again with /roast or click ✏️ EDIT again.');
        return;
      }

      const session = sessions.get(pendingEdit.sessionId);
      if (!session) {
        await ctx.reply('Session expired. Generate a new roast with /roast.');
        return;
      }

      const variant = session.variants[pendingEdit.variantIdx];
      if (!variant) {
        await ctx.reply('Variant not found.');
        return;
      }

      const evaluatorId = ctx.from.id;
      const evaluatorName = ctx.from.username ?? ctx.from.first_name;

      // Save user's version as a fire example
      feedbackRepo.insert({
        sessionId: pendingEdit.sessionId,
        variantIndex: pendingEdit.variantIdx,
        roastText: text,
        targetName: session.targetName,
        angle: variant.angle,
        llmSelfScore: variant.score ? Math.round(variant.score) : undefined,
        evaluatorTelegramId: evaluatorId,
        evaluatorName,
        verdict: 'fire',
        notes: `user_edit|original:${variant.text.slice(0, 100)}`,
      });

      // Update session rating
      sessions.addRating(pendingEdit.sessionId, evaluatorId, pendingEdit.variantIdx, 'fire');

      // Update variant message to show edit rating
      if (variant.messageId && ctx.chat) {
        const originalText = session.source === 'manual'
          ? formatManualEvalMessage(variant.text)
          : formatVariantMessage(
              variant.text,
              pendingEdit.variantIdx,
              variant.angle,
              variant.score,
              session.variants.length,
            );
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            variant.messageId,
            originalText + `\n\n<b>Ratings:</b> ✏️ ${escapeHtml(evaluatorName)}`,
            { parse_mode: 'HTML' },
          );
        } catch {
          // Message not modified — ignore
        }
      }

      const goldCount = (feedbackRepo.getStats().byVerdict['fire'] ?? 0);
      await ctx.reply(
        [
          `✅ <b>Edit saved as gold example</b>`,
          '',
          `<code>${escapeHtml(text)}</code>`,
          '',
          `<i>📚 Total gold examples: ${String(goldCount)}</i>`,
        ].join('\n'),
        { parse_mode: 'HTML' },
      );

      // Check if all variants rated → send summary
      const evaluatorRatings = session.ratings.get(evaluatorId);
      if (evaluatorRatings && evaluatorRatings.size === session.variants.length) {
        await sendSessionReport(ctx, session, feedbackRepo);
      }

      return;
    }

    // Skip very short messages
    if (text.length < 20) {
      await ctx.reply('Text too short to evaluate. Roast tweets are typically 50-280 chars.');
      return;
    }

    // Create a manual eval session with a single variant
    const session = sessions.createSession(
      'manual',
      'manual',
      [{ text, angle: 'manual', score: 0 }],
      ctx.chat.id,
    );

    const msg = await ctx.reply(formatManualEvalMessage(text), {
      parse_mode: 'HTML',
      reply_markup: ratingKeyboard(session.id, 0),
    });

    const variant = session.variants[0];
    if (variant) {
      variant.messageId = msg.message_id;
    }
  });

  return bot;
}

function buildRatingLabels(
  session: RoastSession,
  variantIdx: number,
  currentEvaluatorId: number,
  currentEvaluatorName: string,
): string[] {
  const labels: string[] = [];
  for (const [eid, evaluatorRatings] of session.ratings) {
    const v = evaluatorRatings.get(variantIdx);
    if (v) {
      const name = eid === currentEvaluatorId ? currentEvaluatorName : String(eid);
      const emoji = v === 'fire' ? '🔥' : v === 'post' ? '✅' : v === 'iterate' ? '🔄' : '❌';
      labels.push(`${emoji} ${name}`);
    }
  }
  return labels;
}

async function sendSessionReport(
  ctx: Context,
  session: RoastSession,
  feedbackRepo: FeedbackRepository,
): Promise<void> {
  const summary = formatSessionSummary(session);

  const stats = feedbackRepo.getStats();
  const goldCount = stats.byVerdict['fire'] ?? 0;
  const goldForTarget = feedbackRepo.getFireExamplesForTarget(session.targetName, 100).length;

  // Collect new golds from this session
  const newGolds: Array<{ angle: string; text: string }> = [];
  for (const [, eRatings] of session.ratings) {
    for (const [idx, v] of eRatings) {
      if (v === 'fire') {
        const va = session.variants[idx];
        if (va) newGolds.push({ angle: va.angle, text: va.text });
      }
    }
  }

  const ratedCount = new Set(
    [...session.ratings.values()].flatMap((m) => [...m.keys()]),
  ).size;

  const lines: string[] = [summary];

  // --- Section: Learning delta ---
  lines.push('<b>🧠 What the bot learned:</b>');

  if (newGolds.length > 0) {
    for (const g of newGolds) {
      const preview = g.text.length > 60 ? g.text.slice(0, 60) + '...' : g.text;
      lines.push(`  🔥 New gold [${escapeHtml(g.angle)}]: <code>${escapeHtml(preview)}</code>`);
    }
  } else {
    lines.push('  No new gold examples from this session');
  }

  lines.push(`  Gold library: <b>${String(goldCount)}</b> total (${String(goldForTarget)} for ${escapeHtml(session.targetName)})`);
  lines.push(`  Rated: ${String(ratedCount)}/${String(session.variants.length)} variants`);
  lines.push('');

  // --- Section: Angle performance ---
  const anglePerf = feedbackRepo.getAnglePerformance();
  if (anglePerf.length > 0) {
    lines.push('<b>📐 Angle performance (all sessions):</b>');
    for (const a of anglePerf.slice(0, 7)) {
      const fireRate = Math.round((a.fireCount / a.total) * 100);
      const rejectRate = Math.round((a.rejectCount / a.total) * 100);
      lines.push(`  ${escapeHtml(a.angle)} — 🔥${String(fireRate)}% · ❌${String(rejectRate)}% (${String(a.total)} ratings)`);
    }
    lines.push('');
  }

  // --- Section: Prompt impact ---
  const targetExamples = feedbackRepo.getFireExamplesForTarget(session.targetName, 1);
  const allFireExamples = feedbackRepo.getFireExamples(5);
  const otherExamples = allFireExamples
    .filter((e) => e.target.toLowerCase() !== session.targetName.toLowerCase())
    .slice(0, 2 - targetExamples.length);
  const promptExamples = [...targetExamples, ...otherExamples];

  lines.push(`<b>🔮 Next prompt for ${escapeHtml(session.targetName)}:</b>`);

  if (promptExamples.length > 0) {
    lines.push(`  Dynamic examples (${String(promptExamples.length)}/5 few-shot slots):`);
    for (const ex of promptExamples) {
      const preview = ex.text.length > 50 ? ex.text.slice(0, 50) + '...' : ex.text;
      lines.push(`  · [${escapeHtml(ex.angle)}] <code>${escapeHtml(preview)}</code>`);
    }
    lines.push(`  + ${String(5 - promptExamples.length)} static examples from character`);
  } else {
    lines.push('  No dynamic examples yet — using 5 static character examples');
  }

  const targetSessions = feedbackRepo.getTargetSessionCount(session.targetName);
  const targetAngles = feedbackRepo.getTargetAngleHistory(session.targetName);
  if (targetSessions >= 3) {
    const angleSummary = targetAngles.map((a) => `${a.angle} (${String(a.count)}x)`).join(', ');
    lines.push(`  Context injected: "${escapeHtml(session.targetName)}" roasted ${String(targetSessions)}x, angles: ${angleSummary}`);
  } else if (targetSessions > 0) {
    lines.push(`  ${escapeHtml(session.targetName)}: ${String(targetSessions)} session(s) — context line unlocks at 3`);
  }

  // --- Section: Insights ---
  const insights = generateInsights(anglePerf, newGolds.length, goldCount, session);
  if (insights.length > 0) {
    lines.push('');
    lines.push('<b>💡 Insights:</b>');
    for (const insight of insights) {
      lines.push(`  ${insight}`);
    }
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

function generateInsights(
  anglePerf: Array<{ angle: string; total: number; fireCount: number; rejectCount: number }>,
  newGoldsCount: number,
  totalGold: number,
  session: RoastSession,
): string[] {
  const insights: string[] = [];

  // Find best and worst angles (min 3 ratings to be meaningful)
  const significant = anglePerf.filter((a) => a.total >= 3);
  if (significant.length >= 2) {
    const best = significant.reduce((a, b) => (a.fireCount / a.total > b.fireCount / b.total ? a : b));
    const worst = significant.reduce((a, b) => (a.rejectCount / a.total > b.rejectCount / b.total ? a : b));
    const bestRate = Math.round((best.fireCount / best.total) * 100);
    const worstRate = Math.round((worst.rejectCount / worst.total) * 100);

    if (bestRate > 40) {
      insights.push(`Best angle: ${best.angle} (${String(bestRate)}% fire rate)`);
    }
    if (worstRate > 40) {
      insights.push(`Weakest angle: ${worst.angle} (${String(worstRate)}% reject rate)`);
    }
  }

  // Gold ratio insight
  const totalRatings = anglePerf.reduce((sum, a) => sum + a.total, 0);
  if (totalRatings >= 5) {
    const goldRatio = Math.round((totalGold / totalRatings) * 100);
    if (goldRatio < 15) {
      insights.push(`Gold rate ${String(goldRatio)}% — consider being more generous with 🔥`);
    } else if (goldRatio > 50) {
      insights.push(`Gold rate ${String(goldRatio)}% — high quality! Prompt learning is strong`);
    }
  }

  // Session coverage
  if (session.variants.length > 0 && newGoldsCount === 0) {
    insights.push('No gold this session — bot will use existing examples');
  }

  return insights;
}
