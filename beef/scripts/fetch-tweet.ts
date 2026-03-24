#!/usr/bin/env npx tsx
/**
 * Quick tweet fetcher for local development/research.
 * Usage: npx tsx scripts/fetch-tweet.ts <tweet_url_or_id>
 *        npx tsx scripts/fetch-tweet.ts <tweet_url> --profile   # also fetch author profile
 *
 * Uses twitter-api-v2 (already in deps). Requires OAuth 1.0a creds in .env.
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

function parseTweetId(input: string): string {
  const match = input.match(/status\/(\d+)/);
  return match?.[1] ?? input;
}

async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  const wantProfile = args.includes('--profile');

  if (!input) {
    console.error('Usage: npx tsx scripts/fetch-tweet.ts <tweet_url_or_id> [--profile]');
    process.exit(1);
  }

  const tweetId = parseTweetId(input);
  console.log(`Fetching tweet ${tweetId}...\n`);

  const tweet = await client.singleTweet(tweetId, {
    'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'conversation_id', 'in_reply_to_user_id', 'referenced_tweets', 'entities'],
    expansions: ['author_id', 'referenced_tweets.id', 'attachments.media_keys'],
    'media.fields': ['url', 'preview_image_url', 'type'],
    'user.fields': ['name', 'username', 'description', 'public_metrics', 'verified'],
  });

  const author = tweet.includes?.users?.[0];
  const metrics = tweet.data.public_metrics;

  console.log('=== TWEET ===');
  console.log(`Author: @${author?.username ?? 'unknown'} (${author?.name ?? ''})`);
  console.log(`Text: ${tweet.data.text}`);
  console.log(`Date: ${tweet.data.created_at ?? 'N/A'}`);
  if (metrics) {
    console.log(`Metrics: ${metrics.like_count} likes, ${metrics.retweet_count} RTs, ${metrics.reply_count} replies, ${metrics.impression_count ?? '?'} views`);
  }
  if (tweet.includes?.media) {
    console.log(`Media: ${tweet.includes.media.map((m) => `${m.type}: ${m.url ?? m.preview_image_url ?? 'N/A'}`).join(', ')}`);
  }
  if (tweet.data.referenced_tweets) {
    console.log(`Referenced: ${tweet.data.referenced_tweets.map((r) => `${r.type}:${r.id}`).join(', ')}`);
  }

  if (wantProfile && author) {
    console.log('\n=== AUTHOR PROFILE ===');
    console.log(`Bio: ${author.description ?? 'N/A'}`);
    const pm = author.public_metrics;
    if (pm) {
      console.log(`Followers: ${pm.followers_count} | Following: ${pm.following_count} | Tweets: ${pm.tweet_count}`);
    }
  }

  console.log('\n=== RAW JSON ===');
  console.log(JSON.stringify(tweet, null, 2));
}

main().catch(console.error);
