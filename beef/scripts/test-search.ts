/**
 * Quick test: debug search/adaptive.json response headers + body.
 */
import 'dotenv/config';
import { Scraper } from '@the-convocation/twitter-scraper';
import { CookieStore } from '../src/twitter/cookie-store.js';
import pino from 'pino';

const logger = pino({ level: 'debug', transport: { target: 'pino-pretty' } });
const cookieStore = new CookieStore(logger);
const scraper = new Scraper();

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';

async function run() {
  const saved = cookieStore.load();
  if (!saved) throw new Error('No cookies');
  await scraper.setCookies(saved);
  console.log('Logged in:', await scraper.isLoggedIn());

  const cookies = await scraper.getCookies();
  const ct0 = (cookies.find((c: { key: string }) => c.key === 'ct0') as { value: string } | undefined)?.value ?? '';
  const cookieStr = cookies.map((c: { key: string; value: string }) => `${c.key}=${c.value}`).join('; ');

  const bearer = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
  const botUsername = process.env.TWITTER_USERNAME!;

  const headers: Record<string, string> = {
    authorization: `Bearer ${bearer}`,
    cookie: cookieStr,
    'x-csrf-token': ct0,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'en',
    'user-agent': CHROME_UA,
    accept: '*/*',
    referer: `https://x.com/search?q=%40${botUsername}`,
  };

  // Test 1: adaptive.json
  console.log('\n=== Test 1: search/adaptive.json ===');
  const params1 = new URLSearchParams({
    q: `@${botUsername}`,
    result_filter: 'Latest',
    tweet_search_mode: 'live',
    query_source: 'typed_query',
    count: '20',
    tweet_mode: 'extended',
    include_entities: 'true',
  });
  const r1 = await fetch(`https://x.com/i/api/2/search/adaptive.json?${params1}`, { headers });
  console.log('Status:', r1.status);
  console.log('Headers:', Object.fromEntries(r1.headers.entries()));
  const body1 = await r1.text();
  console.log('Body length:', body1.length);
  if (body1.length > 0) console.log('Body preview:', body1.slice(0, 500));

  // Test 2: 1.1/search/tweets.json
  console.log('\n=== Test 2: 1.1/search/tweets.json ===');
  const params2 = new URLSearchParams({
    q: `@${botUsername}`,
    result_type: 'recent',
    count: '20',
    tweet_mode: 'extended',
  });
  const r2 = await fetch(`https://api.x.com/1.1/search/tweets.json?${params2}`, { headers });
  console.log('Status:', r2.status);
  const body2 = await r2.text();
  console.log('Body length:', body2.length);
  if (body2.length > 0) console.log('Body preview:', body2.slice(0, 500));

  // Test 3: just try getTweets on EuphoriaAI_ and filter
  console.log('\n=== Test 3: getTweets("EuphoriaAI_") filtered ===');
  let count = 0;
  for await (const tweet of scraper.getTweets('EuphoriaAI_', 20)) {
    if (tweet.text?.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) {
      console.log(`  MATCH [${tweet.id}] @${tweet.username}: "${tweet.text?.slice(0, 120)}"`);
      console.log(`    inReplyTo: ${tweet.inReplyToStatusId ?? 'none'}`);
    }
    count++;
  }
  console.log(`  Scanned ${count} tweets`);
}

run().catch(console.error);
