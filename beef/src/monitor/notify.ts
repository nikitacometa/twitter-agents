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

export function formatMonitorAlert(tweet: ScoredTweet): string {
  const lines: string[] = [];

  const tierEmoji = tweet.tier === 'S' ? '🔥' : '🎯';
  lines.push(`${tierEmoji} <b>[${tweet.tier}]</b> @${escapeHtml(tweet.authorHandle)} (${formatFollowers(tweet.followersK)})`);
  lines.push(`Score: <b>${String(tweet.score)}</b> | ${String(tweet.ageMinutes)}m ago`);
  lines.push('');
  lines.push(`"${escapeHtml(tweet.text.slice(0, 500))}"`);
  lines.push('');
  lines.push(tweet.tweetUrl);

  return lines.join('\n');
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

export async function sendMonitorAlert(
  token: string,
  adminIds: number[],
  tweet: ScoredTweet,
): Promise<void> {
  const text = formatMonitorAlert(tweet);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

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
