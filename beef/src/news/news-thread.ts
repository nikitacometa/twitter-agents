/**
 * News thread: formatting, posting, scheduling helpers.
 *
 * Thread structure (6 tweets):
 *   1. Hook — "ROAST NEWS" header + best roast + $BASE + thread marker
 *   2-5. Middle — roast text + cashtag
 *   6. Closer — witty sign-off from curated bank
 */

import type { Logger } from 'pino';
import type { ITwitterClient } from '@twitter/twitter-client.interface.js';
import type {
  NewsPipelineResult,
  NewsStory,
  ThreadTweet,
  NewsPipelineStats,
} from './types.js';
import { twitterWeightedLength } from '@common/utils/tweet-text.js';

// ── Optimal posting time ───────────────────────────────────────────────
// Research: Tue–Thu 09:00–11:00 EST = 14:00–16:00 UTC (Buffer 8.7M tweets).
const OPTIMAL_HOUR_UTC = 14;

/** Minimum delay between thread tweets (ms). */
const MIN_TWEET_DELAY = 45_000;
/** Maximum delay between thread tweets (ms). */
const MAX_TWEET_DELAY = 90_000;
/** Twitter character limit. */
const TWEET_LIMIT = 280;

// ── Cashtag lookup ─────────────────────────────────────────────────────
// Research: 1–2 cashtags per tweet optimal, 3+ = -40% engagement penalty.
const TICKER_MAP: Record<string, string> = {
  // L1
  bitcoin: 'BTC', btc: 'BTC',
  ethereum: 'ETH', eth: 'ETH', vitalikbuterin: 'ETH',
  solana: 'SOL', sol: 'SOL',
  cardano: 'ADA', avalanche: 'AVAX', polkadot: 'DOT',
  nearprotocol: 'NEAR', near: 'NEAR', cosmos: 'ATOM',
  sui: 'SUI', aptos: 'APT', toncoin: 'TON', ton: 'TON',
  // L2
  base: 'BASE', arbitrum: 'ARB', optimism: 'OP',
  polygon: 'POL', matic: 'POL', zksync: 'ZK', starknet: 'STRK',
  // DeFi
  uniswap: 'UNI', aave: 'AAVE', makerdao: 'MKR', maker: 'MKR',
  lidofinance: 'LDO', lido: 'LDO', curvefi: 'CRV', curve: 'CRV',
  jupiterexchange: 'JUP', jupiter: 'JUP',
  daboraprotocol: 'DRIFT', driftprotocol: 'DRIFT', drift: 'DRIFT',
  // AI agents
  virtuals_io: 'VIRTUAL', virtuals: 'VIRTUAL',
  aixbt_agent: 'AIXBT', aixbt: 'AIXBT',
  // Other
  dfinity: 'ICP', icp: 'ICP', ripple: 'XRP', xrp: 'XRP',
  chainlink: 'LINK', pepe: 'PEPE',
  dogecoin: 'DOGE', doge: 'DOGE', shibtoken: 'SHIB',
  ondofinance: 'ONDO', ondo: 'ONDO',
  mantle: 'MNT', worldcoin: 'WLD',
  render: 'RENDER', rendertoken: 'RENDER',
  celestia: 'TIA', injective: 'INJ',
  pendle: 'PENDLE', pendlefinance: 'PENDLE',
  eigenlayer: 'EIGEN', ethena: 'ENA', ethenalabs: 'ENA',
};

function deriveCashtag(story: NewsStory): string | undefined {
  const handle = (story.ammunition.targetHandle || story.target)
    .toLowerCase()
    .replace(/^@/, '');
  const ticker = TICKER_MAP[handle];
  if (ticker) return `$${ticker}`;
  // Check if label contains an obvious $TICKER
  const match = story.label.match(/\$([A-Z]{2,10})\b/);
  if (match) return match[0];
  return undefined;
}

// ── Closer bank ────────────────────────────────────────────────────────
const CLOSERS = [
  "that's your daily serving of accountability. follow for tomorrow's edition or don't — we'll roast you anyway",
  "crypto never sleeps and neither do the L's. follow for daily roast updates or just check your portfolio for the same effect",
  "another day, another lesson nobody asked for. follow if you like your hopium with a side of reality",
  "this has been your daily reminder that nothing is safu. follow for more uncomfortable truths",
  "if any of this offended you, wait till you see your portfolio. follow for the daily roast",
  "that's a wrap on today's copium harvest. same time tomorrow — the L's never stop",
  "your daily dose of on-chain accountability. follow or just keep watching your bags evaporate",
  "none of this was financial advice. all of it was factual. follow for tomorrow's installment",
  "we don't make the news, we just roast it. follow for daily crypto reality checks",
  "thanks for attending today's support group. follow for more group therapy sessions",
  "today's audit is complete. nobody passed. follow for tomorrow's results",
  "the blockchain remembers, even if the founders wish it didn't. follow for daily receipts",
  "that's your daily proof that the market can stay irrational longer than you can stay solvent. follow for updates",
  "if you made it this far, you're already smarter than most of these protocols. follow for the daily roast",
  "and that concludes today's episode of 'things your favorite CT influencer won't tell you'. follow for season 2 tomorrow",
];

function pickCloser(): string {
  // Seed by day so the same closer doesn't repeat on the same day
  const daysSinceEpoch = Math.floor(Date.now() / 86_400_000);
  const index = daysSinceEpoch % CLOSERS.length;
  return CLOSERS[index]!;
}

// ── Thread formatting ──────────────────────────────────────────────────

export function formatNewsThread(result: NewsPipelineResult): ThreadTweet[] {
  const { topRoasts, stories } = result;
  const storyMap = new Map(stories.map((s) => [s.storyId, s]));
  const tweets: ThreadTweet[] = [];

  if (topRoasts.length === 0) return tweets;

  // Sort by judgeScore (best first = strongest hook)
  const sorted = [...topRoasts].sort((a, b) => b.judgeScore - a.judgeScore);

  // Tweet 1: Hook
  const best = sorted[0]!;
  const bestStory = storyMap.get(best.storyId);
  const hookCashtag = bestStory ? deriveCashtag(bestStory) : undefined;
  const hookParts = ['🔥 ROAST NEWS', '', best.text];
  const hookFooter = [hookCashtag, '$BASE', '🧵'].filter(Boolean);
  // Avoid duplicate $BASE
  const uniqueFooter = [...new Set(hookFooter)].join(' ');
  hookParts.push('', uniqueFooter);
  const hookText = hookParts.join('\n');

  tweets.push({
    text: trimToLimit(hookText, best.text),
    role: 'hook',
    storyId: best.storyId,
    storyLabel: bestStory?.label,
    cashtag: hookCashtag,
  });

  // Tweets 2-N: Middle roasts
  for (let i = 1; i < sorted.length; i++) {
    const roast = sorted[i]!;
    const story = storyMap.get(roast.storyId);
    const cashtag = story ? deriveCashtag(story) : undefined;

    let tweetText = roast.text;
    if (cashtag) {
      const withTag = `${roast.text}\n\n${cashtag}`;
      tweetText = twitterWeightedLength(withTag) <= TWEET_LIMIT ? withTag : roast.text;
    }

    tweets.push({
      text: tweetText,
      role: 'middle',
      storyId: roast.storyId,
      storyLabel: story?.label,
      cashtag,
    });
  }

  // Tweet N+1: Closer
  const closer = pickCloser();
  tweets.push({
    text: closer,
    role: 'closer',
  });

  return tweets;
}

/** If full hook text exceeds 280, drop header and footer to just the roast text. */
function trimToLimit(fullText: string, roastOnly: string): string {
  if (twitterWeightedLength(fullText) <= TWEET_LIMIT) return fullText;
  // Try without thread marker
  const shorter = fullText.replace(/\n\n🧵$/, '').replace(/\n🧵$/, '');
  if (twitterWeightedLength(shorter) <= TWEET_LIMIT) return shorter;
  // Fallback: just roast text + minimal header
  const minimal = `🔥 ROAST NEWS\n\n${roastOnly}`;
  if (twitterWeightedLength(minimal) <= TWEET_LIMIT) return minimal;
  // Last resort: just the roast
  return roastOnly;
}

// ── Thread posting ─────────────────────────────────────────────────────

function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs)) + minMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PostThreadResult {
  tweetIds: string[];
  partialFailure: boolean;
}

export async function postNewsThread(
  tweets: ThreadTweet[],
  client: ITwitterClient,
  logger: Logger,
): Promise<PostThreadResult> {
  if (tweets.length === 0) return { tweetIds: [], partialFailure: false };

  const tweetIds: string[] = [];

  // Post first tweet (standalone)
  const first = await client.postTweet(tweets[0]!.text);
  if (!first) {
    logger.error('Thread posting failed: could not post hook tweet');
    return { tweetIds: [], partialFailure: false };
  }
  tweetIds.push(first.tweetId);
  logger.info({ tweetId: first.tweetId, role: 'hook' }, 'Thread hook posted');

  // Post subsequent tweets as replies to the previous
  for (let i = 1; i < tweets.length; i++) {
    const delay = randomDelay(MIN_TWEET_DELAY, MAX_TWEET_DELAY);
    logger.debug({ delay, index: i }, 'Waiting between thread tweets');
    await sleep(delay);

    const prevId = tweetIds[tweetIds.length - 1]!;
    const result = await client.replyToTweet(tweets[i]!.text, prevId);
    if (!result) {
      logger.warn({ index: i, total: tweets.length }, 'Thread posting stopped: reply failed');
      return { tweetIds, partialFailure: true };
    }
    tweetIds.push(result.tweetId);
    logger.info(
      { tweetId: result.tweetId, index: i, role: tweets[i]!.role },
      'Thread tweet posted',
    );
  }

  return { tweetIds, partialFailure: false };
}

// ── Scheduling ─────────────────────────────────────────────────────────

/** Get next optimal posting slot (14:00 UTC, at least 30 min from now). */
export function getNextPostingSlot(): Date {
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(OPTIMAL_HOUR_UTC, 0, 0, 0);

  // If today's slot is at least 30 min away, use it
  if (today.getTime() - now.getTime() > 30 * 60 * 1000) {
    return today;
  }
  // Otherwise tomorrow
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow;
}

// ── Telegram preview ───────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${String(minutes)}m ${String(seconds)}s` : `${String(seconds)}s`;
}

export function formatThreadPreview(
  tweets: ThreadTweet[],
  stats: NewsPipelineStats,
): string {
  const lines: string[] = [];

  lines.push(`📰 <b>THREAD PREVIEW</b> (${String(tweets.length)} tweets)`);
  lines.push('');

  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i]!;
    const roleLabel =
      tweet.role === 'hook' ? ' · Hook' :
      tweet.role === 'closer' ? ' · Closer' : '';
    const storyTag = tweet.storyLabel ? ` — ${escapeHtml(tweet.storyLabel)}` : '';

    lines.push(`━━ ${String(i + 1)}/${String(tweets.length)}${roleLabel}${storyTag} ━━`);
    lines.push(`<code>${escapeHtml(tweet.text)}</code>`);
    const charCount = twitterWeightedLength(tweet.text);
    lines.push(`<i>${String(charCount)}/280 chars</i>`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━');
  lines.push(
    `⏱ ${formatDuration(stats.durationMs)} | ${String(stats.storiesFound)} stories | ${String(stats.totalGenerated)} variants | top ${stats.selected > 0 ? String(stats.selected) : '?'}`,
  );

  return lines.join('\n');
}

// ── Post result notification ───────────────────────────────────────────

export function formatPostResult(
  tweetIds: string[],
  tweets: ThreadTweet[],
  partial: boolean,
  botUsername: string,
): string {
  if (tweetIds.length === 0) {
    return '❌ <b>Thread posting failed</b> — could not post hook tweet';
  }

  const rootUrl = `https://x.com/${botUsername}/status/${tweetIds[0]}`;
  const lines: string[] = [];

  if (partial) {
    lines.push(`⚠️ <b>Thread partially posted</b> (${String(tweetIds.length)}/${String(tweets.length)} tweets)`);
  } else {
    lines.push(`✅ <b>Thread posted!</b> (${String(tweetIds.length)} tweets)`);
  }
  lines.push(`🔗 <a href="${rootUrl}">View thread</a>`);

  return lines.join('\n');
}
