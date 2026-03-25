import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ProviderName } from './agent.types.js';

// --- Types ---

export interface WindowQuota {
  utilization: number; // 0-100
  resetsAt: Date;
}

export interface ClaudeQuota {
  fiveHour: WindowQuota | null;
  sevenDay: WindowQuota | null;
  sonnet: WindowQuota | null;
}

export interface CodexStatus {
  available: boolean;
  authMode: string | null;
  model: string;
}

export interface SdkStatus {
  hasCredits: boolean | null; // null = couldn't check
  error: string | null;
}

export interface ProviderQuota {
  name: ProviderName;
  role: string;
  quota: ClaudeQuota | CodexStatus | SdkStatus;
}

// --- Claude Code CLI ---

interface ClaudeOAuthUsage {
  five_hour?: { utilization: number; resets_at: string } | null;
  seven_day?: { utilization: number; resets_at: string } | null;
  seven_day_sonnet?: { utilization: number; resets_at: string } | null;
}

export async function checkClaudeQuota(): Promise<ClaudeQuota | null> {
  try {
    const credPath = join(homedir(), '.claude', '.credentials.json');
    const raw = await readFile(credPath, 'utf-8');
    const creds = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } };
    const token = creds.claudeAiOauth?.accessToken;
    if (!token) return null;

    const resp = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;

    const data = await resp.json() as ClaudeOAuthUsage;

    const parseWindow = (w: { utilization: number; resets_at: string } | null | undefined): WindowQuota | null => {
      if (!w) return null;
      return { utilization: w.utilization, resetsAt: new Date(w.resets_at) };
    };

    return {
      fiveHour: parseWindow(data.five_hour),
      sevenDay: parseWindow(data.seven_day),
      sonnet: parseWindow(data.seven_day_sonnet),
    };
  } catch {
    return null;
  }
}

// --- Codex CLI ---

export function checkCodexStatus(): CodexStatus {
  // Check if codex binary is available
  const extPath = getExtendedPath();
  let available = false;
  try {
    execFileSync('codex', ['--version'], {
      timeout: 3_000,
      env: { ...process.env, PATH: extPath },
      stdio: 'pipe',
    });
    available = true;
  } catch {
    // not available
  }

  // Check auth status
  let authMode: string | null = null;
  try {
    const authPath = join(homedir(), '.codex', 'auth.json');
    const raw = JSON.parse(
      // Sync read is fine here — called rarely, small file
      execFileSync('cat', [authPath], { timeout: 1_000, stdio: 'pipe' }).toString(),
    ) as { auth_mode?: string };
    authMode = raw.auth_mode ?? null;
  } catch {
    // no auth
  }

  return { available, authMode, model: 'gpt-5.4' };
}

// --- Anthropic SDK ---

export async function checkSdkStatus(apiKey: string | undefined): Promise<SdkStatus> {
  if (!apiKey) return { hasCredits: null, error: 'No API key configured' };

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: '.' }],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.ok) return { hasCredits: true, error: null };

    const body = await resp.json() as { error?: { message?: string } };
    const msg = body.error?.message ?? `HTTP ${String(resp.status)}`;

    if (msg.includes('credit balance')) {
      return { hasCredits: false, error: null };
    }
    // Other errors (rate limit, auth) — credits status unknown
    return { hasCredits: null, error: msg };
  } catch (err) {
    return { hasCredits: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// --- Formatting ---

function progressBar(pct: number, len = 10): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round(clamped / 100 * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

function formatResetTime(date: Date): string {
  const now = Date.now();
  const diffMs = date.getTime() - now;

  if (diffMs <= 0) return 'now';

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${String(diffMin)}m`;

  const diffH = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffH < 24) return remMin > 0 ? `${String(diffH)}h ${String(remMin)}m` : `${String(diffH)}h`;

  const diffD = Math.floor(diffH / 24);
  const remH = diffH % 24;
  return `${String(diffD)}d ${String(remH)}h`;
}

function utilizationEmoji(pct: number): string {
  if (pct < 50) return '🟢';
  if (pct < 80) return '🟡';
  return '🔴';
}

function formatWindowLine(label: string, w: WindowQuota): string {
  const emoji = utilizationEmoji(w.utilization);
  const bar = progressBar(w.utilization);
  const pctStr = String(Math.round(w.utilization)).padStart(3);
  const reset = formatResetTime(w.resetsAt);
  return `  ${emoji} ${label}  <code>${bar}</code> ${pctStr}%  ⏱${reset}`;
}

export function formatClaudeQuota(q: ClaudeQuota): string {
  const lines: string[] = [];
  if (q.fiveHour) lines.push(formatWindowLine('5h  ', q.fiveHour));
  if (q.sevenDay) lines.push(formatWindowLine('7d  ', q.sevenDay));
  if (q.sonnet) lines.push(formatWindowLine('Son.', q.sonnet));
  return lines.join('\n');
}

export function formatCodexStatus(s: CodexStatus): string {
  if (!s.available) return '  ❌ CLI not installed';
  if (!s.authMode) return '  ⚠️ Not authenticated';
  return [
    `  ✅ ${s.authMode === 'chatgpt' ? 'ChatGPT Plus' : s.authMode} • ${s.model}`,
    '  📊 ~45-225 msg/5h (no usage API)',
  ].join('\n');
}

export function formatSdkStatus(s: SdkStatus): string {
  if (s.hasCredits === true) return '  ✅ Credits available';
  if (s.hasCredits === false) return '  ❌ No credits';
  return `  ⚠️ ${s.error ?? 'Unknown status'}`;
}

export async function buildQuotaMessage(opts: {
  mode: 'primary' | 'degraded';
  fallbackNames: ProviderName[];
  anthropicApiKey?: string;
}): Promise<string> {
  const modeEmoji = opts.mode === 'primary' ? '🟢' : '🟡';

  // Run all checks in parallel
  const [claude, sdk] = await Promise.all([
    checkClaudeQuota(),
    checkSdkStatus(opts.anthropicApiKey),
  ]);
  const codex = checkCodexStatus();

  const sections: string[] = [
    `📊 <b>LLM Quota</b>  ${modeEmoji} ${opts.mode}`,
    '',
  ];

  // Claude Code CLI (always primary)
  sections.push('<b>⚡ Claude Code CLI</b>  <code>PRIMARY</code>');
  if (claude) {
    sections.push(formatClaudeQuota(claude));
  } else {
    sections.push('  ⚠️ Could not fetch quota');
  }

  // Fallbacks
  const fallbackIdx = (name: ProviderName): number => opts.fallbackNames.indexOf(name);

  if (fallbackIdx('codex') >= 0) {
    const idx = fallbackIdx('codex') + 1;
    sections.push('');
    sections.push(`<b>🔄 Codex CLI</b>  <code>FALLBACK ${String(idx)}</code>`);
    sections.push(formatCodexStatus(codex));
  }

  if (fallbackIdx('anthropic-sdk') >= 0) {
    const idx = fallbackIdx('anthropic-sdk') + 1;
    sections.push('');
    sections.push(`<b>💳 Anthropic SDK</b>  <code>FALLBACK ${String(idx)}</code>`);
    sections.push(formatSdkStatus(sdk));
  }

  return sections.join('\n');
}

// --- Helpers ---

function getExtendedPath(): string {
  const home = process.env.HOME ?? '';
  return `${home}/.local/bin:${home}/.npm-global/bin:${process.env.PATH ?? ''}`;
}
