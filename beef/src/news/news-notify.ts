/**
 * Phase 5: Telegram notification for news digest.
 */

import type { RankedNewsVariant, NewsStory, NewsPipelineStats } from './types.js';

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

function scoreEmoji(rank: number): string {
  if (rank === 1) return '🏆';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${String(rank)}`;
}

function storyLink(story: NewsStory | undefined, target: string): string {
  if (!story) return escapeHtml(target);
  const handle = story.ammunition.targetHandle || target.replace('@', '');
  if (story.sourceUrl) {
    return `<a href="${story.sourceUrl}">@${escapeHtml(handle)}</a>`;
  }
  return `@${escapeHtml(handle)}`;
}

export function formatNewsDigest(
  topRoasts: RankedNewsVariant[],
  runnerUps: RankedNewsVariant[],
  stories: NewsStory[],
  stats: NewsPipelineStats,
): string {
  const storyMap = new Map(stories.map((s) => [s.storyId, s]));

  const lines: string[] = [];

  // Header
  lines.push(
    `📰 <b>NEWS ROAST DIGEST</b>`,
    `${String(stats.storiesFound)} stories researched · ${String(stats.totalGenerated)} candidates · top ${String(topRoasts.length)} by 5-judge panel`,
    '',
  );

  // Top roasts
  for (let i = 0; i < topRoasts.length; i++) {
    const roast = topRoasts[i]!;
    const story = storyMap.get(roast.storyId);
    const storyLabel = story?.label ?? roast.storyId;

    lines.push(`━━ ${scoreEmoji(i + 1)} <b>${escapeHtml(storyLabel)}</b> ━━`);
    lines.push(`${roast.judgeScore.toFixed(2)} | 🎭 ${escapeHtml(roast.angle)} | 🏷 ${roast.pipeline === 'opus' ? 'Opus' : 'Sonnet'}`);
    lines.push(`<i>"${escapeHtml(roast.text)}"</i>`);
    lines.push(`📎 ${storyLink(story, roast.storyId)}`);

    // Score breakdown under spoiler
    const breakdown = `F:${roast.funny.toFixed(1)} I:${roast.impact.toFixed(1)} O:${roast.original.toFixed(1)}`;
    lines.push(`<tg-spoiler>${breakdown}</tg-spoiler>`);
    lines.push('');
  }

  // Runner-ups under spoiler
  if (runnerUps.length > 0) {
    const ruLines = runnerUps.map((ru, i) => {
      const idx = topRoasts.length + i + 1;
      return `${String(idx)}. [${ru.judgeScore.toFixed(2)}] "${escapeHtml(ru.text)}" — ${escapeHtml(ru.angle)}`;
    });
    lines.push(`<tg-spoiler>━━ Runner-ups ━━\n${ruLines.join('\n')}</tg-spoiler>`);
    lines.push('');
  }

  // Pipeline stats
  const gatherTime = formatDuration(stats.phaseTimings.gatherMs);
  const researchTime = formatDuration(stats.phaseTimings.researchMs);
  const genTime = formatDuration(stats.phaseTimings.generateMs);
  const evalTime = formatDuration(stats.phaseTimings.evaluateMs);

  lines.push('━━ 📊 Pipeline Stats ━━');
  lines.push(`⏱ ${formatDuration(stats.durationMs)} total (gather: ${gatherTime}, research: ${researchTime}, gen: ${genTime}, eval: ${evalTime})`);
  lines.push(`📈 Stories: ${String(stats.storiesFound)} found → ${String(stats.storiesSelected)} selected`);
  lines.push(`🎯 Variants: ${String(stats.totalGenerated)} generated → ${String(stats.afterFilter)} filtered → ${String(stats.evaluated)} evaluated → ${String(stats.selected)} selected`);
  lines.push(`🧠 Opus: ${String(stats.opusVariants)} | Sonnet: ${String(stats.lightningVariants)}`);

  return lines.join('\n');
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

export async function sendNewsDigest(
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
