import { Bot } from 'grammy';
import type { Context } from 'grammy';
import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { HumanVerdict } from '@common/types/index.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import { ratingKeyboard } from './keyboards.js';
import { SessionStore } from './session-store.js';
import { generateRoasts } from './roast-generator.js';
import {
  escapeHtml,
  formatManualEvalMessage,
  formatSessionSummary,
  formatStatsMessage,
  formatVariantMessage,
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
}): Bot {
  const { token, adminIds, openAccess, feedbackRepo, provider, logger } = opts;
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
        '<b>Commands:</b>',
        '/roast &lt;target&gt; — generate 3 roast variants via LLM, rate them',
        '/stats — show feedback statistics',
        '/status — bot + provider health',
        '',
        '<b>How it works:</b>',
        '1. Send /roast &lt;target&gt; or paste a roast text',
        '2. Rate each variant: 🔥 FIRE / ✅ POST / 🔄 ITERATE / ❌ REJECT',
        '3. Check /stats to see what patterns work',
        '',
        isGroupChat(ctx)
          ? '<i>In groups: paste text as a reply to my message to evaluate.</i>'
          : '<i>In private chat: just paste any text to evaluate it.</i>',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

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

    const statusMsg = await ctx.reply(`🔍 Researching <b>${escapeHtml(target)}</b>...`, {
      parse_mode: 'HTML',
    });

    try {
      const output = await generateRoasts(target, provider, logger);

      // Create session
      const session = sessions.createSession(
        target,
        'generate',
        output.variants.map((v) => ({
          text: v.text,
          angle: v.angle,
          score: v.score,
        })),
        ctx.chat.id,
      );

      // Update status message
      const researchNote = output.researchNotes
        ? `\n\n<i>📝 ${escapeHtml(output.researchNotes.slice(0, 200))}</i>`
        : '';
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `✅ Generated ${String(output.variants.length)} variants for <b>${escapeHtml(target)}</b>${researchNote}`,
        { parse_mode: 'HTML' },
      );

      // Send each variant with rating buttons
      for (let i = 0; i < session.variants.length; i++) {
        const variant = session.variants[i];
        if (!variant) continue;
        const msg = await ctx.reply(
          formatVariantMessage(variant.text, i, variant.angle, variant.score, session.variants.length),
          {
            parse_mode: 'HTML',
            reply_markup: ratingKeyboard(session.id, i),
          },
        );
        variant.messageId = msg.message_id;
      }
    } catch (error) {
      logger.error({ err: error, target }, 'Roast generation failed');
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `❌ Generation failed: ${escapeHtml(getErrorMessage(error))}`,
        { parse_mode: 'HTML' },
      );
    }
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
    await ctx.reply(
      [
        '<b>🤖 Bot Status</b>',
        '',
        providerStatus,
        `Total ratings: <b>${String(stats.total)}</b>`,
        `Access: ${adminStr}`,
        `Chat type: ${ctx.chat.type}`,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  // --- Callback: rating buttons ---

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Parse: rate:{sessionId}:{variantIdx}:{verdict}
    if (data.startsWith('rate:')) {
      const parts = data.split(':');
      if (parts.length !== 4) {
        await ctx.answerCallbackQuery({ text: 'Invalid callback data' });
        return;
      }
      const sessionId = parts[1]!;
      const variantIdx = parseInt(parts[2]!, 10);
      const verdict = parts[3] as HumanVerdict;

      if (!VALID_VERDICTS.has(verdict) || isNaN(variantIdx)) {
        await ctx.answerCallbackQuery({ text: 'Invalid rating' });
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) {
        await ctx.answerCallbackQuery({ text: 'Session expired' });
        return;
      }

      const evaluatorId = ctx.from.id;
      const evaluatorName = ctx.from.username ?? ctx.from.first_name;

      // Check for re-rating
      const existingRating = sessions.getRating(sessionId, evaluatorId, variantIdx);
      if (existingRating) {
        await ctx.answerCallbackQuery({
          text: `Already rated ${existingRating.toUpperCase()}. Updating to ${verdict.toUpperCase()}.`,
        });
      }

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

      // Update button text to show who rated what
      const ratingLabels: string[] = [];
      for (const [eid, evaluatorRatings] of session.ratings) {
        const v = evaluatorRatings.get(variantIdx);
        if (v) {
          const name = eid === evaluatorId ? evaluatorName : String(eid);
          const emoji = v === 'fire' ? '🔥' : v === 'post' ? '✅' : v === 'iterate' ? '🔄' : '❌';
          ratingLabels.push(`${emoji} ${name}`);
        }
      }

      // Edit message to show ratings but keep buttons for other evaluators
      if (variant?.messageId && ctx.chat) {
        const originalText = session.source === 'manual'
          ? formatManualEvalMessage(variant.text)
          : formatVariantMessage(
              variant.text,
              variantIdx,
              variant.angle,
              variant.score,
              session.variants.length,
            );
        const ratingsLine = `\n\n<b>Ratings:</b> ${ratingLabels.join(' · ')}`;

        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            variant.messageId,
            originalText + ratingsLine,
            {
              parse_mode: 'HTML',
              reply_markup: ratingKeyboard(sessionId, variantIdx),
            },
          );
        } catch {
          // Message might not have changed — ignore
        }
      }

      await ctx.answerCallbackQuery({
        text: `Rated: ${verdict.toUpperCase()}`,
      });

      // Check if all variants rated by this evaluator → send summary
      const evaluatorRatings = session.ratings.get(evaluatorId);
      if (evaluatorRatings && evaluatorRatings.size === session.variants.length) {
        await ctx.reply(formatSessionSummary(session), { parse_mode: 'HTML' });
      }

      return;
    }

    await ctx.answerCallbackQuery({ text: 'Unknown action' });
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
