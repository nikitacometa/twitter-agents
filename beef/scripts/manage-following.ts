#!/usr/bin/env npx tsx
/**
 * Mass follow/unfollow accounts.
 * Usage: npx tsx scripts/manage-following.ts
 */
import { config } from 'dotenv';
import { TwitterApi } from 'twitter-api-v2';

config();

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

const UNFOLLOW = [
  'elonmusk', 'realDonaldTrump', 'saylor', 'cz_binance', 'binance',
  'justinsuntron', 'solana', 'ethereum', 'blknoiz06', 'CryptoKaleo',
  'DonAlt', 'CryptoTony__', 'coinbureau', 'cryptorover', 'CryptoWendyO',
  'punk6529', 'inversebrah', 'JamesWynnReal', 'whale_alert',
  'harmonysage369', 'BagginsBot', 'PoodleFi_', 'genius_sirenBSC',
  'Ethanh141', 'netprotocolapp', 'VitalikButerin', 'WatcherGuru',
];

const FOLLOW = [
  'MoonwellDeFi', 'zaboronbase', 'KaitoAI', 'elizaOS', 'OndoFinance',
  'faboronbase', 'BasedBrett', 'caboronbase', 'MorphoLabs', 'dwr',
  'Bankless', 'DefiantNews', 'shawmakesmagic', 'Spectral_Labs',
  'NousResearch', 'CoinbaseDev', 'clanker_world', 'ethermage',
  'GMX_IO', 'beefyfinance', 'pendle_fi', 'OriginProtocol', 'odosprotocol',
  'trylimitless', 'jacek0x', 'Toshi_base', 'SeamlessFi', 'AcrossProtocol',
  'PoolTogether', 'BaseSwap_fi', 'goldfinch_fi', 'tengyanAI',
  'HighCoinviction', 'BaseChain_News', '0xfluid', 'Vader_AI_',
  'ExtraFi_io', 'overnight_fi', 'AlienBaseDex',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveUserIds(usernames: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  // API allows 100 per request
  for (let i = 0; i < usernames.length; i += 100) {
    const batch = usernames.slice(i, i + 100);
    const result = await client.v2.usersByUsernames(batch);
    for (const user of result.data ?? []) {
      map.set(user.username.toLowerCase(), user.id);
    }
    if (i + 100 < usernames.length) await sleep(1000);
  }
  return map;
}

async function main() {
  const me = await client.v2.me();
  const myId = me.data.id;
  console.log(`Authenticated as: @${me.data.username} (${myId})\n`);

  // Resolve all usernames to IDs
  const allUsernames = [...new Set([...UNFOLLOW, ...FOLLOW])];
  console.log(`Resolving ${String(allUsernames.length)} usernames...`);
  const idMap = await resolveUserIds(allUsernames);
  console.log(`Resolved ${String(idMap.size)} IDs\n`);

  // --- UNFOLLOW ---
  console.log(`=== UNFOLLOWING ${String(UNFOLLOW.length)} accounts ===`);
  let unfollowed = 0;
  for (const handle of UNFOLLOW) {
    const userId = idMap.get(handle.toLowerCase());
    if (!userId) {
      console.log(`  ⚠️  @${handle} — not found, skipping`);
      continue;
    }
    try {
      await client.v2.unfollow(myId, userId);
      unfollowed++;
      console.log(`  ✅ @${handle} unfollowed`);
      await sleep(2000);
    } catch (error: unknown) {
      const err = error as { code?: number; rateLimit?: { reset?: number } };
      if (err.code === 429) {
        const resetAt = err.rateLimit?.reset;
        const waitSec = resetAt ? resetAt - Math.floor(Date.now() / 1000) + 5 : 180;
        console.log(`  ⏳ Rate limited, waiting ${String(waitSec)}s...`);
        await sleep(waitSec * 1000);
        // Retry once
        try {
          await client.v2.unfollow(myId, userId);
          unfollowed++;
          console.log(`  ✅ @${handle} unfollowed (retry)`);
        } catch { console.log(`  ❌ @${handle} — retry failed`); }
      } else {
        console.log(`  ❌ @${handle} — ${String(error)}`);
      }
    }
  }
  console.log(`\nUnfollowed: ${String(unfollowed)}/${String(UNFOLLOW.length)}\n`);

  // --- FOLLOW ---
  console.log(`=== FOLLOWING ${String(FOLLOW.length)} accounts ===`);
  let followed = 0;
  let rateLimited = false;
  for (const handle of FOLLOW) {
    const userId = idMap.get(handle.toLowerCase());
    if (!userId) {
      console.log(`  ⚠️  @${handle} — not found, skipping`);
      continue;
    }
    try {
      await client.v2.follow(myId, userId);
      followed++;
      console.log(`  ✅ @${handle} followed`);
      await sleep(4000); // slower for follows (stricter rate limit)
    } catch (error: unknown) {
      const err = error as { code?: number; rateLimit?: { reset?: number } };
      if (err.code === 429) {
        const resetAt = err.rateLimit?.reset;
        const waitSec = resetAt ? resetAt - Math.floor(Date.now() / 1000) + 5 : 900;
        console.log(`  ⏳ Rate limited at @${handle}. Waiting ${String(waitSec)}s...`);
        await sleep(waitSec * 1000);
        try {
          await client.v2.follow(myId, userId);
          followed++;
          console.log(`  ✅ @${handle} followed (retry)`);
          await sleep(4000);
        } catch {
          console.log(`  ❌ @${handle} — retry failed, stopping follows`);
          rateLimited = true;
          break;
        }
      } else {
        console.log(`  ❌ @${handle} — ${String(error)}`);
      }
    }
  }

  console.log(`\nFollowed: ${String(followed)}/${String(FOLLOW.length)}`);
  if (rateLimited) {
    const remaining = FOLLOW.slice(followed);
    console.log(`\n⚠️  Rate limited. Remaining to follow (${String(remaining.length)}):`);
    remaining.forEach((h) => console.log(`  - @${h}`));
    console.log('\nRe-run this script in 15 minutes to continue.');
  }

  console.log('\n=== DONE ===');
}

main().catch(console.error);
