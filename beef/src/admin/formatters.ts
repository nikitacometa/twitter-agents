import type { HumanVerdict } from '@common/types/index.js';
import type { RoastSession } from './types.js';

const VERDICT_EMOJI: Record<HumanVerdict, string> = {
  fire: '🔥',
  post: '✅',
  iterate: '🔄',
  reject: '❌',
};

const VERDICT_LABEL: Record<HumanVerdict, string> = {
  fire: 'GOLD',
  post: 'GOOD',
  iterate: 'REWORK',
  reject: 'BAD',
};

export const RATING_LEGEND = '🔥 gold standard · ✅ postable · ❌ bad · ✏️ your edit';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatVariantMessage(
  text: string,
  index: number,
  angle: string,
  score: number,
  total: number,
): string {
  const charCount = text.length;
  const header = `<b>Variant ${String(index + 1)}/${String(total)}</b> · ${escapeHtml(angle)} · ${String(score)}/5 · ${String(charCount)} chars`;
  return `${header}\n\n<code>${escapeHtml(text)}</code>`;
}

export function formatSessionSummary(session: RoastSession): string {
  const lines: string[] = [
    `<b>📊 Session results: ${escapeHtml(session.targetName)}</b>`,
    '',
  ];

  for (let i = 0; i < session.variants.length; i++) {
    const variant = session.variants[i];
    if (!variant) continue;

    const ratings: string[] = [];
    for (const [, evaluatorRatings] of session.ratings) {
      const verdict = evaluatorRatings.get(i);
      if (verdict) {
        ratings.push(`${VERDICT_EMOJI[verdict]} ${VERDICT_LABEL[verdict]}`);
      }
    }

    const ratingStr = ratings.length > 0 ? ratings.join(' · ') : '<i>no ratings</i>';
    lines.push(`<b>${String(i + 1)}.</b> ${escapeHtml(variant.angle)}`);
    lines.push(`   ${ratingStr}`);
    lines.push(`   <code>${escapeHtml(variant.text.slice(0, 80))}${variant.text.length > 80 ? '...' : ''}</code>`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatStatsMessage(stats: {
  total: number;
  byVerdict: Record<string, number>;
  topTargets: Array<{ target: string; count: number; fireRate: number }>;
  evaluators: Array<{ name: string; count: number }>;
}): string {
  const lines: string[] = ['<b>📈 Feedback Statistics</b>', ''];

  // Verdict distribution
  lines.push('<b>Verdicts:</b>');
  const verdicts: HumanVerdict[] = ['fire', 'post', 'iterate', 'reject'];
  for (const v of verdicts) {
    const count = stats.byVerdict[v] ?? 0;
    const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    lines.push(`${VERDICT_EMOJI[v]} ${VERDICT_LABEL[v]}: ${String(count)} (${String(pct)}%) ${bar}`);
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
