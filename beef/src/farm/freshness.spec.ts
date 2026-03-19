import { describe, it, expect } from 'vitest';
import { classifyFreshness, calculateExpiry } from './freshness.js';

describe('classifyFreshness', () => {
  it('returns data_dependent for dollar amounts with suffix', () => {
    expect(classifyFreshness('uniswap lost $11M in governance', null)).toBe('data_dependent');
    expect(classifyFreshness('tvl dropped to $500K lmao', null)).toBe('data_dependent');
    expect(classifyFreshness('raised $2.5B for nothing', null)).toBe('data_dependent');
  });

  it('returns data_dependent for percentages', () => {
    expect(classifyFreshness('token down 94% from ATH', null)).toBe('data_dependent');
    expect(classifyFreshness('only 12% of validators online', null)).toBe('data_dependent');
  });

  it('returns data_dependent for TVL/mcap keywords', () => {
    expect(classifyFreshness('their TVL speaks for itself', null)).toBe('data_dependent');
    expect(classifyFreshness('mcap lower than your lunch bill', null)).toBe('data_dependent');
    expect(classifyFreshness('market cap of a lemonade stand', null)).toBe('data_dependent');
  });

  it('returns data_dependent for quarterly references', () => {
    expect(classifyFreshness('in Q1 2026 they managed nothing', null)).toBe('data_dependent');
    expect(classifyFreshness('Q4 2025 was their peak', null)).toBe('data_dependent');
  });

  it('returns data_dependent for volume keyword', () => {
    expect(classifyFreshness('24h volume: three trades by the dev', null)).toBe('data_dependent');
  });

  it('returns data_dependent for long research notes', () => {
    const longNotes = 'x'.repeat(201);
    expect(classifyFreshness('just a plain roast', longNotes)).toBe('data_dependent');
  });

  it('returns evergreen for pure narrative roasts', () => {
    expect(classifyFreshness('another day another chain going down', null)).toBe('evergreen');
    expect(classifyFreshness('imagine building on a chain named after a beach', null)).toBe('evergreen');
    expect(classifyFreshness('governance is just vibes at this point ser', null)).toBe('evergreen');
  });

  it('returns evergreen with short research notes', () => {
    expect(classifyFreshness('pure narrative roast', 'quick lookup')).toBe('evergreen');
  });

  it('returns evergreen for null research notes', () => {
    expect(classifyFreshness('no data no problem', null)).toBe('evergreen');
  });
});

describe('calculateExpiry', () => {
  it('returns null for evergreen', () => {
    expect(calculateExpiry('evergreen')).toBeNull();
  });

  it('returns ISO datetime string for data_dependent', () => {
    const result = calculateExpiry('data_dependent');
    expect(result).not.toBeNull();
    // Should be roughly 7 days from now
    const expiry = new Date(result!);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.5);
    expect(diffDays).toBeLessThan(7.5);
  });

  it('returns space-separated datetime format', () => {
    const result = calculateExpiry('data_dependent');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
