#!/usr/bin/env npx tsx
/**
 * Bot component simulation CLI.
 * Tests REAL bot components without running the full scheduler.
 *
 * Commands:
 *   mentions                         — Poll mentions via real TwitterClient
 *   roast <target>                   — Generate roast via real RoastEngine
 *   filter <text>                    — Test ContentFilter on text
 *   post <text>                      — Post a standalone tweet
 *   reply <tweetId> <text>           — Reply to a tweet
 *   classify <text>                  — Test mention classification
 *
 * Usage:
 *   npx tsx scripts/simulate.ts mentions
 *   npx tsx scripts/simulate.ts roast "Solana"
 *   npx tsx scripts/simulate.ts filter "your tvl dropped 94% ser"
 *   npx tsx scripts/simulate.ts reply 1234567890 "roast text here"
 *   npx tsx scripts/simulate.ts classify "@BeefThis roast @SomeProject"
 */

import 'dotenv/config';
import pino from 'pino';
import { validateEnv } from '../src/common/config/env.validation.js';
import { createDatabase } from '../src/storage/database.js';
import { filterRoast } from '../src/content/content-filter.js';

const prettyLogger = pino({ level: 'info', transport: { target: 'pino-pretty' } });

// --- Lazy initializers (only create what each command needs) ---

let _config: ReturnType<typeof validateEnv> | null = null;
function getConfig() {
  if (!_config) _config = validateEnv();
  return _config;
}

let _db: ReturnType<typeof createDatabase> | null = null;
function getDb() {
  if (!_db) _db = createDatabase(getConfig().DB_PATH, prettyLogger);
  return _db;
}

async function getTwitterClient() {
  const config = getConfig();
  const { ScraperTwitterClient } = await import('../src/twitter/scraper-twitter-client.js');
  const { TwitterClient } = await import('../src/twitter/twitter-client.js');

  if (config.TWITTER_CLIENT_MODE === 'scraper' && config.TWITTER_USERNAME && config.TWITTER_PASSWORD) {
    const client = new ScraperTwitterClient({
      credentials: {
        username: config.TWITTER_USERNAME,
        password: config.TWITTER_PASSWORD,
        phone: config.TWITTER_PHONE,
        twoFactorSecret: config.TWITTER_2FA_SECRET,
      },
      dryRun: config.DRY_RUN,
      logger: prettyLogger,
    });
    await client.initialize();
    return client;
  }

  const creds =
    config.TWITTER_API_KEY && config.TWITTER_API_SECRET && config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_SECRET
      ? {
          apiKey: config.TWITTER_API_KEY,
          apiSecret: config.TWITTER_API_SECRET,
          accessToken: config.TWITTER_ACCESS_TOKEN,
          accessSecret: config.TWITTER_ACCESS_SECRET,
        }
      : undefined;

  return new TwitterClient({ credentials: creds, dryRun: config.DRY_RUN, logger: prettyLogger });
}

async function getProvider() {
  const config = getConfig();
  const { ClaudeCodeProvider } = await import('../src/agent/claude-code.provider.js');
  const { createAnthropicSDKProvider } = await import('../src/agent/anthropic-sdk.provider.js');
  const { ProviderManager } = await import('../src/agent/provider-manager.js');
  const { LlmLogRepository } = await import('../src/storage/repositories/llm-log.repository.js');

  const db = getDb();
  const llmLogRepo = new LlmLogRepository(db);
  const primary = new ClaudeCodeProvider(prettyLogger, llmLogRepo);
  const fallback = createAnthropicSDKProvider(config.ANTHROPIC_API_KEY, prettyLogger, llmLogRepo);
  const alerter = { send: (msg: string) => Promise.resolve(prettyLogger.warn({ alert: msg }, 'Provider alert')) };
  return new ProviderManager(primary, fallback, alerter, prettyLogger);
}

// ─────────────────────────── Commands ───────────────────────────

async function cmdMentions() {
  const twitter = await getTwitterClient();
  const { ConfigRepository } = await import('../src/storage/repositories/config.repository.js');
  const db = getDb();
  const configRepo = new ConfigRepository(db);
  const sinceId = configRepo.getRuntime().mentionSinceId ?? undefined;

  prettyLogger.info({ sinceId }, 'Fetching mentions via real TwitterClient...');
  const mentions = await twitter.getMentions(sinceId);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MENTIONS: ${mentions.length} found (since: ${sinceId ?? 'beginning'})`);
  console.log(`${'═'.repeat(60)}\n`);

  for (const m of mentions) {
    console.log(`  Tweet ID: ${m.tweetId}`);
    console.log(`  Author:   @${m.authorName} (${m.authorId})`);
    console.log(`  Text:     ${m.text}`);
    if (m.inReplyToTweetId) {
      console.log(`  Reply To: ${m.inReplyToTweetId}`);
      if (m.parentTweetText) console.log(`  Parent:   "${m.parentTweetText.slice(0, 120)}"`);
      if (m.parentAuthorName) console.log(`  Parent @: ${m.parentAuthorName}`);
      if (m.parentMediaUrls) console.log(`  Media:    ${m.parentMediaUrls.join(', ')}`);
    }
    // Classify using the same logic as MentionHandler
    const { classifyMention } = await import('../src/twitter/mention-handler.js');
    console.log(`  Type:     ${classifyMention(m.text)}`);
    console.log(`  ${'─'.repeat(56)}`);
  }

  if (twitter.shutdown) await twitter.shutdown();
  return mentions;
}

async function cmdRoast(target: string) {
  const provider = await getProvider();
  const { FeedbackRepository } = await import('../src/storage/repositories/feedback.repository.js');
  const { ExternalExampleRepository } = await import('../src/storage/repositories/external-example.repository.js');
  const { RoastPatternRepository } = await import('../src/storage/repositories/roast-pattern.repository.js');
  const { ConfigRepository } = await import('../src/storage/repositories/config.repository.js');
  const { generateRoasts } = await import('../src/admin/roast-generator.js');

  const db = getDb();
  const feedbackRepo = new FeedbackRepository(db);
  const exampleRepo = new ExternalExampleRepository(db);
  const patternRepo = new RoastPatternRepository(db);
  const configRepo = new ConfigRepository(db);

  prettyLogger.info({ target }, 'Generating roast via real RoastEngine (3×3 multi-strategy)...');
  const start = Date.now();

  const output = await generateRoasts(
    target, provider, prettyLogger,
    feedbackRepo, undefined, undefined,
    configRepo, exampleRepo, patternRepo,
  );

  const elapsed = Date.now() - start;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ROAST for "${target}" — ${output.variants.length} variants in ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`  Fact check: ${output.factCheckPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`${'═'.repeat(60)}\n`);

  for (let i = 0; i < output.variants.length; i++) {
    const v = output.variants[i]!;
    const badge = i === output.bestIndex ? ' ★ BEST' : '';
    console.log(`  [${i + 1}] Score: ${v.score}/5 | Angle: ${v.angle}${badge}`);
    console.log(`      "${v.text}"`);
    console.log(`      Chars: ${v.text.length}/280 | Filter: ${filterRoast(v.text).passed ? 'PASS' : 'FAIL — ' + filterRoast(v.text).reasons.join(', ')}`);
    console.log('');
  }

  if (output.researchNotes) {
    console.log(`  Research notes (first 300 chars):`);
    console.log(`  ${output.researchNotes.slice(0, 300)}`);
    console.log('');
  }

  // Output best variant for easy copy-paste
  const best = output.variants[output.bestIndex] ?? output.variants[0]!;
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Ready to post (${best.text.length} chars):`);
  console.log(`  ${best.text}`);
  console.log(`${'─'.repeat(60)}\n`);

  await provider.waitForIdle(30_000);
  provider.shutdown();

  return output;
}

async function cmdFilter(text: string) {
  const result = filterRoast(text);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  CONTENT FILTER`);
  console.log(`${'═'.repeat(60)}\n`);
  console.log(`  Text:    "${text}"`);
  console.log(`  Chars:   ${text.length}/280`);
  console.log(`  Result:  ${result.passed ? 'PASS ✓' : 'FAIL ✗'}`);
  if (!result.passed) {
    console.log(`  Reasons: ${result.reasons.join(', ')}`);
  }
  console.log('');

  return result;
}

async function cmdPost(text: string) {
  const twitter = await getTwitterClient();

  prettyLogger.info({ text, charCount: text.length }, 'Posting tweet via real TwitterClient...');
  const result = await twitter.postTweet(text);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  POST RESULT`);
  console.log(`${'═'.repeat(60)}\n`);
  if (result) {
    console.log(`  Tweet ID: ${result.tweetId}`);
    console.log(`  URL:      https://twitter.com/i/status/${result.tweetId}`);
  } else {
    console.log(`  FAILED — postTweet returned null`);
  }
  console.log('');

  if (twitter.shutdown) await twitter.shutdown();
  return result;
}

async function cmdReply(tweetId: string, text: string) {
  const twitter = await getTwitterClient();

  prettyLogger.info({ tweetId, text, charCount: text.length }, 'Replying via real TwitterClient...');
  const result = await twitter.replyToTweet(text, tweetId);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  REPLY RESULT`);
  console.log(`${'═'.repeat(60)}\n`);
  if (result) {
    console.log(`  Reply ID:   ${result.tweetId}`);
    console.log(`  In reply to: ${tweetId}`);
    console.log(`  URL:         https://twitter.com/i/status/${result.tweetId}`);
  } else {
    console.log(`  FAILED — replyToTweet returned null`);
  }
  console.log('');

  if (twitter.shutdown) await twitter.shutdown();
  return result;
}

async function cmdClassify(text: string) {
  const { classifyMention } = await import('../src/twitter/mention-handler.js');

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MENTION CLASSIFICATION`);
  console.log(`${'═'.repeat(60)}\n`);
  console.log(`  Text: "${text}"`);
  console.log(`  Type: ${classifyMention(text)}`);
  console.log('');
}

// ─────────────────────────── Main ───────────────────────────

const [action, ...args] = process.argv.slice(2);

try {
  switch (action) {
    case 'mentions':
      await cmdMentions();
      break;

    case 'roast':
      if (!args[0]) { console.error('Usage: simulate roast <target>'); process.exit(1); }
      await cmdRoast(args.join(' '));
      break;

    case 'filter':
      if (!args[0]) { console.error('Usage: simulate filter <text>'); process.exit(1); }
      await cmdFilter(args.join(' '));
      break;

    case 'post':
      if (!args[0]) { console.error('Usage: simulate post <text>'); process.exit(1); }
      await cmdPost(args.join(' '));
      break;

    case 'reply':
      if (!args[0] || !args[1]) { console.error('Usage: simulate reply <tweetId> <text>'); process.exit(1); }
      await cmdReply(args[0], args.slice(1).join(' '));
      break;

    case 'classify':
      if (!args[0]) { console.error('Usage: simulate classify <text>'); process.exit(1); }
      await cmdClassify(args.join(' '));
      break;

    default:
      console.log(`
$BEEF Bot Simulation CLI

Commands:
  mentions                    Poll mentions via real TwitterClient
  roast <target>              Generate roast via real RoastEngine (3×3 strategy)
  filter <text>               Test ContentFilter
  post <text>                 Post a tweet (respects DRY_RUN)
  reply <tweetId> <text>      Reply to a tweet (respects DRY_RUN)
  classify <text>             Test mention classification

Examples:
  npx tsx scripts/simulate.ts mentions
  npx tsx scripts/simulate.ts roast "Solana"
  npx tsx scripts/simulate.ts roast 'tweet by @user: "their hot take here"'
  npx tsx scripts/simulate.ts filter "your tvl dropped 94% ser"
  npx tsx scripts/simulate.ts reply 1234567890 "roast text"
`);
  }
} catch (error) {
  prettyLogger.error({ err: error }, 'Simulation failed');
  process.exit(1);
} finally {
  _db?.close();
}
