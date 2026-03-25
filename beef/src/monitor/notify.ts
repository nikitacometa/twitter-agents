import type { ScoredTweet } from './tweet-scorer.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatFollowers(k: number): string {
  if (k >= 1000) return `${(k / 1000).toFixed(1)}M`;
  return `${String(k)}K`;
}

const TELEGRAM_MAX_LENGTH = 4096;
const DIGEST_TEXT_LIMIT = 100;

function formatDigestEntry(idx: number, tweet: ScoredTweet): string {
  const tierEmoji = tweet.tier === 'S' ? '🔥' : tweet.tier === 'A' ? '🎯' : '▫️';
  const truncText =
    tweet.text.length > DIGEST_TEXT_LIMIT ? tweet.text.slice(0, DIGEST_TEXT_LIMIT) + '…' : tweet.text;

  return (
    `<b>${String(idx)}.</b> ${tierEmoji}[${tweet.tier}] @${escapeHtml(tweet.authorHandle)} (${formatFollowers(tweet.followersK)}) · <b>${String(tweet.score)}</b>pts · ${String(tweet.ageMinutes)}m\n` +
    `"${escapeHtml(truncText)}"\n` +
    tweet.tweetUrl
  );
}

export function formatMonitorDigest(tweets: ScoredTweet[]): string[] {
  if (tweets.length === 0) return [];

  const header = `📊 <b>Monitor Digest</b> — ${String(tweets.length)} tweet${tweets.length > 1 ? 's' : ''}\n`;
  const messages: string[] = [];
  let current = header;
  let globalIdx = 1;

  for (const tweet of tweets) {
    const entry = formatDigestEntry(globalIdx, tweet);
    const candidate = current + '\n' + entry;

    if (candidate.length > TELEGRAM_MAX_LENGTH - 100 && current !== header) {
      messages.push(current);
      current = entry;
    } else {
      current = candidate;
    }
    globalIdx++;
  }

  if (current.length > 0) {
    messages.push(current);
  }

  return messages;
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

export async function sendMonitorDigest(
  token: string,
  adminIds: number[],
  tweets: ScoredTweet[],
): Promise<void> {
  const messages = formatMonitorDigest(tweets);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  for (const text of messages) {
    for (const adminId of adminIds) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      const body = (await response.json()) as TelegramApiResponse;
      if (!response.ok || !body.ok) {
        throw new Error(`Telegram API error (${String(response.status)}): ${body.description ?? 'unknown'}`);
      }
    }
  }
}
