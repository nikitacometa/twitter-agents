/**
 * Find @BeefThis82091 mentions via parent tweets.
 * Strategy: fetch @nickvrnn tweets (pinned one has the reply), then check replies.
 */
import 'dotenv/config';
import { Scraper } from '@the-convocation/twitter-scraper';
import { CookieStore } from '../src/twitter/cookie-store.js';
import pino from 'pino';

const logger = pino({ level: 'info', transport: { target: 'pino-pretty' } });
const store = new CookieStore(logger);
const scraper = new Scraper();

async function run() {
  const saved = store.load();
  if (!saved) throw new Error('No cookies');
  await scraper.setCookies(saved);

  // Strategy 1: Get @nickvrnn tweets — find the "HOLIDAY BLUES" pinned tweet
  console.log('=== @nickvrnn tweets ===');
  for await (const t of scraper.getTweets('nickvrnn', 5)) {
    console.log(`  [${t.id}] "${(t.text ?? '').slice(0, 80)}" replies=${t.replies ?? '?'}`);
    if (t.text?.includes('HOLIDAY BLUES')) {
      console.log(`  ^^^ PINNED TWEET FOUND: ${t.id}`);
    }
  }

  // Strategy 2: Get EuphoriaAI_ recent tweets (Posts tab only)
  console.log('\n=== @EuphoriaAI_ Posts ===');
  for await (const t of scraper.getTweets('EuphoriaAI_', 10)) {
    console.log(`  [${t.id}] "${(t.text ?? '').slice(0, 120)}" inReplyTo=${t.inReplyToStatusId ?? 'none'}`);
  }

  // Strategy 3: Try getLatestTweet for EuphoriaAI_
  console.log('\n=== @EuphoriaAI_ latest tweet ===');
  const latest = await scraper.getLatestTweet('EuphoriaAI_');
  if (latest) {
    console.log(`  [${latest.id}] "${(latest.text ?? '').slice(0, 120)}" inReplyTo=${latest.inReplyToStatusId ?? 'none'}`);
  } else {
    console.log('  null');
  }
}

run().catch(console.error);
