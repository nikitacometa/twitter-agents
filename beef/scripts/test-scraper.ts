/**
 * Integration test for ScraperTwitterClient (read-only mode).
 *
 * Tests login, search for mentions, and tweet metrics.
 * Run: npx tsx scripts/test-scraper.ts
 */

import 'dotenv/config';
import pino from 'pino';
import { ScraperTwitterClient } from '../src/twitter/scraper-twitter-client.js';

const logger = pino({ level: 'debug', transport: { target: 'pino-pretty' } });

const username = process.env.TWITTER_USERNAME;
const password = process.env.TWITTER_PASSWORD;
const phone = process.env.TWITTER_PHONE;

if (!username || !password) {
  logger.fatal('TWITTER_USERNAME and TWITTER_PASSWORD must be set in .env');
  process.exit(1);
}

const client = new ScraperTwitterClient({
  credentials: { username, password, phone },
  dryRun: true,
  logger,
});

async function run() {
  // --- Test 1: Login ---
  console.log('\n=== Test 1: Login ===');
  try {
    await client.initialize();
    console.log(`  ✓ Logged in as @${username}`);
    console.log(`  isConfigured: ${client.isConfigured}`);
  } catch (error) {
    console.error('  ✗ Login failed:', error);
    process.exit(1);
  }

  // --- Test 2: Search for mentions ---
  console.log('\n=== Test 2: Search mentions (@' + username + ') ===');
  try {
    const mentions = await client.getMentions();
    console.log(`  ✓ Found ${mentions.length} mentions`);
    for (const m of mentions.slice(0, 5)) {
      console.log(`    @${m.authorName}: "${m.text.slice(0, 100)}..." (id: ${m.tweetId})`);
    }
  } catch (error) {
    console.error('  ✗ getMentions failed:', error);
  }

  // --- Test 3: Search for a popular crypto account (verify search works) ---
  console.log('\n=== Test 3: Search for crypto tweets ===');
  try {
    // Use getMentions-like flow but for a known active account
    const { Scraper, SearchMode } = await import('@the-convocation/twitter-scraper');
    const scraper = new Scraper();
    // Re-use cookies from our client
    const cookies = await (client as any).scraper.getCookies();
    await scraper.setCookies(cookies.map((c: any) => String(c)));

    let count = 0;
    for await (const tweet of scraper.searchTweets('crypto', 5, SearchMode.Latest)) {
      console.log(`    [${tweet.id}] @${tweet.username}: "${(tweet.text ?? '').slice(0, 80)}..."`);
      count++;
    }
    console.log(`  ✓ Found ${count} tweets about crypto`);
  } catch (error) {
    console.error('  ✗ Search failed:', error);
  }

  // --- Test 4: Get tweet metrics for a known tweet ---
  console.log('\n=== Test 4: Get tweet metrics ===');
  try {
    // Elon's pinned tweet (likely exists)
    const testTweetId = '1585341984679469056';
    const metrics = await client.getTweetMetrics([testTweetId]);
    const m = metrics.get(testTweetId);
    if (m) {
      console.log(`  ✓ Metrics for ${testTweetId}: likes=${m.likes}, rt=${m.retweets}, replies=${m.replies}, views=${m.impressions}`);
    } else {
      console.log(`  ~ No metrics returned for ${testTweetId}`);
    }
  } catch (error) {
    console.error('  ✗ getTweetMetrics failed:', error);
  }

  // --- Test 5: Post tweet (dry run) ---
  console.log('\n=== Test 5: Post tweet (dry run) ===');
  try {
    const result = await client.postTweet(`[TEST] $BEEF scraper test — ${new Date().toISOString()}`);
    console.log(`  ✓ Dry run result: ${result?.tweetId}`);
  } catch (error) {
    console.error('  ✗ postTweet failed:', error);
  }

  console.log('\n=== All tests done ===');
  await client.shutdown();
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
