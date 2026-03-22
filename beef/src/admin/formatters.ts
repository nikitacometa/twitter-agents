export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
