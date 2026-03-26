#!/usr/bin/env npx tsx
/**
 * Check which monitor targets we're following and which we're not.
 * Usage: npx tsx scripts/check-following.ts
 */
import { config } from 'dotenv';
import { TwitterApi } from 'twitter-api-v2';
import { MONITOR_TARGETS } from '../src/monitor/monitor-targets.js';

config();

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

async function main() {
  // Get our user ID
  const me = await client.v2.me();
  console.log(`Authenticated as: @${me.data.username} (${me.data.id})\n`);

  // Fetch full following list (paginated)
  const followingSet = new Set<string>();
  let paginationToken: string | undefined;

  do {
    const params: Record<string, string | number> = { max_results: 1000, 'user.fields': 'username' };
    if (paginationToken) params.pagination_token = paginationToken;

    const result = await client.v2.following(me.data.id, params);
    for (const user of result.data ?? []) {
      followingSet.add(user.username.toLowerCase());
    }
    paginationToken = result.meta?.next_token;
  } while (paginationToken);

  console.log(`Total following: ${followingSet.size}\n`);

  // Check targets
  const following: typeof MONITOR_TARGETS[number][] = [];
  const notFollowing: typeof MONITOR_TARGETS[number][] = [];

  for (const target of MONITOR_TARGETS) {
    if (followingSet.has(target.handle.toLowerCase())) {
      following.push(target);
    } else {
      notFollowing.push(target);
    }
  }

  console.log(`=== ALREADY FOLLOWING (${following.length}) ===`);
  for (const t of following) {
    console.log(`  ✅ @${t.handle} [${t.tier}] ${t.category}`);
  }

  console.log(`\n=== NOT FOLLOWING (${notFollowing.length}) ===`);
  for (const t of notFollowing) {
    console.log(`  ❌ @${t.handle} [${t.tier}] ${t.category}`);
  }
}

main().catch(console.error);
