/**
 * Find @BeefThis82091 mentions in @EuphoriaAI_'s tweets+replies
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
  console.log('Logged in:', await scraper.isLoggedIn());

  const bot = process.env.TWITTER_USERNAME!.toLowerCase();
  let count = 0;

  console.log(`\nSearching @EuphoriaAI_ tweets+replies for @${bot}...\n`);

  for await (const t of scraper.getTweetsAndReplies('EuphoriaAI_', 20)) {
    count++;
    const text = t.text ?? '';
    const match = text.toLowerCase().includes(`@${bot}`);
    console.log(`  [${count}] ${match ? 'MATCH' : '     '} id=${t.id} "${text.slice(0, 100)}" inReplyTo=${t.inReplyToStatusId ?? 'none'}`);
  }

  console.log(`\nScanned ${count} tweets+replies`);
}

run().catch(console.error);
