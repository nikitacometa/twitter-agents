#!/usr/bin/env npx tsx
/**
 * Meme Farm Pipeline — generates N memes for a tweet, evaluates ALL with vision, ranks results.
 *
 * Usage:
 *   npx tsx scripts/meme-farm.ts <tweet_url> [--count N] [--top K] [--db <path>] [--dry-run]
 *
 * Examples:
 *   npx tsx scripts/meme-farm.ts https://x.com/VitalikButerin/status/123456789
 *   npx tsx scripts/meme-farm.ts https://x.com/some_user/status/999 --count 15 --top 5
 *   npx tsx scripts/meme-farm.ts https://x.com/some_user/status/999 --dry-run
 */

import { config } from 'dotenv';
config({ override: true });
config({ path: '.env.production' });

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, copyFile, unlink, readFile } from 'node:fs/promises';
import { TwitterApi } from 'twitter-api-v2';
import { createDatabase } from '@storage/database.js';
import { LlmLogRepository } from '@storage/repositories/llm-log.repository.js';
import { MemeHistoryRepository } from '../src/meme/meme-history.repository.js';
import { AnthropicSDKProvider } from '@agent/anthropic-sdk.provider.js';
import { ImgflipClient } from '../src/meme/imgflip-client.js';
import { MemeGenerator } from '../src/meme/meme-generator.js';
import type { MemeOutput } from '../src/meme/meme-generator.js';
import { MemeJudge } from '../src/meme/meme-judge.js';
import type { MemeJudgeInput, MemeJudgeScore } from '../src/meme/meme-judge.js';
import { pickStrategies } from '../src/meme/meme-strategies.js';
import type { MemeStrategy } from '../src/meme/meme-strategies.js';
import { TwitterEnricher } from '../src/farm/twitter-enricher.js';
import { createFarmLogger } from '../src/farm/logger.js';
import { getErrorMessage } from '@common/utils/error.util.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = resolve(__dirname, '../data/beef.db');

// ─── Args ───────────────────────────────────────────────────────────────────

interface CliArgs {
  tweetUrl: string;
  count: number;
  top: number;
  dbPath: string;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const tweetUrl = args.find((a) => !a.startsWith('--'));

  if (!tweetUrl) {
    console.error('Usage: npx tsx scripts/meme-farm.ts <tweet_url> [--count N] [--top K] [--db <path>]');
    process.exit(1);
  }

  const getFlag = (name: string, fallback: string): string => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1]! : fallback;
  };

  return {
    tweetUrl,
    count: parseInt(getFlag('count', '10'), 10),
    top: parseInt(getFlag('top', '3'), 10),
    dbPath: getFlag('db', DEFAULT_DB_PATH),
    dryRun: args.includes('--dry-run'),
  };
}

function parseTweetId(input: string): string {
  const match = input.match(/status\/(\d+)/);
  if (!match?.[1]) {
    console.error(`Cannot extract tweet ID from: ${input}`);
    console.error('Expected format: https://x.com/<user>/status/<id>');
    process.exit(1);
  }
  return match[1];
}

// ─── Tweet Fetching ─────────────────────────────────────────────────────────

interface TweetData {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string;
  authorBio: string;
  authorFollowers: number;
  metrics: { likes: number; rts: number; replies: number; views: number };
  parentTweet: { author: string; text: string } | null;
  quotedTweet: { author: string; text: string } | null;
}

interface TwitterCreds {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}

async function fetchTweet(tweetId: string, creds: TwitterCreds): Promise<TweetData> {
  const client = new TwitterApi(creds).readOnly.v2;

  const tweet = await client.singleTweet(tweetId, {
    'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'conversation_id', 'in_reply_to_user_id', 'referenced_tweets', 'entities'],
    expansions: ['author_id', 'referenced_tweets.id', 'referenced_tweets.id.author_id'],
    'user.fields': ['name', 'username', 'description', 'public_metrics', 'verified'],
  });

  const author = tweet.includes?.users?.[0];
  const pm = tweet.data.public_metrics;

  // Find parent / quoted tweet from includes
  let parentTweet: TweetData['parentTweet'] = null;
  let quotedTweet: TweetData['quotedTweet'] = null;

  if (tweet.data.referenced_tweets) {
    for (const ref of tweet.data.referenced_tweets) {
      const refTweet = tweet.includes?.tweets?.find((t) => t.id === ref.id);
      if (!refTweet) continue;
      const refAuthor = tweet.includes?.users?.find((u) => u.id === refTweet.author_id);
      const entry = { author: refAuthor?.username ?? 'unknown', text: refTweet.text };
      if (ref.type === 'replied_to') parentTweet = entry;
      if (ref.type === 'quoted') quotedTweet = entry;
    }
  }

  return {
    id: tweet.data.id,
    text: tweet.data.text,
    authorUsername: author?.username ?? 'unknown',
    authorName: author?.name ?? '',
    authorBio: author?.description ?? '',
    authorFollowers: author?.public_metrics?.followers_count ?? 0,
    metrics: {
      likes: pm?.like_count ?? 0,
      rts: pm?.retweet_count ?? 0,
      replies: pm?.reply_count ?? 0,
      views: pm?.impression_count ?? 0,
    },
    parentTweet,
    quotedTweet,
  };
}

// ─── Contradiction Detection ────────────────────────────────────────────────

interface ContradictionResult {
  contradictions: string[];
}

async function detectContradictions(
  sdk: AnthropicSDKProvider,
  tweetText: string,
  authorContext: string,
): Promise<string[]> {
  const prompt = `Analyze this tweet and the author's recent activity. Find specific contradictions, hypocrisy, or ironic gaps between what they say in this tweet vs their behavior/past statements.

TWEET: "${tweetText}"

AUTHOR CONTEXT:
${authorContext}

Return ONLY valid JSON (no markdown, no code fences):
{"contradictions":["contradiction 1","contradiction 2"]}

If no contradictions found, return {"contradictions":[]}`;

  const result = await sdk.run<ContradictionResult>('contradiction-detect', {
    prompt,
    requiresResearch: false,
  });

  return result.data.contradictions ?? [];
}

// ─── Context Assembly ───────────────────────────────────────────────────────

function assembleContext(
  tweet: TweetData,
  enrichment: string | null,
  contradictions: string[],
): string {
  const sections: string[] = [];

  // Contradictions FIRST — most valuable meme material, survives truncation
  if (contradictions.length > 0) {
    sections.push(`CONTRADICTIONS/HYPOCRISY FOUND (use these — they're meme gold):\n${contradictions.map((c, i) => `${String(i + 1)}. ${c}`).join('\n')}`);
  }

  // Tweet itself
  sections.push(`TARGET TWEET by @${tweet.authorUsername}:\n"${tweet.text}"`);

  // Metrics
  const m = tweet.metrics;
  sections.push(`Metrics: ${String(m.likes)} likes, ${String(m.rts)} RTs, ${String(m.replies)} replies, ${String(m.views)} views`);

  // Parent tweet context
  if (tweet.parentTweet) {
    sections.push(`REPLYING TO @${tweet.parentTweet.author}: "${tweet.parentTweet.text}"`);
  }

  // Quoted tweet context
  if (tweet.quotedTweet) {
    sections.push(`QUOTING @${tweet.quotedTweet.author}: "${tweet.quotedTweet.text}"`);
  }

  // Enrichment
  if (enrichment) {
    sections.push(enrichment);
  }

  return sections.join('\n\n');
}

// ─── Parallel Generation ────────────────────────────────────────────────────

interface GeneratedMeme {
  index: number;
  output: MemeOutput;
  strategy: MemeStrategy;
}

interface GenerateResult {
  memes: GeneratedMeme[];
  failed: number;
  degraded: number;
}

async function generateMemes(
  generator: MemeGenerator,
  context: string,
  tweet: TweetData,
  strategies: MemeStrategy[],
  logger: ReturnType<typeof createFarmLogger>,
): Promise<GenerateResult> {
  const results: GeneratedMeme[] = [];
  const usedTemplateIds: string[] = [];
  let failed = 0;
  let degraded = 0;
  const CONCURRENCY = 5;
  const DELAY_MS = 300;

  for (let i = 0; i < strategies.length; i += CONCURRENCY) {
    const chunk = strategies.slice(i, i + CONCURRENCY);

    const settled = await Promise.allSettled(
      chunk.map((strategy, chunkIdx) => {
        const globalIdx = i + chunkIdx;
        logger.info(
          { index: globalIdx, strategy: strategy.id },
          `Generating meme variant ${String(globalIdx + 1)}/${String(strategies.length)}`,
        );
        return generator.generate({
          target: `@${tweet.authorUsername}`,
          targetType: 'person',
          context,
          isTweetResponse: true,
          strategy,
          preferStandalone: true,
          skipHistoryInsert: true,
          excludeTemplateIds: [...usedTemplateIds],
        });
      }),
    );

    for (let j = 0; j < settled.length; j++) {
      const r = settled[j]!;
      const globalIdx = i + j;
      if (r.status === 'fulfilled' && r.value.meme) {
        results.push({
          index: globalIdx,
          output: r.value,
          strategy: chunk[j]!,
        });
        usedTemplateIds.push(r.value.meme.templateId);
      } else if (r.status === 'rejected') {
        failed++;
        logger.warn(
          { err: getErrorMessage(r.reason), index: globalIdx, strategy: chunk[j]!.id },
          'Meme generation failed for variant',
        );
      } else if (r.status === 'fulfilled' && !r.value.meme) {
        degraded++;
        logger.warn(
          { index: globalIdx, strategy: chunk[j]!.id, format: r.value.format, degradation: r.value.degradationReason },
          'Meme variant degraded to text_only',
        );
      }
    }

    // Delay between chunks to avoid Imgflip rate limits
    if (i + CONCURRENCY < strategies.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  return { memes: results, failed, degraded };
}

// ─── Telegram Notification ───────────────────────────────────────────────────

interface TelegramPhotoResult {
  sent: number;
  skipped: number;
}

async function sendToTelegram(
  topMemes: Array<{ localPath: string; rank: number; strategy: string; template: string; boxes: string[]; composite: number }>,
  tweetAuthor: string,
  tweetText: string,
  totalGenerated: number,
  totalEvaluated: number,
  logger: ReturnType<typeof createFarmLogger>,
): Promise<TelegramPhotoResult> {
  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  const chatId = process.env['TELEGRAM_CHAT_ID'];

  if (!botToken || !chatId) {
    logger.info('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping Telegram notification');
    return { sent: 0, skipped: topMemes.length };
  }

  let sent = 0;
  for (const meme of topMemes) {
    try {
      const photoData = await readFile(meme.localPath);
      const blob = new Blob([photoData], { type: 'image/jpeg' });

      // Hidden AI scores: show "AI: ?" for blind evaluation
      const caption = [
        `<b>#${String(meme.rank)} Meme Farm</b> — @${tweetAuthor}`,
        `Strategy: ${meme.strategy} | Template: ${meme.template}`,
        `Boxes: ${meme.boxes.map((b) => `"${b}"`).join(' | ')}`,
        `AI: <tg-spoiler>${String(meme.composite)}</tg-spoiler>`,
        ``,
        `Tweet: "${tweetText.slice(0, 100)}${tweetText.length > 100 ? '...' : ''}"`,
        ``,
        `Rate 1-5:`,
      ].join('\n');

      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', blob, 'meme.jpg');
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        const body = await response.text();
        logger.warn({ status: response.status, body, rank: meme.rank }, 'Telegram sendPhoto failed');
      } else {
        sent++;
      }
    } catch (err) {
      logger.warn({ err: getErrorMessage(err), rank: meme.rank }, 'Failed to send meme to Telegram');
    }
  }

  // Send summary message
  try {
    const summary = [
      `<b>Meme Farm Summary</b>`,
      `Target: @${tweetAuthor}`,
      `Generated: ${String(totalGenerated)} | Evaluated: ${String(totalEvaluated)} | Sent: ${String(sent)}`,
    ].join('\n');

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: summary,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    logger.warn({ err: getErrorMessage(err) }, 'Failed to send summary to Telegram');
  }

  return { sent, skipped: topMemes.length - sent };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const logger = createFarmLogger();
  const tweetId = parseTweetId(args.tweetUrl);

  logger.info({ tweetId, count: args.count, top: args.top }, 'Meme farm starting');

  // ── Bootstrap ──────────────────────────────────────────────────────────

  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicKey) {
    logger.error('ANTHROPIC_API_KEY is required for meme-farm');
    process.exit(1);
  }

  const imgflipUser = process.env['IMGFLIP_USERNAME'];
  const imgflipPass = process.env['IMGFLIP_PASSWORD'];
  if (!imgflipUser || !imgflipPass) {
    logger.error('IMGFLIP_USERNAME and IMGFLIP_PASSWORD are required');
    process.exit(1);
  }

  const twitterApiKey = process.env['TWITTER_API_KEY'];
  const twitterApiSecret = process.env['TWITTER_API_SECRET'];
  const twitterAccessToken = process.env['TWITTER_ACCESS_TOKEN'];
  const twitterAccessSecret = process.env['TWITTER_ACCESS_SECRET'];
  if (!twitterApiKey || !twitterApiSecret || !twitterAccessToken || !twitterAccessSecret) {
    logger.error('Twitter API creds (TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET) are required');
    process.exit(1);
  }

  const db = createDatabase(args.dbPath, logger);
  const logRepo = new LlmLogRepository(db);
  const historyRepo = new MemeHistoryRepository(db);
  const sdk = new AnthropicSDKProvider(anthropicKey, logger, logRepo);
  const imgflip = new ImgflipClient(imgflipUser, imgflipPass, logger);
  const generator = new MemeGenerator(imgflip, sdk, historyRepo, logger);
  const judge = new MemeJudge(sdk, logger);

  const twitterCreds: TwitterCreds = {
    appKey: twitterApiKey,
    appSecret: twitterApiSecret,
    accessToken: twitterAccessToken,
    accessSecret: twitterAccessSecret,
  };

  // ── 1. Fetch tweet ─────────────────────────────────────────────────────

  logger.info('Fetching tweet...');
  const tweet = await fetchTweet(tweetId, twitterCreds);
  logger.info(
    { author: `@${tweet.authorUsername}`, text: tweet.text.slice(0, 80) },
    'Tweet fetched',
  );

  // ── 2. Enrich author (non-fatal) ──────────────────────────────────────

  let enrichmentContext: string | null = null;
  try {
    const apiClient = new TwitterApi(twitterCreds);
    const enricher = new TwitterEnricher({ apiClient, logger });
    const enrichResult = await enricher.enrich(tweet.authorUsername);
    if (enrichResult?.hasData) {
      enrichmentContext = enrichResult.profileContext;
      logger.info(
        { username: enrichResult.username, followers: enrichResult.followersCount },
        'Author enrichment complete',
      );
    }
  } catch (err) {
    logger.warn({ err: getErrorMessage(err) }, 'Author enrichment failed — proceeding without');
  }

  // ── 3. Detect contradictions (non-fatal) ──────────────────────────────

  let contradictions: string[] = [];
  if (enrichmentContext) {
    try {
      contradictions = await detectContradictions(sdk, tweet.text, enrichmentContext);
      if (contradictions.length > 0) {
        logger.info({ count: contradictions.length }, 'Contradictions detected');
      }
    } catch (err) {
      logger.warn({ err: getErrorMessage(err) }, 'Contradiction detection failed — proceeding without');
    }
  }

  // ── 4. Assemble context ───────────────────────────────────────────────

  const context = assembleContext(tweet, enrichmentContext, contradictions);

  // ── 5. Pick strategies ────────────────────────────────────────────────

  const strategies = pickStrategies(args.count);
  logger.info(
    { strategies: strategies.map((s) => s.id) },
    `Picked ${String(strategies.length)} strategies`,
  );

  // ── Dry run: show context + strategies, then exit ────────────────────

  if (args.dryRun) {
    console.log('\n' + '═'.repeat(80));
    console.log('  DRY RUN — showing context + strategies, no generation');
    console.log('═'.repeat(80));
    console.log(`\nTweet: @${tweet.authorUsername}: "${tweet.text}"`);
    console.log(`\nEnrichment: ${enrichmentContext ? 'yes' : 'no'}`);
    console.log(`Contradictions: ${String(contradictions.length)}`);
    if (contradictions.length > 0) {
      for (const c of contradictions) console.log(`  - ${c}`);
    }
    console.log(`\nContext length: ${String(context.length)} chars`);
    console.log(`\nStrategies (${String(strategies.length)}):`);
    for (const s of strategies) {
      console.log(`  ${s.id} (weight ${String(s.weight)}) — ${String(s.compatibleTemplates.length)} templates`);
    }
    console.log('═'.repeat(80) + '\n');
    db.close();
    return;
  }

  // ── 6. Generate all memes ─────────────────────────────────────────────

  logger.info('Generating memes...');
  const genResult = await generateMemes(generator, context, tweet, strategies, logger);
  const generated = genResult.memes;
  logger.info(
    { rendered: generated.length, failed: genResult.failed, degraded: genResult.degraded },
    `Generated ${String(generated.length)}/${String(args.count)} memes with images`,
  );

  if (generated.length === 0) {
    logger.error('All meme generations failed — nothing to evaluate');
    db.close();
    process.exit(1);
  }

  // Wrap evaluation + save + output in try/finally to guarantee tmp cleanup
  try {
    // ── 7. Evaluate ALL with vision ─────────────────────────────────────

    logger.info('Evaluating memes with vision...');
    const judgeInputs: MemeJudgeInput[] = generated.map((g) => ({
      localPath: g.output.meme!.localPath,
      templateName: g.output.meme!.templateName,
      tweetText: tweet.text,
      tweetAuthor: tweet.authorUsername,
      boxes: g.output.meme!.boxes,
      strategy: g.strategy.id,
      index: g.index,
    }));

    const scores = await judge.evaluateBatch(judgeInputs);
    logger.info(`Evaluated ${String(scores.length)} memes`);

    // ── 8. Merge scores with generated data ─────────────────────────────

    interface RankedMeme {
      rank: number;
      score: MemeJudgeScore;
      meme: GeneratedMeme;
    }

    const ranked: RankedMeme[] = scores
      .map((score) => {
        const meme = generated.find((g) => g.index === score.index);
        if (!meme) return null;
        return { rank: 0, score, meme };
      })
      .filter((r): r is RankedMeme => r !== null);

    // Assign continuous ranks after filtering
    ranked.forEach((r, i) => { r.rank = i + 1; });

    // ── 9. Save to meme_history with vision scores ──────────────────────

    for (const r of ranked) {
      try {
        historyRepo.insert({
          templateId: r.meme.output.meme!.templateId,
          templateName: r.meme.output.meme!.templateName,
          target: `@${tweet.authorUsername}`,
          boxes: r.meme.output.meme!.boxes,
          format: r.meme.output.format,
          imageUrl: r.meme.output.meme!.imageUrl,
          rationale: r.meme.output.meme!.rationale,
          strategy: r.meme.strategy.id,
          visionScore: r.score.composite,
        });
      } catch (err) {
        logger.warn({ err: getErrorMessage(err), index: r.meme.index }, 'Failed to save meme history');
      }
    }

    // ── 10. Save top-K images ───────────────────────────────────────────

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outDir = resolve(__dirname, `../data/meme-farm/${tweetId}-${timestamp}`);
    await mkdir(outDir, { recursive: true });

    const topK = ranked.slice(0, args.top);
    for (const r of topK) {
      const ext = r.meme.output.meme!.localPath.endsWith('.png') ? '.png' : '.jpg';
      const destPath = join(outDir, `rank${String(r.rank)}-${r.meme.strategy.id}-${String(r.score.composite)}${ext}`);
      await copyFile(r.meme.output.meme!.localPath, destPath);
    }

    logger.info({ outDir, saved: topK.length }, 'Top memes saved');

    // ── 11. Send top-K to Telegram ──────────────────────────────────────

    const telegramPhotos = topK.map((r) => ({
      localPath: r.meme.output.meme!.localPath,
      rank: r.rank,
      strategy: r.meme.strategy.id,
      template: r.meme.output.meme!.templateName,
      boxes: r.meme.output.meme!.boxes,
      composite: r.score.composite,
    }));

    const tgResult = await sendToTelegram(
      telegramPhotos, tweet.authorUsername, tweet.text,
      generated.length, scores.length, logger,
    );
    if (tgResult.sent > 0) {
      logger.info({ sent: tgResult.sent }, 'Memes sent to Telegram');
    }

    // ── 12. Print results ───────────────────────────────────────────────

    console.log('\n' + '═'.repeat(80));
    console.log(`  MEME FARM RESULTS — @${tweet.authorUsername}`);
    console.log(`  Tweet: "${tweet.text.slice(0, 100)}${tweet.text.length > 100 ? '...' : ''}"`);
    console.log(`  Generated: ${String(generated.length)} | Failed: ${String(genResult.failed)} | Degraded: ${String(genResult.degraded)} | Evaluated: ${String(scores.length)} | Top-${String(args.top)} saved`);
    console.log('═'.repeat(80));

    for (const r of ranked) {
      const isTop = r.rank <= args.top;
      const prefix = isTop ? '★' : ' ';
      const meme = r.meme.output.meme!;
      console.log(`\n${prefix} #${String(r.rank)} | Composite: ${String(r.score.composite)} | Strategy: ${r.meme.strategy.id}`);
      console.log(`  Template: ${meme.templateName}`);
      console.log(`  Boxes: ${meme.boxes.map((b) => `"${b}"`).join(' | ')}`);
      console.log(`  Scores: punch=${String(r.score.punch)} spec=${String(r.score.specificity)} clarity=${String(r.score.clarity)} fit=${String(r.score.templateFit)}`);
      console.log(`  Reasoning: ${r.score.reasoning}`);
      if (isTop) {
        const ext = meme.localPath.endsWith('.png') ? '.png' : '.jpg';
        console.log(`  Saved: rank${String(r.rank)}-${r.meme.strategy.id}-${String(r.score.composite)}${ext}`);
      }
    }

    console.log(`\nOutput: ${outDir}`);
    console.log('═'.repeat(80) + '\n');
  } finally {
    // ── Cleanup ALL tmp files (always runs, even on error) ──────────────

    for (const g of generated) {
      if (g.output.meme?.localPath) {
        try {
          await unlink(g.output.meme.localPath);
        } catch { /* already deleted or never existed */ }
      }
    }

    db.close();
  }
}

main().catch((err) => {
  console.error('Meme farm failed:', getErrorMessage(err));
  process.exit(1);
});
