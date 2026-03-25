import { describe, it, expect } from 'vitest';
import {
  formatClaudeQuota,
  formatCodexStatus,
  formatSdkStatus,
  type ClaudeQuota,
  type CodexStatus,
  type SdkStatus,
} from './quota-checker.js';

describe('quota-checker formatters', () => {
  describe('formatClaudeQuota', () => {
    it('formats all windows with progress bars', () => {
      const q: ClaudeQuota = {
        fiveHour: { utilization: 20, resetsAt: new Date(Date.now() + 3_600_000) },
        sevenDay: { utilization: 57, resetsAt: new Date(Date.now() + 86_400_000 * 4) },
        sonnet: { utilization: 4, resetsAt: new Date(Date.now() + 86_400_000 * 5) },
      };
      const out = formatClaudeQuota(q);
      expect(out).toContain('5h');
      expect(out).toContain('7d');
      expect(out).toContain('Son.');
      expect(out).toContain('20%');
      expect(out).toContain('57%');
      expect(out).toContain('█');
      expect(out).toContain('░');
    });

    it('handles null windows', () => {
      const q: ClaudeQuota = { fiveHour: null, sevenDay: null, sonnet: null };
      expect(formatClaudeQuota(q)).toBe('');
    });

    it('uses green emoji for low utilization', () => {
      const q: ClaudeQuota = {
        fiveHour: { utilization: 10, resetsAt: new Date(Date.now() + 3_600_000) },
        sevenDay: null,
        sonnet: null,
      };
      expect(formatClaudeQuota(q)).toContain('🟢');
    });

    it('uses yellow emoji for medium utilization', () => {
      const q: ClaudeQuota = {
        fiveHour: { utilization: 65, resetsAt: new Date(Date.now() + 3_600_000) },
        sevenDay: null,
        sonnet: null,
      };
      expect(formatClaudeQuota(q)).toContain('🟡');
    });

    it('uses red emoji for high utilization', () => {
      const q: ClaudeQuota = {
        fiveHour: { utilization: 90, resetsAt: new Date(Date.now() + 3_600_000) },
        sevenDay: null,
        sonnet: null,
      };
      expect(formatClaudeQuota(q)).toContain('🔴');
    });
  });

  describe('formatCodexStatus', () => {
    it('shows installed and authenticated', () => {
      const s: CodexStatus = { available: true, authMode: 'chatgpt', model: 'gpt-5.4' };
      const out = formatCodexStatus(s);
      expect(out).toContain('ChatGPT Plus');
      expect(out).toContain('gpt-5.4');
      expect(out).toContain('✅');
    });

    it('shows not installed', () => {
      const s: CodexStatus = { available: false, authMode: null, model: 'gpt-5.4' };
      expect(formatCodexStatus(s)).toContain('not installed');
    });

    it('shows not authenticated', () => {
      const s: CodexStatus = { available: true, authMode: null, model: 'gpt-5.4' };
      expect(formatCodexStatus(s)).toContain('Not authenticated');
    });
  });

  describe('formatSdkStatus', () => {
    it('shows credits available', () => {
      const s: SdkStatus = { hasCredits: true, error: null };
      expect(formatSdkStatus(s)).toContain('Credits available');
    });

    it('shows no credits', () => {
      const s: SdkStatus = { hasCredits: false, error: null };
      expect(formatSdkStatus(s)).toContain('No credits');
    });

    it('shows error when unknown', () => {
      const s: SdkStatus = { hasCredits: null, error: 'Timeout' };
      expect(formatSdkStatus(s)).toContain('Timeout');
    });
  });
});
