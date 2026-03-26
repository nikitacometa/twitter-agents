import type { MonitorCategory, MonitorTarget, MonitorTier } from './monitor-targets.js';
import { TIER_SCORES } from './monitor-targets.js';

export interface ScoredTweet {
  tweetId: string;
  authorHandle: string;
  tier: MonitorTier;
  category: MonitorCategory;
  followersK: number;
  text: string;
  createdAt: string;
  score: number;
  ageMinutes: number;
  tweetUrl: string;
}

export const SCORE_THRESHOLD = 10;

const TOPIC_KEYWORDS = new Set([
  'defi', 'airdrop', 'hack', 'exploit', 'launch', 'base', 'rugpull', 'rug',
  'pump', 'dump', 'rekt', 'token', 'nft', 'bridge', 'chain', 'l2', 'layer',
  'eth', 'btc', 'sol', 'degen', 'memecoin', 'governance', 'dao', 'yield',
  'tvl', 'liquidity', 'staking', 'farm', 'vault', 'protocol', 'swap',
  'bullish', 'bearish', 'scam', 'fraud', 'sec', 'regulation', 'whale',
  'listing', 'binance', 'coinbase', 'kraken', 'uniswap', 'breaking',
]);

const OPINION_MARKERS = [
  'i think', 'imo', 'unpopular opinion', 'hot take', 'prediction',
  'calling it', 'controversial', 'overrated', 'underrated', 'bullish on',
  'bearish on', 'this is', 'nobody talks about', 'hear me out',
];

export function scoreTweet(
  tweetId: string,
  text: string,
  authorHandle: string,
  createdAt: string,
  target: MonitorTarget,
  now?: Date,
): ScoredTweet | null {
  // Auto-skip: RTs and very short tweets
  if (text.startsWith('RT @')) return null;
  if (text.length < 30) return null;

  const currentTime = now ?? new Date();
  const tweetTime = new Date(createdAt);
  const ageMinutes = Math.max(0, (currentTime.getTime() - tweetTime.getTime()) / 60_000);

  let score = 0;

  // 1. Author tier
  score += TIER_SCORES[target.tier];

  // 2. Topic relevance (+5 if any keyword matches)
  const lower = text.toLowerCase();
  let topicMatch = false;
  for (const keyword of TOPIC_KEYWORDS) {
    if (lower.includes(keyword)) {
      topicMatch = true;
      break;
    }
  }
  if (topicMatch) score += 5;

  // 3. Freshness
  if (ageMinutes < 5) {
    score += 5;
  } else if (ageMinutes < 10) {
    score += 3;
  } else {
    score += 1;
  }

  // 4. Length (>100 chars = more substance)
  if (text.length > 100) score += 2;

  // 5. Opinion / question
  const hasQuestion = text.includes('?');
  const hasOpinion = OPINION_MARKERS.some((marker) => lower.includes(marker));
  if (hasQuestion || hasOpinion) score += 2;

  return {
    tweetId,
    authorHandle,
    tier: target.tier,
    category: target.category,
    followersK: target.followersK,
    text,
    createdAt,
    score,
    ageMinutes: Math.round(ageMinutes),
    tweetUrl: `https://x.com/${authorHandle}/status/${tweetId}`,
  };
}
