import type { TweetData } from '../twitter/twitter-client.interface.js';
import type { EvaluatedCandidate } from './types.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatFollowers(k: number): string {
  if (k >= 1000) return `${(k / 1000).toFixed(1)}M`;
  return `${String(k)}K`;
}

export function formatDryRunMessage(
  candidate: EvaluatedCandidate,
  tweetData: TweetData | null,
  roastText: string,
  dailyCount: number,
  dailyCap: number,
): string {
  const t = candidate.tweet;
  const handleLink = `<a href="${t.tweetUrl}">@${escapeHtml(t.authorHandle)}</a>`;

  // Tweet metrics line (from API if available, otherwise omit)
  let metricsLine = '';
  if (tweetData?.views || tweetData?.likes) {
    const parts: string[] = [];
    if (tweetData.views) parts.push(`👁 ${formatNumber(tweetData.views)}`);
    if (tweetData.likes) parts.push(`❤️ ${formatNumber(tweetData.likes)}`);
    if (tweetData.retweets) parts.push(`🔁 ${formatNumber(tweetData.retweets)}`);
    if (tweetData.replies) parts.push(`💬 ${formatNumber(tweetData.replies)}`);
    metricsLine = `\n${parts.join(' · ')}`;
  }

  const tweetText = escapeHtml(t.text.length > 200 ? t.text.slice(0, 200) + '…' : t.text);
  const roast = escapeHtml(roastText);

  const spoiler = [
    `📊 Monitor: ${String(t.score)}pts · Roastability: ${String(candidate.roastability)}/10`,
    candidate.suggestedAngle ? `Angle: ${candidate.suggestedAngle}` : null,
    candidate.reasoning,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    `🏜 <b>DRY RUN</b> · Reply Guy #${String(dailyCount)}/${String(dailyCap)}\n\n` +
    `💬 ${handleLink} · ${formatFollowers(t.followersK)} · ${String(t.ageMinutes)}m ago\n` +
    `<i>"${tweetText}"</i>${metricsLine}\n\n` +
    `🔥 <b>Reply:</b>\n` +
    `<code>${roast}</code>\n\n` +
    `<tg-spoiler>${escapeHtml(spoiler)}</tg-spoiler>`
  );
}

export function formatLivePostMessage(
  candidate: EvaluatedCandidate,
  roastText: string,
  postedTweetId: string,
  dailyCount: number,
  dailyCap: number,
): string {
  const t = candidate.tweet;
  const handleLink = `<a href="${t.tweetUrl}">@${escapeHtml(t.authorHandle)}</a>`;
  const tweetText = escapeHtml(t.text.length > 120 ? t.text.slice(0, 120) + '…' : t.text);
  const roast = escapeHtml(roastText);
  const replyUrl = `https://x.com/0xBeefer/status/${postedTweetId}`;

  return (
    `✅ <b>POSTED</b> · Reply Guy #${String(dailyCount)}/${String(dailyCap)}\n\n` +
    `💬 ${handleLink} · ${String(t.ageMinutes)}m ago\n` +
    `<i>"${tweetText}"</i>\n\n` +
    `🔥 <b>Reply:</b>\n` +
    `<code>${roast}</code>\n\n` +
    `🔗 <a href="${replyUrl}">View reply</a>`
  );
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

export async function sendReplyGuyNotification(
  token: string,
  chatId: number | string,
  html: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const body = (await response.json()) as TelegramApiResponse;
  if (!response.ok || !body.ok) {
    throw new Error(`Telegram API error (${String(response.status)}): ${body.description ?? 'unknown'}`);
  }
}
