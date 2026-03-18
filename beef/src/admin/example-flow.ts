import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Bot, Context } from 'grammy';
import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { ExternalExampleRepository, InsertExternalExample } from '@storage/repositories/external-example.repository.js';
import type { RoastPatternRepository } from '@storage/repositories/roast-pattern.repository.js';
import { isTweetUrl, fetchTweetByUrl } from '@learning/tweet-fetcher.js';
import type { FetchedTweet } from '@learning/tweet-fetcher.js';
import { parseAndAnalyzeExample } from '@learning/example-analyzer.js';
import type { ExampleParseResult } from '@learning/example-analyzer.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import { escapeHtml } from './formatters.js';

// Users who sent /example and are waiting to send content
const awaitingInput = new Set<number>();
const AWAIT_TTL_MS = 5 * 60 * 1000;
const awaitingTimers = new Map<number, ReturnType<typeof setTimeout>>();

function startAwaiting(userId: number): void {
  clearAwaiting(userId);
  awaitingInput.add(userId);
  const timer = setTimeout(() => {
    awaitingInput.delete(userId);
    awaitingTimers.delete(userId);
  }, AWAIT_TTL_MS);
  awaitingTimers.set(userId, timer);
}

function clearAwaiting(userId: number): void {
  awaitingInput.delete(userId);
  const timer = awaitingTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    awaitingTimers.delete(userId);
  }
}

function isAwaiting(userId: number): boolean {
  return awaitingInput.has(userId);
}

// --- Tweet URL extraction from text ---

const TWEET_URL_RE = /https?:\/\/(?:(?:www\.)?(?:twitter|x)\.com)\/\w+\/status\/\d+/g;

function extractTweetUrls(text: string): string[] {
  return [...text.matchAll(TWEET_URL_RE)].map((m) => m[0]);
}

// --- Photo download ---

async function downloadTelegramPhoto(
  ctx: Context,
  botToken: string,
  logger: Logger,
): Promise<string | null> {
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return null;

  // Get largest photo (last in array)
  const largest = photos[photos.length - 1];
  if (!largest) return null;

  try {
    const file = await ctx.api.getFile(largest.file_id);
    if (!file.file_path) {
      logger.warn('Telegram getFile returned no file_path');
      return null;
    }

    const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Failed to download photo from Telegram');
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = file.file_path.endsWith('.png') ? 'png' : 'jpg';
    const dir = join(tmpdir(), 'beef-examples');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `example-${Date.now()}.${ext}`);
    writeFileSync(filePath, buffer);

    logger.debug({ filePath, sizeKb: Math.round(buffer.length / 1024) }, 'Photo downloaded');
    return filePath;
  } catch (error) {
    logger.error({ err: getErrorMessage(error) }, 'Failed to download Telegram photo');
    return null;
  }
}

function cleanupTempFile(path: string | null, logger: Logger): void {
  if (!path) return;
  try {
    rmSync(path, { force: true });
  } catch (error) {
    logger.debug({ err: getErrorMessage(error), path }, 'Failed to cleanup temp file');
  }
}

// --- Resolve tweet URLs ---

async function resolveTweetUrls(
  urls: string[],
  logger: Logger,
): Promise<FetchedTweet[]> {
  const results: FetchedTweet[] = [];
  for (const url of urls.slice(0, 5)) {
    const tweet = await fetchTweetByUrl(url, logger);
    if (tweet) results.push(tweet);
  }
  return results;
}

// --- Format analysis result for Telegram ---

function formatResult(
  exampleId: number,
  result: ExampleParseResult,
  total: number,
): string {
  const { parsed, analysis } = result;
  const typeLabels = {
    post_roast: '📝 Post + Roast',
    person_roast: '👤 Person + Roast',
    news_roast: '📰 News + Roast',
  };

  const lines = [
    `<b>✅ Example #${String(exampleId)} saved</b>`,
    '',
    `<b>Type:</b> ${typeLabels[parsed.type]}`,
    `<b>Score:</b> ${'⭐'.repeat(parsed.score)}`,
    '',
    `<b>Original:</b> ${escapeHtml(parsed.originalText.slice(0, 120))}${parsed.originalText.length > 120 ? '...' : ''}`,
    parsed.originalAuthor ? `<b>By:</b> ${escapeHtml(parsed.originalAuthor)}` : '',
    '',
    `<b>Roast:</b>`,
    `<code>${escapeHtml(parsed.roastText)}</code>`,
    parsed.roastAuthor ? `<b>By:</b> ${escapeHtml(parsed.roastAuthor)}` : '',
    '',
    '<b>--- Analysis ---</b>',
    `<b>Technique:</b> ${escapeHtml(analysis.technique)}`,
    analysis.secondaryTechniques.length > 0
      ? `<b>Secondary:</b> ${analysis.secondaryTechniques.map(escapeHtml).join(', ')}`
      : '',
    `<b>Structure:</b> ${escapeHtml(analysis.structure)}`,
    `<b>Angle:</b> ${escapeHtml(analysis.beefAngleMapping)}`,
    `<b>Specificity:</b> ${String(Math.round(analysis.specificityScore * 100))}%`,
    `<b>Tone:</b> ${escapeHtml(analysis.tone)}`,
    '',
    `<b>Why it works:</b> ${escapeHtml(analysis.whatMakesItWork)}`,
    '',
    `<b>Pattern:</b>`,
    `<code>${escapeHtml(analysis.reusablePattern)}</code>`,
    '',
    `<b>Adaptation:</b> ${escapeHtml(analysis.adaptationHint)}`,
    '',
    `📚 Library: ${String(total)} total`,
  ];

  return lines.filter(Boolean).join('\n');
}

// --- Main processing ---

async function processExampleInput(
  ctx: Context,
  botToken: string,
  exampleRepo: ExternalExampleRepository,
  patternRepo: RoastPatternRepository,
  provider: ProviderManager | null,
  logger: Logger,
): Promise<void> {
  if (!provider) {
    await ctx.reply('⚠️ LLM provider not available — cannot process examples.');
    return;
  }

  const text = ctx.message?.text ?? ctx.message?.caption ?? undefined;
  const hasPhoto = !!ctx.message?.photo && ctx.message.photo.length > 0;

  if (!text && !hasPhoto) {
    await ctx.reply('Send text, a screenshot, tweet URLs, or any combination.');
    return;
  }

  // Status message
  const statusMsg = await ctx.reply('🔍 Analyzing...');

  let imagePath: string | null = null;
  let resolvedTweets: FetchedTweet[] = [];

  try {
    // Download photo if present
    if (hasPhoto) {
      imagePath = await downloadTelegramPhoto(ctx, botToken, logger);
      if (imagePath) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMsg.message_id,
          '🔍 Image downloaded, analyzing...',
        );
      }
    }

    // Resolve tweet URLs from text
    if (text) {
      const urls = extractTweetUrls(text);
      if (urls.length > 0) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMsg.message_id,
          `🔍 Fetching ${String(urls.length)} tweet${urls.length > 1 ? 's' : ''}...`,
        );
        resolvedTweets = await resolveTweetUrls(urls, logger);
      }
    }

    // Update status
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `🔍 ${imagePath ? 'Reading image + ' : ''}Parsing and analyzing...`,
    ).catch(() => { /* message not modified */ });

    // Run LLM
    const result = await parseAndAnalyzeExample(
      { text, imagePath: imagePath ?? undefined, resolvedTweets },
      provider,
      logger,
    );

    if (!result) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        '❌ Could not parse this input. Try sending:\n• A screenshot of the roast\n• Tweet URL(s)\n• Text of the original + the roast',
      );
      return;
    }

    // Save to DB
    const insert: InsertExternalExample = {
      type: result.parsed.type,
      originalText: result.parsed.originalText,
      originalAuthor: result.parsed.originalAuthor ?? undefined,
      roastText: result.parsed.roastText,
      roastAuthor: result.parsed.roastAuthor ?? undefined,
      context: result.parsed.context ?? undefined,
      submitterTelegramId: ctx.from!.id,
      submitterScore: result.parsed.score,
    };

    const exampleId = exampleRepo.insert(insert);

    // Save analysis
    exampleRepo.updateAnalysis(
      exampleId,
      result.analysis,
      result.analysis.reusablePattern,
      result.analysis.beefAngleMapping,
      result.analysis.specificityScore,
    );

    // Upsert pattern
    patternRepo.upsert({
      patternType: 'technique',
      description: result.analysis.reusablePattern,
      sourceExampleIds: [exampleId],
      effectiveness: result.parsed.score,
    });

    const total = exampleRepo.getCount();

    // Replace status with result
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      formatResult(exampleId, result, total),
      { parse_mode: 'HTML' },
    );
  } catch (error) {
    logger.error({ err: getErrorMessage(error) }, 'Example processing failed');
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Error: ${escapeHtml(getErrorMessage(error).slice(0, 200))}`,
      { parse_mode: 'HTML' },
    ).catch(() => { /* message not modified */ });
  } finally {
    cleanupTempFile(imagePath, logger);
  }
}

// --- Register commands and handlers ---

export function registerExampleFlow(
  bot: Bot,
  opts: {
    botToken: string;
    exampleRepo: ExternalExampleRepository;
    patternRepo: RoastPatternRepository;
    provider: ProviderManager | null;
    logger: Logger;
  },
): void {
  const { botToken, exampleRepo, patternRepo, provider, logger } = opts;

  // /example command — start or immediate process
  bot.command('example', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const inlineText = ctx.match?.trim();

    if (inlineText) {
      // /example <text> — process immediately
      await processExampleInput(
        ctx, botToken, exampleRepo, patternRepo, provider, logger,
      );
    } else {
      // /example with no args — wait for next message
      startAwaiting(userId);
      await ctx.reply(
        [
          '<b>📚 Send a roast example</b>',
          '',
          'Anything goes — I\'ll figure it out:',
          '• Screenshot of a tweet/reply',
          '• Tweet URL(s)',
          '• Text of the roast',
          '• Photo + caption',
          '• Any combination',
          '',
          '<i>Send /cancel to abort</i>',
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
    }
  });

  // /examples command — show stats
  bot.command('examples', async (ctx) => {
    const total = exampleRepo.getCount();
    const byType = exampleRepo.getCountByType();
    const patternCount = patternRepo.getCount();

    if (total === 0) {
      await ctx.reply('No examples yet. Use /example to add the first one!');
      return;
    }

    const typeLabels: Record<string, string> = {
      post_roast: '📝 Post + Roast',
      person_roast: '👤 Person + Roast',
      news_roast: '📰 News + Roast',
    };

    const lines = [
      '<b>📚 External Examples Library</b>',
      '',
      `Total: <b>${String(total)}</b> examples`,
    ];

    for (const [type, label] of Object.entries(typeLabels)) {
      const count = byType[type] ?? 0;
      if (count > 0) {
        lines.push(`  ${label}: ${String(count)}`);
      }
    }

    lines.push(`\nExtracted patterns: <b>${String(patternCount)}</b>`);

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

  // Handle next message from users awaiting input (text or photo)
  bot.on(['message:text', 'message:photo'], async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !isAwaiting(userId)) return next();

    const text = ctx.message.text ?? ctx.message.caption ?? '';

    // /cancel
    if (text.trim() === '/cancel') {
      clearAwaiting(userId);
      await ctx.reply('<i>Cancelled.</i>', { parse_mode: 'HTML' });
      return;
    }

    // Skip other commands
    if (text.startsWith('/') && !isTweetUrl(text)) {
      return next();
    }

    clearAwaiting(userId);
    await processExampleInput(
      ctx, botToken, exampleRepo, patternRepo, provider, logger,
    );
  });
}
