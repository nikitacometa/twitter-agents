import type { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { ExternalExampleType } from '@common/types/index.js';
import type { ExternalExampleRepository, InsertExternalExample } from '@storage/repositories/external-example.repository.js';
import type { RoastPatternRepository } from '@storage/repositories/roast-pattern.repository.js';
import { fetchTweetByUrl, isTweetUrl } from '@learning/tweet-fetcher.js';
import { analyzeExample } from '@learning/example-analyzer.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import { escapeHtml } from './formatters.js';

// --- Flow state machine ---

type FlowStep =
  | 'awaiting_type'
  | 'awaiting_original'
  | 'awaiting_roast'
  | 'awaiting_score'
  | 'awaiting_notes'
  | 'analyzing';

interface ExampleFlowState {
  step: FlowStep;
  type?: ExternalExampleType;
  originalText?: string;
  originalAuthor?: string;
  originalUrl?: string;
  roastText?: string;
  roastAuthor?: string;
  roastUrl?: string;
  context?: string;
  score?: number;
  chatId: number;
  createdAt: number;
}

const FLOW_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Active flows keyed by Telegram user ID
const flows = new Map<number, ExampleFlowState>();

function getFlow(userId: number): ExampleFlowState | undefined {
  const flow = flows.get(userId);
  if (!flow) return undefined;
  if (Date.now() - flow.createdAt > FLOW_TTL_MS) {
    flows.delete(userId);
    return undefined;
  }
  return flow;
}

function clearFlow(userId: number): void {
  flows.delete(userId);
}

// --- Keyboards ---

function typeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📝 Post + Roast', 'extype:post_roast')
    .row()
    .text('👤 Person + Roasts', 'extype:person_roast')
    .row()
    .text('📰 News + Roast', 'extype:news_roast')
    .row()
    .text('❌ Cancel', 'extype:cancel');
}

function scoreKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⭐ 1', 'exscore:1')
    .text('⭐ 2', 'exscore:2')
    .text('⭐ 3', 'exscore:3')
    .text('⭐ 4', 'exscore:4')
    .text('⭐ 5', 'exscore:5');
}

// --- Type labels ---

const TYPE_LABELS: Record<ExternalExampleType, string> = {
  post_roast: '📝 Post + Roast',
  person_roast: '👤 Person + Roasts',
  news_roast: '📰 News + Roast',
};

const ORIGINAL_PROMPTS: Record<ExternalExampleType, string> = {
  post_roast: 'Send the <b>original post</b> (URL or text):',
  person_roast: 'Describe the <b>person/project</b> (name + brief context):',
  news_roast: 'Send the <b>news</b> (URL, headline, or description):',
};

const ROAST_PROMPTS: Record<ExternalExampleType, string> = {
  post_roast: 'Now send the <b>roast reply</b> (URL or text):',
  person_roast: 'Now send the <b>roast example</b> about this person (URL or text):',
  news_roast: 'Now send the <b>roast</b> about this news (URL or text):',
};

// --- Register commands and handlers ---

export function registerExampleFlow(
  bot: Bot,
  opts: {
    exampleRepo: ExternalExampleRepository;
    patternRepo: RoastPatternRepository;
    provider: ProviderManager | null;
    logger: Logger;
  },
): void {
  const { exampleRepo, patternRepo, provider, logger } = opts;

  // /example command
  bot.command('example', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Cancel any existing flow
    clearFlow(userId);

    await ctx.reply(
      [
        '<b>📚 Add roast example</b>',
        '',
        'What type of example?',
      ].join('\n'),
      { parse_mode: 'HTML', reply_markup: typeKeyboard() },
    );
  });

  // /examples command — show stats
  bot.command('examples', async (ctx) => {
    const total = exampleRepo.getCount();
    const byType = exampleRepo.getCountByType();
    const patternCount = patternRepo.getCount();

    if (total === 0) {
      await ctx.reply('No examples yet. Use /example to add your first one!');
      return;
    }

    const lines = [
      '<b>📚 External Examples Library</b>',
      '',
      `Total: <b>${String(total)}</b> examples`,
    ];

    for (const [type, label] of Object.entries(TYPE_LABELS)) {
      const count = byType[type] ?? 0;
      if (count > 0) {
        lines.push(`  ${label}: ${String(count)}`);
      }
    }

    lines.push(`\nExtracted patterns: <b>${String(patternCount)}</b>`);

    // Show recent top examples
    const top = exampleRepo.getTop(4, 3);
    if (top.length > 0) {
      lines.push('\n<b>Top examples:</b>');
      for (const ex of top) {
        const preview = ex.roastText.length > 80 ? ex.roastText.slice(0, 80) + '...' : ex.roastText;
        lines.push(`  ⭐${String(ex.submitterScore ?? '?')} [${escapeHtml(ex.classifiedAngle ?? '?')}] <code>${escapeHtml(preview)}</code>`);
      }
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  // --- Callback: type selection ---

  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith('extype:')) {
      const userId = ctx.from.id;
      const value = data.slice(7);

      if (value === 'cancel') {
        clearFlow(userId);
        try { await ctx.answerCallbackQuery({ text: 'Cancelled' }); } catch { /* expired */ }
        if (ctx.callbackQuery.message && ctx.chat) {
          try {
            await ctx.api.editMessageText(
              ctx.chat.id,
              ctx.callbackQuery.message.message_id,
              '<i>Cancelled.</i>',
              { parse_mode: 'HTML' },
            );
          } catch { /* message not modified */ }
        }
        return;
      }

      const type = value as ExternalExampleType;
      if (!TYPE_LABELS[type]) {
        try { await ctx.answerCallbackQuery({ text: 'Invalid type' }); } catch { /* expired */ }
        return;
      }

      flows.set(userId, {
        step: 'awaiting_original',
        type,
        chatId: ctx.chat?.id ?? 0,
        createdAt: Date.now(),
      });

      try { await ctx.answerCallbackQuery({ text: TYPE_LABELS[type] }); } catch { /* expired */ }

      // Update the original message
      if (ctx.callbackQuery.message && ctx.chat) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            ctx.callbackQuery.message.message_id,
            `<b>📚 ${TYPE_LABELS[type]}</b>\n\n${ORIGINAL_PROMPTS[type]}`,
            { parse_mode: 'HTML' },
          );
        } catch { /* message not modified */ }
      }
      return;
    }

    // --- Callback: score selection ---
    if (data.startsWith('exscore:')) {
      const userId = ctx.from.id;
      const flow = getFlow(userId);
      if (!flow || flow.step !== 'awaiting_score') {
        try { await ctx.answerCallbackQuery({ text: 'No active flow' }); } catch { /* expired */ }
        return;
      }

      const score = parseInt(data.slice(8), 10);
      if (score < 1 || score > 5 || isNaN(score)) {
        try { await ctx.answerCallbackQuery({ text: 'Invalid score' }); } catch { /* expired */ }
        return;
      }

      flow.score = score;
      flow.step = 'awaiting_notes';

      try { await ctx.answerCallbackQuery({ text: `Score: ${String(score)}/5` }); } catch { /* expired */ }

      // Update message
      if (ctx.callbackQuery.message && ctx.chat) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            ctx.callbackQuery.message.message_id,
            `Rating: ${'⭐'.repeat(score)}`,
            { parse_mode: 'HTML' },
          );
        } catch { /* message not modified */ }
      }

      await ctx.reply(
        'What makes this roast good? (optional — send /skip to skip)',
      );
      return;
    }

    // Not our callback — pass to next handler
    await next();
  });

  // --- Text handler for flow steps ---

  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const flow = getFlow(userId);
    if (!flow) return next();

    const text = ctx.message.text.trim();

    // /skip for notes step
    if (text === '/skip' && flow.step === 'awaiting_notes') {
      await processAndSave(ctx, flow, undefined, exampleRepo, patternRepo, provider, logger);
      clearFlow(userId);
      return;
    }

    // /cancel at any point
    if (text === '/cancel') {
      clearFlow(userId);
      await ctx.reply('<i>Example flow cancelled.</i>', { parse_mode: 'HTML' });
      return;
    }

    switch (flow.step) {
      case 'awaiting_original': {
        // Try to fetch from URL
        if (isTweetUrl(text)) {
          const statusMsg = await ctx.reply('🔍 Fetching tweet...');
          const tweet = await fetchTweetByUrl(text, logger);
          if (tweet) {
            flow.originalText = tweet.text;
            flow.originalAuthor = tweet.authorName;
            flow.originalUrl = tweet.tweetUrl;
            await ctx.api.editMessageText(
              ctx.chat.id,
              statusMsg.message_id,
              `✅ <b>${escapeHtml(tweet.authorName)}</b>:\n<code>${escapeHtml(tweet.text)}</code>`,
              { parse_mode: 'HTML' },
            );
          } else {
            await ctx.api.editMessageText(
              ctx.chat.id,
              statusMsg.message_id,
              '⚠️ Could not fetch tweet. Send the text manually:',
            );
            return; // Stay on same step
          }
        } else {
          flow.originalText = text;
        }

        flow.step = 'awaiting_roast';
        await ctx.reply(ROAST_PROMPTS[flow.type!], { parse_mode: 'HTML' });
        return;
      }

      case 'awaiting_roast': {
        // Try to fetch from URL
        if (isTweetUrl(text)) {
          const statusMsg = await ctx.reply('🔍 Fetching tweet...');
          const tweet = await fetchTweetByUrl(text, logger);
          if (tweet) {
            flow.roastText = tweet.text;
            flow.roastAuthor = tweet.authorName;
            flow.roastUrl = tweet.tweetUrl;
            await ctx.api.editMessageText(
              ctx.chat.id,
              statusMsg.message_id,
              `✅ <b>${escapeHtml(tweet.authorName)}</b>:\n<code>${escapeHtml(tweet.text)}</code>`,
              { parse_mode: 'HTML' },
            );
          } else {
            await ctx.api.editMessageText(
              ctx.chat.id,
              statusMsg.message_id,
              '⚠️ Could not fetch tweet. Send the text manually:',
            );
            return;
          }
        } else {
          flow.roastText = text;
        }

        flow.step = 'awaiting_score';
        await ctx.reply('How good is this roast?', { reply_markup: scoreKeyboard() });
        return;
      }

      case 'awaiting_notes': {
        await processAndSave(ctx, flow, text, exampleRepo, patternRepo, provider, logger);
        clearFlow(userId);
        return;
      }

      default:
        return next();
    }
  });
}

// --- Save and analyze ---

async function processAndSave(
  ctx: Context,
  flow: ExampleFlowState,
  notes: string | undefined,
  exampleRepo: ExternalExampleRepository,
  patternRepo: RoastPatternRepository,
  provider: ProviderManager | null,
  logger: Logger,
): Promise<void> {
  if (!flow.type || !flow.originalText || !flow.roastText || !flow.score) {
    await ctx.reply('❌ Incomplete data — please start over with /example');
    return;
  }

  // Save to DB
  const insert: InsertExternalExample = {
    type: flow.type,
    originalText: flow.originalText,
    originalAuthor: flow.originalAuthor,
    originalUrl: flow.originalUrl,
    roastText: flow.roastText,
    roastAuthor: flow.roastAuthor,
    roastUrl: flow.roastUrl,
    submitterTelegramId: ctx.from!.id,
    submitterScore: flow.score,
    submitterNotes: notes,
  };

  const exampleId = exampleRepo.insert(insert);
  const total = exampleRepo.getCount();
  const byType = exampleRepo.getCountByType();

  // Quick confirmation
  const typeCounts = Object.entries(TYPE_LABELS)
    .map(([t, label]) => `${label}: ${String(byType[t] ?? 0)}`)
    .join(', ');

  await ctx.reply(
    [
      `✅ <b>Example #${String(exampleId)} saved</b>`,
      '',
      `Type: ${TYPE_LABELS[flow.type]}`,
      `Score: ${'⭐'.repeat(flow.score)}`,
      notes ? `Notes: ${escapeHtml(notes)}` : '',
      '',
      `📚 Library: ${String(total)} total (${typeCounts})`,
      provider ? '\n🔍 Analyzing...' : '\n⚠️ LLM not available — analysis skipped',
    ].filter(Boolean).join('\n'),
    { parse_mode: 'HTML' },
  );

  // Run LLM analysis if provider available
  if (!provider) return;

  try {
    const analysis = await analyzeExample(
      {
        type: flow.type,
        originalText: flow.originalText,
        roastText: flow.roastText,
        submitterNotes: notes,
      },
      provider,
      logger,
    );

    if (!analysis) {
      await ctx.reply('⚠️ Analysis failed — example saved without analysis. You can retry later.');
      return;
    }

    // Update DB with analysis
    exampleRepo.updateAnalysis(
      exampleId,
      analysis,
      analysis.reusablePattern,
      analysis.beefAngleMapping,
      analysis.specificityScore,
    );

    // Upsert pattern
    patternRepo.upsert({
      patternType: 'technique',
      description: analysis.reusablePattern,
      sourceExampleIds: [exampleId],
      effectiveness: flow.score,
    });

    // Send analysis result
    await ctx.reply(
      [
        '<b>📊 Analysis</b>',
        '',
        `<b>Technique:</b> ${escapeHtml(analysis.technique)}`,
        analysis.secondaryTechniques.length > 0
          ? `<b>Secondary:</b> ${analysis.secondaryTechniques.map(escapeHtml).join(', ')}`
          : '',
        `<b>Structure:</b> ${escapeHtml(analysis.structure)}`,
        `<b>Specificity:</b> ${String(Math.round(analysis.specificityScore * 100))}%`,
        `<b>Tone:</b> ${escapeHtml(analysis.tone)}`,
        `<b>$BEEF angle:</b> ${escapeHtml(analysis.beefAngleMapping)}`,
        '',
        `<b>Why it works:</b> ${escapeHtml(analysis.whatMakesItWork)}`,
        '',
        `<b>Reusable pattern:</b>`,
        `<code>${escapeHtml(analysis.reusablePattern)}</code>`,
        '',
        `<b>Adaptation hint:</b> ${escapeHtml(analysis.adaptationHint)}`,
        '',
        analysis.dataPointsUsed.length > 0
          ? `<b>Data points:</b> ${analysis.dataPointsUsed.map(escapeHtml).join(', ')}`
          : '',
      ].filter(Boolean).join('\n'),
      { parse_mode: 'HTML' },
    );
  } catch (error) {
    logger.error({ err: getErrorMessage(error), exampleId }, 'Example analysis failed');
    await ctx.reply(
      `⚠️ Analysis error: ${escapeHtml(getErrorMessage(error).slice(0, 200))}\nExample saved — you can retry analysis later.`,
      { parse_mode: 'HTML' },
    );
  }
}
