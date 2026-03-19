import { execFile } from 'node:child_process';
import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { FarmTargetRepository } from '@storage/repositories/farm-target.repository.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { FarmTargetSource, InsertFarmTarget } from './types.js';
import type { TargetType } from '@common/types/index.js';
import { getErrorMessage } from '@common/utils/error.util.js';

function execFileAsync(
  cmd: string,
  args: string[],
  opts: { timeout: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) reject(err as Error);
      else resolve({ stdout, stderr });
    });
  });
}

// --- Public API ---

export interface DiscovererOptions {
  provider: ProviderManager;
  farmTarget: FarmTargetRepository;
  stockpile: StockpileRepository;
  logger: Logger;
  maxEnrich?: number;
}

export interface DiscoveredTarget {
  name: string;
  type: TargetType;
  source: FarmTargetSource;
  priorityScore: number;
  reason: string;
}

export interface DiscoveryResult {
  discovered: number;
  skippedDuplicates: number;
  enriched: number;
  errors: string[];
}

// --- Raw API response shapes ---

export interface DexScreenerToken {
  tokenAddress: string;
  chainId: string;
  description?: string;
  url: string;
  icon?: string;
  header?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
  totalAmount?: number;
  amount?: number;
}

export interface CoinGeckoMarketItem {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  price_change_percentage_24h: number | null;
  total_volume: number | null;
}

// --- Scoring ---

export interface ScoringFactors {
  marketCapUsd: number | null;
  priceChange24hPct: number | null;
  isBaseChain: boolean;
  existingStockpileCount: number;
}

export function calculatePriorityScore(factors: ScoringFactors): number {
  let score = 0;

  if (factors.marketCapUsd !== null && factors.marketCapUsd > 10_000_000) {
    score += 2;
  }

  if (factors.priceChange24hPct !== null && Math.abs(factors.priceChange24hPct) > 20) {
    score += 3;
  }

  if (factors.isBaseChain) {
    score += 2;
  }

  if (factors.existingStockpileCount >= 3) {
    score -= 10;
  } else if (factors.existingStockpileCount === 0) {
    score += 1;
  }

  return score;
}

// --- API Fetchers ---

const CURL_TIMEOUT_S = 15;

async function curlJson<T>(url: string): Promise<T> {
  const { stdout } = await execFileAsync('curl', [
    '-s', '-f',
    '--max-time', String(CURL_TIMEOUT_S),
    '-H', 'Accept: application/json',
    url,
  ], { timeout: (CURL_TIMEOUT_S + 5) * 1000 });

  return JSON.parse(stdout) as T;
}

export async function fetchDexScreenerTrending(): Promise<DexScreenerToken[]> {
  const data = await curlJson<DexScreenerToken[]>(
    'https://api.dexscreener.com/token-boosts/top/v1',
  );
  if (!Array.isArray(data)) return [];
  return data;
}

export async function fetchCoinGeckoTopMovers(limit: number = 50): Promise<CoinGeckoMarketItem[]> {
  const data = await curlJson<CoinGeckoMarketItem[]>(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=${String(limit)}&page=1&sparkline=false`,
  );
  if (!Array.isArray(data)) return [];
  return data;
}

// --- Parsing ---

export function parseDexScreenerTargets(tokens: DexScreenerToken[]): DiscoveredTarget[] {
  const seen = new Set<string>();
  const targets: DiscoveredTarget[] = [];

  for (const token of tokens) {
    if (!token.description && !token.url) continue;

    // Extract name from description or URL
    const name = extractTokenName(token);
    if (!name || name.length < 2) continue;

    const normalized = name.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const isBase = token.chainId === 'base';

    targets.push({
      name,
      type: 'token',
      source: 'dexscreener',
      priorityScore: calculatePriorityScore({
        marketCapUsd: null,
        priceChange24hPct: null,
        isBaseChain: isBase,
        existingStockpileCount: 0,
      }),
      reason: `Trending on DexScreener${isBase ? ' (Base chain)' : ` (${token.chainId})`}`,
    });
  }

  return targets;
}

function extractTokenName(token: DexScreenerToken): string | null {
  // Try description first — usually contains the project/token name
  if (token.description) {
    // Take first meaningful word/phrase (before any marketing fluff)
    const cleaned = token.description
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^\w\s$.-]/g, ' ')
      .trim();
    // First word that looks like a name (capitalized or $TICKER)
    const nameMatch = cleaned.match(/^\$?[A-Z][A-Za-z0-9]+/);
    if (nameMatch) return nameMatch[0];
  }

  // Fallback: extract from URL
  if (token.url) {
    const urlMatch = token.url.match(/\/([^/]+)\/?$/);
    if (urlMatch?.[1]) return urlMatch[1];
  }

  return null;
}

export function parseCoinGeckoTargets(items: CoinGeckoMarketItem[]): DiscoveredTarget[] {
  return items
    .filter((item) => item.name && item.name.length >= 2)
    .map((item) => ({
      name: item.name,
      type: 'project' as TargetType,
      source: 'coingecko' as FarmTargetSource,
      priorityScore: calculatePriorityScore({
        marketCapUsd: item.market_cap,
        priceChange24hPct: item.price_change_percentage_24h,
        isBaseChain: false, // CoinGecko doesn't specify chain in /markets
        existingStockpileCount: 0,
      }),
      reason: formatCoinGeckoReason(item),
    }));
}

function formatCoinGeckoReason(item: CoinGeckoMarketItem): string {
  const parts = ['CoinGecko top mover'];
  if (item.market_cap !== null) {
    parts.push(`mcap $${formatLargeNumber(item.market_cap)}`);
  }
  if (item.price_change_percentage_24h !== null) {
    const sign = item.price_change_percentage_24h >= 0 ? '+' : '';
    parts.push(`24h ${sign}${item.price_change_percentage_24h.toFixed(1)}%`);
  }
  return parts.join(', ');
}

function formatLargeNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

// --- Enrichment ---

interface EnrichmentResult {
  name: string;
  reason: string;
  bonusScore: number;
}

async function enrichWithPerplexity(
  provider: ProviderManager,
  targets: DiscoveredTarget[],
  maxCalls: number,
  logger: Logger,
): Promise<Map<string, EnrichmentResult>> {
  const results = new Map<string, EnrichmentResult>();
  const toEnrich = targets.slice(0, maxCalls);

  for (const target of toEnrich) {
    try {
      const taskId = `farm-discover-enrich-${target.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
      const prompt = `Research the crypto project/token "${target.name}" for roast material. Focus on:
1. Recent controversies, failures, or embarrassing moments
2. Team background issues (anon, rug history, conflicts)
3. Technical problems (downtime, hacks, bugs)
4. Community sentiment (negative)
5. Tokenomics red flags

Respond with a JSON object:
{
  "roastable": true/false,
  "reason": "one-line summary of the juiciest roast angle",
  "score_boost": 0-3 (how roastable is this? 0=boring, 3=goldmine)
}`;

      const result = await provider.run<string>(taskId, {
        prompt,
        profile: 'farm-discover',
        requiresResearch: true,
      });

      const parsed = parseEnrichmentOutput(result.data);
      if (parsed) {
        results.set(target.name, {
          name: target.name,
          reason: parsed.reason,
          bonusScore: parsed.scoreBoost,
        });
        logger.info(
          { target: target.name, bonusScore: parsed.scoreBoost },
          'Enrichment complete',
        );
      }
    } catch (err) {
      logger.warn(
        { target: target.name, err: getErrorMessage(err) },
        'Enrichment failed for target',
      );
    }
  }

  return results;
}

interface ParsedEnrichment {
  roastable: boolean;
  reason: string;
  scoreBoost: number;
}

function parseEnrichmentOutput(data: unknown): ParsedEnrichment | null {
  let obj: Record<string, unknown>;

  if (typeof data === 'string') {
    try {
      const cleaned = data.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof data === 'object' && data !== null) {
    // Handle nested { text: "..." } wrapper
    const wrapper = data as Record<string, unknown>;
    if (typeof wrapper['text'] === 'string') {
      return parseEnrichmentOutput(wrapper['text']);
    }
    obj = wrapper;
  } else {
    return null;
  }

  if (typeof obj['roastable'] !== 'boolean') return null;
  if (!obj['roastable']) return null;

  const reason = typeof obj['reason'] === 'string' ? obj['reason'] : '';
  const scoreBoost = typeof obj['score_boost'] === 'number'
    ? Math.min(3, Math.max(0, Math.round(obj['score_boost'])))
    : 0;

  return { roastable: true, reason, scoreBoost };
}

// --- Main Discoverer ---

export class TargetDiscoverer {
  private readonly provider: ProviderManager;
  private readonly farmTarget: FarmTargetRepository;
  private readonly stockpile: StockpileRepository;
  private readonly logger: Logger;
  private readonly maxEnrich: number;

  constructor(opts: DiscovererOptions) {
    this.provider = opts.provider;
    this.farmTarget = opts.farmTarget;
    this.stockpile = opts.stockpile;
    this.logger = opts.logger;
    this.maxEnrich = opts.maxEnrich ?? 5;
  }

  async discover(opts: {
    limit?: number;
    sources?: Array<'dexscreener' | 'coingecko'>;
    enrich?: boolean;
  } = {}): Promise<{ targets: DiscoveredTarget[]; result: DiscoveryResult }> {
    const limit = opts.limit ?? 20;
    const sources = opts.sources ?? ['dexscreener', 'coingecko'];
    const enrich = opts.enrich ?? false;

    const errors: string[] = [];
    let rawTargets: DiscoveredTarget[] = [];

    // 1. Fetch from APIs
    const fetches = await Promise.allSettled(
      sources.map((source) => this.fetchSource(source)),
    );

    for (let i = 0; i < fetches.length; i++) {
      const result = fetches[i]!;
      if (result.status === 'fulfilled') {
        rawTargets.push(...result.value);
      } else {
        const source = sources[i]!;
        const msg = `${source}: ${getErrorMessage(result.reason)}`;
        errors.push(msg);
        this.logger.warn({ source, err: result.reason }, 'Source fetch failed');
      }
    }

    if (rawTargets.length === 0) {
      return {
        targets: [],
        result: { discovered: 0, skippedDuplicates: 0, enriched: 0, errors },
      };
    }

    // 2. Merge duplicates (same name from different sources — keep highest score)
    rawTargets = this.mergeDuplicates(rawTargets);

    // 3. Recalculate scores with real stockpile data
    // Parsing functions assume existingStockpileCount=0 since they lack DB access.
    // Here we correct the score using actual stockpile counts.
    for (const target of rawTargets) {
      const stockpileCount = this.stockpile.getCountForTarget(target.name);
      if (stockpileCount > 0) {
        // Remove the incorrect +1 "untouched" bonus from parse-time scoring
        target.priorityScore -= 1;
      }
      if (stockpileCount >= 3) {
        // Heavy penalty for saturated targets
        target.priorityScore -= 10;
      }
    }

    // 4. Sort by priority and trim
    rawTargets.sort((a, b) => b.priorityScore - a.priorityScore);
    rawTargets = rawTargets.slice(0, limit);

    // 5. Enrich top candidates via Perplexity
    let enrichedCount = 0;
    if (enrich && this.maxEnrich > 0) {
      const enrichResults = await enrichWithPerplexity(
        this.provider,
        rawTargets,
        this.maxEnrich,
        this.logger,
      );

      for (const target of rawTargets) {
        const enrichment = enrichResults.get(target.name);
        if (enrichment) {
          target.priorityScore += enrichment.bonusScore;
          target.reason = `${target.reason} | Perplexity: ${enrichment.reason}`;
          enrichedCount++;
        }
      }

      // Re-sort after enrichment
      rawTargets.sort((a, b) => b.priorityScore - a.priorityScore);
    }

    // 6. Dedup against existing farm_targets and store
    let skippedDuplicates = 0;
    const stored: DiscoveredTarget[] = [];

    for (const target of rawTargets) {
      const existing = this.farmTarget.findByName(target.name);
      if (existing) {
        skippedDuplicates++;
        this.logger.debug({ target: target.name }, 'Target already in farm_targets, skipping');
        continue;
      }

      const insert: InsertFarmTarget = {
        name: target.name,
        type: target.type,
        source: target.source,
        priorityScore: target.priorityScore,
        reason: target.reason,
      };

      this.farmTarget.insert(insert);
      stored.push(target);
    }

    this.logger.info(
      { discovered: stored.length, skipped: skippedDuplicates, enriched: enrichedCount },
      'Discovery complete',
    );

    return {
      targets: stored,
      result: {
        discovered: stored.length,
        skippedDuplicates,
        enriched: enrichedCount,
        errors,
      },
    };
  }

  private async fetchSource(source: 'dexscreener' | 'coingecko'): Promise<DiscoveredTarget[]> {
    switch (source) {
      case 'dexscreener': {
        const tokens = await fetchDexScreenerTrending();
        return parseDexScreenerTargets(tokens);
      }
      case 'coingecko': {
        const items = await fetchCoinGeckoTopMovers();
        return parseCoinGeckoTargets(items);
      }
    }
  }

  private mergeDuplicates(targets: DiscoveredTarget[]): DiscoveredTarget[] {
    const byName = new Map<string, DiscoveredTarget>();

    for (const target of targets) {
      const key = target.name.toLowerCase();
      const existing = byName.get(key);

      if (!existing) {
        byName.set(key, target);
      } else if (target.source !== existing.source) {
        // Multi-source bonus: keep highest score + add bonus
        if (target.priorityScore > existing.priorityScore) {
          target.priorityScore += 1;
          target.reason = `${target.reason} + ${existing.source}`;
          byName.set(key, target);
        } else {
          existing.priorityScore += 1;
          existing.reason = `${existing.reason} + ${target.source}`;
        }
      }
      // Same source duplicate → keep first (higher priority kept by earlier sort)
    }

    return [...byName.values()];
  }
}
