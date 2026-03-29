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

function formatDigestEntry(tweet: ScoredTweet): string {
  const tierEmoji = tweet.tier === 'S' ? '🔥' : tweet.tier === 'A' ? '🎯' : '▫️';
  const truncText =
    tweet.text.length > DIGEST_TEXT_LIMIT ? tweet.text.slice(0, DIGEST_TEXT_LIMIT) + '…' : tweet.text;

  const handleLink = `<a href="${tweet.tweetUrl}">@${escapeHtml(tweet.authorHandle)}</a>`;
  return (
    `${tierEmoji} ${handleLink} · ${formatFollowers(tweet.followersK)} · <b>${String(tweet.score)}</b>pts · ${String(tweet.ageMinutes)}m\n` +
    `<i>"${escapeHtml(truncText)}"</i>`
  );
}

function formatSection(title: string, tweets: ScoredTweet[]): string {
  if (tweets.length === 0) return '';
  const entries = tweets.map((t) => formatDigestEntry(t));
  return `\n━━ <b>${title}</b> ━━\n\n${entries.join('\n\n')}`;
}

export function formatMonitorDigest(tweets: ScoredTweet[]): string[] {
  if (tweets.length === 0) return [];

  const basePosts = tweets.filter((t) => t.category === 'base' && !t.isReply);
  const baseReplies = tweets.filter((t) => t.category === 'base' && t.isReply);
  const generalTweets = tweets.filter((t) => t.category === 'general');

  const header = `📊 <b>Monitor Digest</b> — ${String(tweets.length)} tweet${tweets.length > 1 ? 's' : ''}`;
  const basePostSection = formatSection('🔵 BASE ECOSYSTEM', basePosts);
  const baseReplySection = formatSection('💬 BASE REPLIES', baseReplies);
  const generalSection = formatSection('🌐 GENERAL CRYPTO', generalTweets);

  const fullMessage = header + basePostSection + baseReplySection + generalSection;

  // Split into chunks if exceeds Telegram limit
  if (fullMessage.length <= TELEGRAM_MAX_LENGTH - 100) {
    return [fullMessage];
  }

  // Send sections as separate messages if combined is too long
  const messages: string[] = [];
  if (basePosts.length > 0) {
    messages.push(header + basePostSection);
  }
  if (baseReplies.length > 0) {
    messages.push(baseReplySection.trim());
  }
  if (generalTweets.length > 0) {
    const genHeader = basePosts.length > 0 || baseReplies.length > 0 ? '' : header + '\n';
    messages.push(genHeader + generalSection);
  }

  return messages;
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

export async function sendMonitorDigest(
  token: string,
  chatId: number | string,
  tweets: ScoredTweet[],
): Promise<void> {
  const messages = formatMonitorDigest(tweets);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  for (const text of messages) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
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
