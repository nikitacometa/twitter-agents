/**
 * Telegram notification utility for the Roast Farm pipeline.
 *
 * Sends HTML-formatted summaries of pipeline runs to a Telegram chat
 * using the Bot API directly via fetch — no grammy/telegraf dependency.
 *
 * Usage:
 *   const summary = formatFarmSummary(data);
 *   await sendFarmNotification(token, chatId, summary);
 */

import type { FarmTarget, StockpiledRoast } from './types.js';

// ---------------------------------------------------------------------------
// Data contract for a complete pipeline run
// ---------------------------------------------------------------------------

/** Per-target generation stats collected during the Generate phase. */
export interface GenerateTargetStats {
  name: string;
  type: string;
  attempts: number;
  filtered: number;
  errors: string[];
}

/** Per-attempt evaluation result collected during the Evaluate phase. */
export interface EvaluateAttemptResult {
  targetName: string;
  score: number;
  verdict: 'stockpile' | 'discard' | 'duplicate';
}

/**
 * Full data captured during a single `farm pipeline` run.
 * Pass this to `formatFarmSummary` to produce the Telegram message.
 */
export interface FarmRunSummary {
  /** ISO timestamp when the run started. */
  startedAt: string;
  /** ISO timestamp when the run finished. */
  finishedAt: string;
  /** Discover phase output. */
  discover: {
    discovered: number;
    skippedDuplicates: number;
    enriched: number;
    errors: string[];
    /** Top targets by priority score (sorted descending). */
    topTargets: Pick<FarmTarget, 'name' | 'type' | 'priorityScore' | 'reason'>[];
  };
  /** Generate phase output. */
  generate: {
    targetsProcessed: number;
    totalAttempts: number;
    totalFiltered: number;
    perTarget: GenerateTargetStats[];
  };
  /** Evaluate phase output. */
  evaluate: {
    evaluated: number;
    promoted: number;
    discarded: number;
    duplicates: number;
    threshold: number;
    results: EvaluateAttemptResult[];
  };
  /** Roasts that made it into the stockpile this run. */
  newStockpile: Pick<StockpiledRoast, 'targetName' | 'tweetText' | 'qualityScore' | 'angle'>[];
  /** Stockpile totals after the run (from buildStats). */
  stockpileTotals: {
    available: number;
    total: number;
    avgScore: number | null;
  };
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

/** Escapes characters that have special meaning in Telegram HTML parse mode. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function bold(text: string): string {
  return `<b>${escapeHtml(text)}</b>`;
}

function italic(text: string): string {
  return `<i>${escapeHtml(text)}</i>`;
}

function code(text: string): string {
  return `<code>${escapeHtml(text)}</code>`;
}

function line(text = ''): string {
  return `${text}\n`;
}

function divider(): string {
  return line('────────────────────');
}

/** Formats elapsed time between two ISO timestamps into "Xm Ys". */
function elapsed(startedAt: string, finishedAt: string): string {
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${String(min)}m ${String(sec)}s` : `${String(sec)}s`;
}

/** Formats a UTC ISO string as "HH:MM UTC". */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

/** Renders a score bar: filled squares proportional to score out of 10. */
function scoreBar(score: number, max = 10, width = 8): string {
  const filled = Math.round((score / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Truncates text to maxLen with ellipsis. Preserves whole words when possible. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen - 1).trimEnd();
  return `${cut}…`;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildHeader(data: FarmRunSummary): string {
  const date = new Date(data.startedAt).toISOString().slice(0, 10);
  const timeStr = formatTime(data.startedAt);
  const duration = elapsed(data.startedAt, data.finishedAt);

  return (
    line(`🥩 ${bold('Roast Farm — Pipeline Run')}`) +
    line() +
    line(`📅 ${bold(date)}  🕐 ${timeStr}  ⏱ ${italic(duration)}`)
  );
}

function buildDiscoverSection(discover: FarmRunSummary['discover']): string {
  const lines: string[] = [];

  lines.push(divider());
  lines.push(line(`🔍 ${bold('DISCOVER')}`));
  lines.push(line());

  const foundLabel = discover.discovered === 0 ? italic('none') : bold(String(discover.discovered));
  lines.push(line(`Found: ${foundLabel}  |  Duplicates skipped: ${code(String(discover.skippedDuplicates))}`));

  if (discover.enriched > 0) {
    lines.push(line(`Enriched via Perplexity: ${code(String(discover.enriched))}`));
  }

  if (discover.topTargets.length > 0) {
    lines.push(line());
    lines.push(line(italic('Top candidates:')));

    const top = discover.topTargets.slice(0, 5);
    for (const t of top) {
      const scoreSign = t.priorityScore >= 0 ? `+${String(t.priorityScore)}` : String(t.priorityScore);
      const reason = t.reason ? ` — ${truncate(t.reason, 60)}` : '';
      lines.push(line(`  ${code(scoreSign.padStart(4))}  ${bold(t.name)} ${italic(`(${t.type})`)}${escapeHtml(reason)}`));
    }

    if (discover.topTargets.length > 5) {
      lines.push(line(`  ${italic(`…and ${String(discover.topTargets.length - 5)} more`)}`));
    }
  }

  if (discover.errors.length > 0) {
    lines.push(line());
    lines.push(line(`⚠️ ${italic(`${String(discover.errors.length)} error(s)`)}`));
  }

  return lines.join('');
}

function buildGenerateSection(generate: FarmRunSummary['generate']): string {
  const lines: string[] = [];

  lines.push(divider());
  lines.push(line(`⚡ ${bold('GENERATE')}`));
  lines.push(line());

  if (generate.targetsProcessed === 0) {
    lines.push(line(italic('No targets processed.')));
    return lines.join('');
  }

  lines.push(line(
    `Targets: ${bold(String(generate.targetsProcessed))}  |  ` +
    `Attempts: ${bold(String(generate.totalAttempts))}  |  ` +
    `Filtered: ${code(String(generate.totalFiltered))}`,
  ));

  const passRate = generate.totalAttempts > 0
    ? Math.round(((generate.totalAttempts - generate.totalFiltered) / generate.totalAttempts) * 100)
    : 0;
  lines.push(line(`Content filter pass rate: ${italic(`${String(passRate)}%`)}`));

  // Show per-target breakdown — only errors + filtered≥2 are interesting
  const notable = generate.perTarget.filter((t) => t.errors.length > 0 || t.filtered >= 2);
  if (notable.length > 0) {
    lines.push(line());
    lines.push(line(italic('Notable targets:')));
    for (const t of notable) {
      if (t.errors.length > 0) {
        lines.push(line(`  ✗ ${bold(t.name)} — ${escapeHtml(t.errors[0] ?? 'unknown error')}`));
      } else {
        lines.push(line(`  ${bold(t.name)}: ${String(t.attempts)} stored, ${code(String(t.filtered))} filtered`));
      }
    }
  }

  return lines.join('');
}

function buildEvaluateSection(evaluate: FarmRunSummary['evaluate']): string {
  const lines: string[] = [];

  lines.push(divider());
  lines.push(line(`⚖️ ${bold('EVALUATE')}`));
  lines.push(line());

  if (evaluate.evaluated === 0) {
    lines.push(line(italic('Nothing to evaluate.')));
    return lines.join('');
  }

  lines.push(line(
    `Evaluated: ${bold(String(evaluate.evaluated))}  |  ` +
    `Threshold: ${code(String(evaluate.threshold))}`,
  ));
  lines.push(line());
  lines.push(line(
    `✅ Promoted: ${bold(String(evaluate.promoted))}  ` +
    `❌ Discarded: ${code(String(evaluate.discarded))}  ` +
    `🔁 Duplicates: ${italic(String(evaluate.duplicates))}`,
  ));

  if (evaluate.promoted > 0 && evaluate.evaluated > 0) {
    const promotionRate = Math.round((evaluate.promoted / evaluate.evaluated) * 100);
    lines.push(line(`Promotion rate: ${italic(`${String(promotionRate)}%`)}`));
  }

  // Score distribution: show top 3 promoted + bottom 2 discarded
  const promoted = evaluate.results
    .filter((r) => r.verdict === 'stockpile')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const discarded = evaluate.results
    .filter((r) => r.verdict === 'discard')
    .sort((a, b) => a.score - b.score)
    .slice(0, 2);

  if (promoted.length > 0) {
    lines.push(line());
    lines.push(line(italic('Top promoted:')));
    for (const r of promoted) {
      lines.push(line(`  ✓ ${bold(r.targetName)}  ${code(r.score.toFixed(1))}  ${italic(scoreBar(r.score))}`));
    }
  }

  if (discarded.length > 0) {
    lines.push(line());
    lines.push(line(italic('Lowest discarded:')));
    for (const r of discarded) {
      lines.push(line(`  ✗ ${italic(r.targetName)}  ${code(r.score.toFixed(1))}`));
    }
  }

  return lines.join('');
}

function buildStockpileSection(
  newStockpile: FarmRunSummary['newStockpile'],
  totals: FarmRunSummary['stockpileTotals'],
): string {
  const lines: string[] = [];

  lines.push(divider());
  lines.push(line(`🗄 ${bold('STOCKPILE')}`));
  lines.push(line());

  lines.push(line(
    `Available: ${bold(String(totals.available))} / ${italic(String(totals.total))} total  |  ` +
    `Avg score: ${totals.avgScore !== null ? bold(totals.avgScore.toFixed(2)) : italic('N/A')}`,
  ));

  if (newStockpile.length === 0) {
    lines.push(line());
    lines.push(line(italic('No new roasts added this run.')));
    return lines.join('');
  }

  lines.push(line());
  lines.push(line(`${bold(String(newStockpile.length))} new roast(s) added:`));

  // Sort by quality score descending, show all (they're the winners)
  const sorted = [...newStockpile].sort((a, b) => b.qualityScore - a.qualityScore);

  for (const roast of sorted) {
    const angle = roast.angle ? ` ${italic(`[${roast.angle}]`)}` : '';
    const scoreStr = roast.qualityScore.toFixed(1);

    lines.push(line());
    lines.push(line(`${bold(roast.targetName)}${angle}  ${code(scoreStr)}`));

    // Roast text in a pre block for fixed-width readability, truncated to ~220 chars
    const text = truncate(roast.tweetText, 220);
    lines.push(`<pre>${escapeHtml(text)}</pre>\n`);
  }

  return lines.join('');
}

function buildFooter(data: FarmRunSummary): string {
  const { discover, generate, evaluate, newStockpile } = data;
  const totalErrors = discover.errors.length + generate.perTarget.reduce((acc, t) => acc + t.errors.length, 0);

  const lines: string[] = [];
  lines.push(divider());

  lines.push(line(
    `${discover.discovered > 0 ? '🎯' : '·'} ${bold(String(discover.discovered))} discovered  ` +
    `${generate.totalAttempts > 0 ? '⚡' : '·'} ${bold(String(generate.totalAttempts))} generated  ` +
    `${evaluate.promoted > 0 ? '✅' : '·'} ${bold(String(evaluate.promoted))} promoted  ` +
    `${newStockpile.length > 0 ? '🗄' : '·'} ${bold(String(newStockpile.length))} stockpiled`,
  ));

  if (totalErrors > 0) {
    lines.push(line(`⚠️ ${italic(`${String(totalErrors)} total error(s) — check logs`)}`));
  }

  lines.push(line());
  lines.push(italic('#BeefFarm #pipeline'));

  return lines.join('');
}

// ---------------------------------------------------------------------------
// Public formatter
// ---------------------------------------------------------------------------

/**
 * Formats a complete pipeline run into a Telegram HTML message string.
 *
 * The output is split-safe: `sendFarmNotification` will chunk it automatically
 * if it exceeds Telegram's 4096-character limit.
 */
export function formatFarmSummary(data: FarmRunSummary): string {
  return (
    buildHeader(data) +
    line() +
    buildDiscoverSection(data.discover) +
    line() +
    buildGenerateSection(data.generate) +
    line() +
    buildEvaluateSection(data.evaluate) +
    line() +
    buildStockpileSection(data.newStockpile, data.stockpileTotals) +
    line() +
    buildFooter(data)
  );
}

// ---------------------------------------------------------------------------
// Evaluate-only formatter (for standalone `farm evaluate` runs)
// ---------------------------------------------------------------------------

export interface EvaluateSummaryData {
  evaluated: number;
  promoted: number;
  discarded: number;
  threshold: number;
  newStockpile: Pick<StockpiledRoast, 'targetName' | 'tweetText' | 'qualityScore' | 'angle'>[];
  stockpileTotals: {
    available: number;
    total: number;
    avgScore: number | null;
  };
}

/**
 * Formats a standalone evaluate run into a Telegram HTML message.
 * Lighter than formatFarmSummary — no discover/generate sections.
 */
export function formatEvaluateSummary(data: EvaluateSummaryData): string {
  const lines: string[] = [];

  const date = new Date().toISOString().slice(0, 10);
  lines.push(line(`🥩 ${bold('Roast Farm — Evaluate Run')}`));
  lines.push(line());
  lines.push(line(`📅 ${bold(date)}`));
  lines.push(divider());

  lines.push(line(`⚖️ ${bold('EVALUATE')}`));
  lines.push(line());
  lines.push(line(
    `Evaluated: ${bold(String(data.evaluated))}  |  Threshold: ${code(String(data.threshold))}`,
  ));
  lines.push(line());
  lines.push(line(
    `✅ Promoted: ${bold(String(data.promoted))}  ❌ Discarded: ${code(String(data.discarded))}`,
  ));

  if (data.promoted > 0 && data.evaluated > 0) {
    const rate = Math.round((data.promoted / data.evaluated) * 100);
    lines.push(line(`Promotion rate: ${italic(`${String(rate)}%`)}`));
  }

  lines.push(line());
  lines.push(
    buildStockpileSection(data.newStockpile, data.stockpileTotals),
  );

  lines.push(line());
  lines.push(italic('#BeefFarm #evaluate'));

  return lines.join('');
}

// ---------------------------------------------------------------------------
// Telegram sender
// ---------------------------------------------------------------------------

/** Response shape returned by the Bot API on success. */
interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

/**
 * Splits a string into chunks of at most `limit` characters, breaking on
 * newlines where possible to avoid cutting mid-line.
 */
function chunkMessage(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    // Try to break on a newline within the limit
    const slice = remaining.slice(0, limit);
    const lastNewline = slice.lastIndexOf('\n');
    const cutAt = lastNewline > limit * 0.5 ? lastNewline + 1 : limit;

    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }

  return chunks;
}

/**
 * Sends an HTML-formatted message to a Telegram chat via Bot API.
 *
 * Automatically splits messages that exceed Telegram's 4096-character limit.
 * Throws on HTTP errors or Bot API errors.
 *
 * @param token  - Telegram bot token (from TELEGRAM_BOT_TOKEN env var)
 * @param chatId - Target chat ID or username (e.g. "-1001234567890" or "@mychannel")
 * @param message - HTML-formatted message string
 */
export async function sendFarmNotification(
  token: string,
  chatId: string,
  message: string,
): Promise<void> {
  const TELEGRAM_LIMIT = 4096;
  const chunks = chunkMessage(message, TELEGRAM_LIMIT);

  for (const chunk of chunks) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
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
