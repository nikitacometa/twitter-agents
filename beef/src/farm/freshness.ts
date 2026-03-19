import type { FreshnessType } from './types.js';

const DATA_PATTERNS = /\$[\d,.]+[MBK]|\d+%|TVL|mcap|market\s*cap|volume|Q[1-4]\s*20\d{2}/i;

/**
 * Classify whether a roast is evergreen or data-dependent.
 *
 * data_dependent: references specific prices, TVL, percentages, dates.
 * Gets a 7-day TTL — stale data ruins a roast.
 *
 * evergreen: personality, narrative, structural humor.
 * No expiry — funny forever.
 */
export function classifyFreshness(
  text: string,
  researchNotes: string | null,
): FreshnessType {
  if (DATA_PATTERNS.test(text)) return 'data_dependent';
  if (researchNotes && researchNotes.length > 200) return 'data_dependent';
  return 'evergreen';
}

/**
 * Calculate expiry date for data_dependent roasts.
 * Returns ISO string 7 days from now, or null for evergreen.
 */
export function calculateExpiry(freshness: FreshnessType): string | null {
  if (freshness === 'evergreen') return null;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);
  return expiry.toISOString().replace('T', ' ').slice(0, 19);
}
