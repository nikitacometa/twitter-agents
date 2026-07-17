/**
 * E2E test: fetch @0xBeefer profile + tweets, simulate mention processing.
 * Run: npx tsx scripts/test-e2e.ts
 */
import 'dotenv/config';
import pino from 'pino';
import { ScraperTwitterClient } from '../src/twitter/scraper-twitter-client.js';
import { classifyMention, extractTaggedHandle, extractTarget, isBareOrSimpleMention } from '../src/twitter/mention-handler.js';

const logger = pino({ level: 'info', transport: { target: 'pino-pretty' } });

const username = process.env.TWITTER_USERNAME!;
const password = process.env.TWITTER_PASSWORD!;
const phone = process.env.TWITTER_PHONE;
const twoFactorSecret = process.env.TWITTER_2FA_SECRET;

const client = new ScraperTwitterClient({
  credentials: { username, password, phone, twoFactorSecret },
  dryRun: true,
  logger,
});

async function run() {
  await client.initialize();
  console.log(`✓ Logged in as @${username}\n`);

  // --- Step 1: Fetch @0xBeefer profile via getProfile (tests M2 IProfileFetcher) ---
  console.log('=== Step 1: getProfile("0xBeefer") ===');
  const profile = await client.getProfile('0xBeefer');
  if (profile) {
    console.log(`  Username:  @${profile.username}`);
    console.log(`  Bio:       ${profile.biography ?? '(none)'}`);
    console.log(`  Followers: ${profile.followersCount}`);
    console.log(`  Verified:  ${profile.isVerified}`);
    console.log(`  Website:   ${profile.website ?? '(none)'}`);
    console.log(`  Recent tweets (${profile.recentTweets.length}):`);
    for (const t of profile.recentTweets) {
      console.log(`    - ${t.slice(0, 120)}`);
    }
  } else {
    console.log('  ✗ getProfile returned null');
  }

  // --- Step 2: Get latest tweets from @0xBeefer directly ---
  console.log('\n=== Step 2: Recent tweets from @0xBeefer ===');
  const { Scraper } = await import('@the-convocation/twitter-scraper');
  const scraper = new Scraper();
  const cookies = await (client as any).scraper.getCookies();
  await scraper.setCookies(cookies.map((c: any) => String(c)));

  const tweets: { id: string; text: string; username: string }[] = [];
  try {
    for await (const tweet of scraper.getTweets('0xBeefer', 5)) {
      if (tweet.id && tweet.text) {
        tweets.push({ id: tweet.id, text: tweet.text, username: tweet.username ?? '0xBeefer' });
        console.log(`  [${tweet.id}] "${tweet.text.slice(0, 120)}"`);
      }
    }
  } catch (err) {
    console.log(`  Error fetching tweets: ${err}`);
  }

  // --- Step 3: Simulate mention classification on each tweet ---
  if (tweets.length > 0) {
    console.log('\n=== Step 3: Classify as if these were @BeefThis mentions ===');
    for (const t of tweets) {
      const textWithMention = `@BeefThis ${t.text}`;
      const type = classifyMention(textWithMention);
      const tagged = extractTaggedHandle(textWithMention, 'BeefThis');
      const target = extractTarget(textWithMention);
      const bare = isBareOrSimpleMention(textWithMention);

      console.log(`\n  Tweet ${t.id}:`);
      console.log(`    Text: "${textWithMention.slice(0, 100)}..."`);
      console.log(`    classify → ${type}`);
      console.log(`    extractTarget → ${target ?? 'null'}`);
      console.log(`    extractTaggedHandle → ${tagged ?? 'null'}`);
      console.log(`    isBareOrSimple → ${bare}`);

      // Determine which scenario would fire
      if (type === 'roast_request' && target) {
        console.log(`    → SCENARIO 1: explicit roast of "${target}"`);
      } else if (tagged) {
        console.log(`    → SCENARIO 3: roast tagged @${tagged}`);
      } else if (bare) {
        console.log(`    → SCENARIO 2: bare mention (would roast parent tweet)`);
      } else {
        console.log(`    → NOT QUEUED: generic reply`);
      }
    }

    // --- Step 4: Pick first tweet and simulate a reply ---
    const picked = tweets[0]!;
    console.log(`\n=== Step 4: Simulate reply to tweet ${picked.id} ===`);
    console.log(`  Tweet by @${picked.username}: "${picked.text.slice(0, 100)}"`);
    console.log(`  Would enqueue: targetName="tweet by @${picked.username}: \\"${picked.text.slice(0, 120)}\\""`);
    console.log(`  Context: "reply_to:<mentionId>|by:@requester|parent:${picked.id}"`);
    console.log(`  → QueueManager would call getProfile("${picked.username}") for enrichment`);
  }

  await client.shutdown();
  console.log('\n=== Done ===');
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
