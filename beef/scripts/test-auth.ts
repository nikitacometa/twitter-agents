/**
 * Quick auth test — verify cookies work for @BeefThis82091.
 */
import 'dotenv/config';
import pino from 'pino';
import { ScraperTwitterClient } from '../src/twitter/scraper-twitter-client.js';

const logger = pino({ level: 'debug', transport: { target: 'pino-pretty' } });

const client = new ScraperTwitterClient({
  credentials: {
    username: process.env.TWITTER_USERNAME!,
    password: process.env.TWITTER_PASSWORD!,
    phone: process.env.TWITTER_PHONE,
    twoFactorSecret: process.env.TWITTER_2FA_SECRET,
  },
  dryRun: true,
  logger,
});

async function run() {
  await client.initialize();
  console.log(`isConfigured: ${client.isConfigured}`);

  // Try getProfile on self to verify auth
  const profile = await client.getProfile('BeefThis82091');
  if (profile) {
    console.log(`\n✓ Authenticated! Profile: @${profile.username}`);
    console.log(`  Bio: ${profile.biography ?? '(none)'}`);
    console.log(`  Followers: ${profile.followersCount}`);
  } else {
    console.log('\n✗ getProfile returned null — cookies may be invalid');
  }

  // Try getMentions with debug logging
  console.log('\n=== Fetching mentions ===');
  const mentions = await client.getMentions();
  console.log(`Mentions found: ${mentions.length}`);
  for (const m of mentions) {
    console.log(`  [${m.tweetId}] @${m.authorName}: "${m.text.slice(0, 80)}"`);
  }

  await client.shutdown();
}

run().catch(console.error);
