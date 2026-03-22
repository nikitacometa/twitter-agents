import type { StockpiledRoast } from '@farm/types.js';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const STATUS_EMOJI: Record<string, string> = {
  available: '🟢',
  served_bot: '📤',
  served_landing: '🌐',
  promoted: '⭐',
  expired: '⏰',
  rejected: '🚫',
};

function formatAge(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${String(hours)}h`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d`;
}

function formatScore(label: string, score: number | null, max = 5): string {
  if (score === null) return `${label}: —`;
  const filled = Math.round(score);
  const bar = '●'.repeat(Math.min(filled, max)) + '○'.repeat(Math.max(0, max - filled));
  return `${label}: <b>${score.toFixed(1)}</b> ${bar}`;
}

export function formatStockpileRoast(r: StockpiledRoast, index?: number): string {
  const prefix = index !== undefined ? `<b>#${String(r.id)}</b> (${String(index + 1)})` : `<b>#${String(r.id)}</b>`;
  const statusEmoji = STATUS_EMOJI[r.status] ?? '❓';
  const age = formatAge(r.createdAt);

  const lines: string[] = [
    `${prefix} ${statusEmoji} ${escapeHtml(r.targetName)} · ${escapeHtml(r.angle ?? '?')} · ${String(r.tweetText.length)}ch · ${age}`,
    '',
    `<code>${escapeHtml(r.tweetText)}</code>`,
    '',
    `${formatScore('AI', r.qualityScore)} │ ${formatScore('Human', r.humanScore)}`,
  ];

  if (r.freshnessType === 'data_dependent' && r.expiresAt) {
    const expiresIn = Math.max(0, Math.floor((new Date(r.expiresAt).getTime() - Date.now()) / 3_600_000));
    lines.push(`⏳ Data-dependent · expires in ${String(expiresIn)}h`);
  }

  if (r.servedAt) {
    lines.push(`📤 Served: ${escapeHtml(r.servedAt)}`);
  }

  return lines.join('\n');
}

export function formatStockpileList(
  roasts: StockpiledRoast[],
  title: string,
  showSummary = true,
): string {
  if (roasts.length === 0) {
    return `${title}\n\n<i>Empty.</i>`;
  }

  const blocks = roasts.map((r, i) => formatStockpileRoast(r, i));

  const parts: string[] = [title];

  if (showSummary) {
    const avgAi = roasts.reduce((s, r) => s + r.qualityScore, 0) / roasts.length;
    const rated = roasts.filter((r) => r.humanScore !== null);
    const avgHuman = rated.length > 0
      ? rated.reduce((s, r) => s + r.humanScore!, 0) / rated.length
      : null;
    const humanStr = avgHuman !== null ? avgHuman.toFixed(1) : '—';
    const unratedCount = roasts.length - rated.length;

    parts.push(`<i>${String(roasts.length)} roasts · avg AI ${avgAi.toFixed(1)} · avg Human ${humanStr} · ${String(unratedCount)} unrated</i>`);
  }

  parts.push('');
  parts.push(blocks.join('\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n'));

  return parts.join('\n');
}

export function formatStatsMessage(stats: {
  total: number;
  byVerdict: Record<string, number>;
  topTargets: Array<{ target: string; count: number; fireRate: number }>;
  evaluators: Array<{ name: string; count: number }>;
}): string {
  const lines: string[] = ['<b>Feedback Statistics</b>', ''];

  // Verdict distribution
  type Verdict = 'fire' | 'post' | 'iterate' | 'reject';
  const EMOJI: Record<Verdict, string> = { fire: '🔥', post: '✅', iterate: '🔄', reject: '❌' };
  const LABEL: Record<Verdict, string> = { fire: 'GOLD', post: 'GOOD', iterate: 'REWORK', reject: 'BAD' };

  lines.push('<b>Verdicts:</b>');
  const verdicts: Verdict[] = ['fire', 'post', 'iterate', 'reject'];
  for (const v of verdicts) {
    const count = stats.byVerdict[v] ?? 0;
    const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    lines.push(`${EMOJI[v]} ${LABEL[v]}: ${String(count)} (${String(pct)}%) ${bar}`);
  }
  lines.push(`Total: ${String(stats.total)} ratings`);
  lines.push('');

  // Top targets
  if (stats.topTargets.length > 0) {
    lines.push('<b>Top targets:</b>');
    for (const t of stats.topTargets.slice(0, 5)) {
      const fireStr = t.fireRate > 0 ? ` · 🔥${String(Math.round(t.fireRate * 100))}%` : '';
      lines.push(`· ${escapeHtml(t.target)} (${String(t.count)}${fireStr})`);
    }
    lines.push('');
  }

  // Evaluators
  if (stats.evaluators.length > 0) {
    lines.push('<b>Evaluators:</b>');
    for (const e of stats.evaluators) {
      lines.push(`· ${escapeHtml(e.name)} — ${String(e.count)} ratings`);
    }
  }

  return lines.join('\n');
}
