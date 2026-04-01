#!/usr/bin/env npx tsx
/**
 * Batch profile fetcher for candidate monitoring accounts.
 * Fetches profile data + recent tweets for analysis.
 * Usage: npx tsx scripts/profile-accounts.ts
 */
import { config } from 'dotenv';
import { TwitterApi } from 'twitter-api-v2';

config();

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
}).readOnly.v2;

const HANDLES = [
  'biggybaps', 'BigEbelieves', '0xSThompson', 'basement5k', 'rustydotwtf',
  'RyyaNFT', 'leanpockets', 'ApeDreaming', 'betrmint', 'drewcoffman',
  'netnose', 'toady_hawk', 'kennyistyping', 'Only1Gkash', 'BaseICCM',
  '0xAefre', 'BasedBraden', 'bankrbeach', 'listen2mm', 'DickbuttCTO',
  'shazam_meta', 'delislejr1989', 'TonyAtTheBing', 'smolemaru', 'wfacts_x',
  'darkohh', '_proxystudio', 'Mikolaj664108', 'CartesseCl65729', 'Rizkybegitu',
  'pixahead', 'superminter', '696_eth', 'geaux_eth', 'sartocrates',
  'CryptoStatuette', 'lightsnack89', 'goyabean_eth', 'cav4lier', 'apex_ether',
  'Drei3180', 'ExaminerMo', 'iamheci', 'BasedOnMike', 'pratyushrungta',
  '0xalixbtno',
];

interface ProfileData {
  username: string;
  name: string;
  bio: string | null;
  followers: number;
  following: number;
  tweetCount: number;
  verified: boolean;
  recentTweets: string[];
}

async function fetchProfiles(): Promise<ProfileData[]> {
  // Batch lookup — up to 100 usernames per call
  const response = await client.usersByUsernames(HANDLES, {
    'user.fields': ['description', 'public_metrics', 'verified', 'created_at'],
  });

  const profiles: ProfileData[] = [];
  const foundIds: { id: string; username: string }[] = [];

  for (const user of response.data ?? []) {
    const pm = user.public_metrics;
    profiles.push({
      username: user.username,
      name: user.name,
      bio: user.description ?? null,
      followers: pm?.followers_count ?? 0,
      following: pm?.following_count ?? 0,
      tweetCount: pm?.tweet_count ?? 0,
      verified: user.verified ?? false,
      recentTweets: [],
    });
    foundIds.push({ id: user.id, username: user.username });
  }

  // Report missing handles
  const foundUsernames = new Set(profiles.map((p) => p.username.toLowerCase()));
  const missing = HANDLES.filter((h) => !foundUsernames.has(h.toLowerCase()));
  if (missing.length > 0) {
    console.error(`\n⚠ Missing/suspended accounts (${missing.length}): ${missing.join(', ')}\n`);
  }

  // Fetch recent tweets for top candidates (>200 followers)
  const candidates = foundIds.filter((u) => {
    const p = profiles.find((pr) => pr.username.toLowerCase() === u.username.toLowerCase());
    return p && p.followers >= 200;
  });

  console.log(`Fetching timelines for ${candidates.length} accounts with >200 followers...`);

  for (const { id, username } of candidates) {
    try {
      const timeline = await client.userTimeline(id, {
        max_results: 5,
        exclude: ['replies', 'retweets'],
        'tweet.fields': ['text', 'created_at', 'public_metrics'],
      });

      const tweets: string[] = [];
      for (const tweet of timeline.data?.data ?? []) {
        const m = tweet.public_metrics;
        const engagement = m ? `[${m.like_count}L ${m.retweet_count}RT ${m.reply_count}R]` : '';
        tweets.push(`${engagement} ${tweet.text.slice(0, 200)}`);
      }

      const profile = profiles.find((p) => p.username.toLowerCase() === username.toLowerCase());
      if (profile) profile.recentTweets = tweets;

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`  Failed timeline for @${username}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return profiles;
}

async function main() {
  console.log(`Profiling ${HANDLES.length} accounts...\n`);

  const profiles = await fetchProfiles();

  // Sort by followers descending
  profiles.sort((a, b) => b.followers - a.followers);

  // Output as structured JSON for analysis
  console.log('\n=== PROFILE DATA ===\n');
  console.log(JSON.stringify(profiles, null, 2));

  // Summary table
  console.log('\n=== SUMMARY ===\n');
  console.log('Handle'.padEnd(22) + 'Followers'.padEnd(12) + 'Tweets'.padEnd(10) + 'Bio (50 chars)');
  console.log('-'.repeat(80));
  for (const p of profiles) {
    const bioSnippet = (p.bio ?? 'N/A').slice(0, 50).replace(/\n/g, ' ');
    console.log(
      `@${p.username}`.padEnd(22) +
      p.followers.toLocaleString().padEnd(12) +
      p.tweetCount.toLocaleString().padEnd(10) +
      bioSnippet,
    );
  }

  // Tier recommendations
  console.log('\n=== TIER SUGGESTIONS ===\n');
  const tiers = {
    skip: profiles.filter((p) => p.followers < 500),
    C: profiles.filter((p) => p.followers >= 500 && p.followers < 5000),
    B: profiles.filter((p) => p.followers >= 5000 && p.followers < 50000),
    A: profiles.filter((p) => p.followers >= 50000),
  };

  console.log(`A-tier (50K+): ${tiers.A.map((p) => `@${p.username} (${(p.followers / 1000).toFixed(1)}K)`).join(', ') || 'none'}`);
  console.log(`B-tier (5K-50K): ${tiers.B.map((p) => `@${p.username} (${(p.followers / 1000).toFixed(1)}K)`).join(', ') || 'none'}`);
  console.log(`C-tier (500-5K): ${tiers.C.map((p) => `@${p.username} (${(p.followers / 1000).toFixed(1)}K)`).join(', ') || 'none'}`);
  console.log(`Skip (<500): ${tiers.skip.map((p) => `@${p.username} (${p.followers})`).join(', ') || 'none'}`);
}

main().catch(console.error);
