import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase } from '@storage/database.js';
import { FarmTargetRepository } from '@storage/repositories/farm-target.repository.js';
import { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { ProviderManager } from '@agent/provider-manager.js';
import { logger } from '@common/utils/logger.js';
import {
  calculatePriorityScore,
  parseDexScreenerTargets,
  parseCoinGeckoTargets,
  TargetDiscoverer,
} from './target-discoverer.js';
import type {
  DexScreenerToken,
  CoinGeckoMarketItem,
} from './target-discoverer.js';

// --- Mock node:child_process for curl subprocess calls ---
// execFile has ~12 overloads making vi.mocked() unusable.
// vi.hoisted() ensures mockExecFile is available when vi.mock factory runs (hoisted).

type ExecFileCb = (err: Error | null, stdout: string, stderr: string) => void;
const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: mockExecFile }));

function mockCurlResponse(data: unknown): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, callback?: ExecFileCb) => {
      const cb = (typeof _opts === 'function' ? _opts : callback) as ExecFileCb;
      cb(null, JSON.stringify(data), '');
      return {};
    },
  );
}

function mockCurlSequence(responses: unknown[]): void {
  let callIndex = 0;
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, callback?: ExecFileCb) => {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      const cb = (typeof _opts === 'function' ? _opts : callback) as ExecFileCb;
      if (response instanceof Error) {
        cb(response, '', '');
      } else {
        cb(null, JSON.stringify(response), '');
      }
      return {};
    },
  );
}

function makeMockProvider(): ProviderManager {
  return {
    run: vi.fn().mockResolvedValue({
      data: JSON.stringify({
        roastable: true,
        reason: 'Team rugged twice before',
        score_boost: 2,
      }),
      durationMs: 100,
      provider: 'claude-code' as const,
    }),
  } as unknown as ProviderManager;
}

// --- Scoring tests ---

describe('calculatePriorityScore', () => {
  it('returns 0 for neutral factors', () => {
    expect(calculatePriorityScore({
      marketCapUsd: null,
      priceChange24hPct: null,
      isBaseChain: false,
      existingStockpileCount: 1,
    })).toBe(0);
  });

  it('adds 2 for market cap > $10M', () => {
    expect(calculatePriorityScore({
      marketCapUsd: 15_000_000,
      priceChange24hPct: null,
      isBaseChain: false,
      existingStockpileCount: 0,
    })).toBe(3); // +2 mcap + 1 untouched
  });

  it('does not add mcap bonus for < $10M', () => {
    expect(calculatePriorityScore({
      marketCapUsd: 5_000_000,
      priceChange24hPct: null,
      isBaseChain: false,
      existingStockpileCount: 1,
    })).toBe(0);
  });

  it('adds 3 for high volatility (positive)', () => {
    expect(calculatePriorityScore({
      marketCapUsd: null,
      priceChange24hPct: 45,
      isBaseChain: false,
      existingStockpileCount: 1,
    })).toBe(3);
  });

  it('adds 3 for high volatility (negative)', () => {
    expect(calculatePriorityScore({
      marketCapUsd: null,
      priceChange24hPct: -30,
      isBaseChain: false,
      existingStockpileCount: 1,
    })).toBe(3);
  });

  it('does not add volatility bonus for < 20%', () => {
    expect(calculatePriorityScore({
      marketCapUsd: null,
      priceChange24hPct: 15,
      isBaseChain: false,
      existingStockpileCount: 1,
    })).toBe(0);
  });

  it('adds 2 for Base chain', () => {
    expect(calculatePriorityScore({
      marketCapUsd: null,
      priceChange24hPct: null,
      isBaseChain: true,
      existingStockpileCount: 1,
    })).toBe(2);
  });

  it('subtracts 10 for stockpile count >= 3', () => {
    expect(calculatePriorityScore({
      marketCapUsd: null,
      priceChange24hPct: null,
      isBaseChain: false,
      existingStockpileCount: 3,
    })).toBe(-10);
  });

  it('adds 1 for untouched targets (stockpile 0)', () => {
    expect(calculatePriorityScore({
      marketCapUsd: null,
      priceChange24hPct: null,
      isBaseChain: false,
      existingStockpileCount: 0,
    })).toBe(1);
  });

  it('stacks all bonuses', () => {
    const score = calculatePriorityScore({
      marketCapUsd: 50_000_000, // +2
      priceChange24hPct: -55,   // +3
      isBaseChain: true,        // +2
      existingStockpileCount: 0, // +1
    });
    expect(score).toBe(8);
  });
});

// --- DexScreener parsing ---

describe('parseDexScreenerTargets', () => {
  it('parses tokens with descriptions', () => {
    const tokens: DexScreenerToken[] = [
      {
        tokenAddress: '0x1',
        chainId: 'base',
        description: 'PEPE is the next big thing',
        url: 'https://dexscreener.com/base/0x1',
      },
      {
        tokenAddress: '0x2',
        chainId: 'ethereum',
        description: 'Dogecoin revival project',
        url: 'https://dexscreener.com/ethereum/0x2',
      },
    ];

    const targets = parseDexScreenerTargets(tokens);
    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect(targets[0]!.source).toBe('dexscreener');
    expect(targets[0]!.type).toBe('token');
  });

  it('marks Base chain tokens correctly', () => {
    const tokens: DexScreenerToken[] = [
      {
        tokenAddress: '0x1',
        chainId: 'base',
        description: 'BaseToken project',
        url: 'https://dexscreener.com/base/0x1',
      },
    ];

    const targets = parseDexScreenerTargets(tokens);
    expect(targets[0]!.reason).toContain('Base chain');
    expect(targets[0]!.priorityScore).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates tokens with same name', () => {
    const tokens: DexScreenerToken[] = [
      {
        tokenAddress: '0x1',
        chainId: 'base',
        description: 'SameToken first instance',
        url: 'https://dexscreener.com/base/0x1',
      },
      {
        tokenAddress: '0x2',
        chainId: 'base',
        description: 'SameToken second instance',
        url: 'https://dexscreener.com/base/0x2',
      },
    ];

    const targets = parseDexScreenerTargets(tokens);
    expect(targets).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseDexScreenerTargets([])).toHaveLength(0);
  });

  it('skips tokens without description or URL', () => {
    const tokens: DexScreenerToken[] = [
      { tokenAddress: '0x1', chainId: 'base', url: '' },
    ];
    expect(parseDexScreenerTargets(tokens)).toHaveLength(0);
  });
});

// --- CoinGecko parsing ---

describe('parseCoinGeckoTargets', () => {
  it('parses market items into targets', () => {
    const items: CoinGeckoMarketItem[] = [
      {
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        current_price: 65000,
        market_cap: 1_200_000_000_000,
        price_change_percentage_24h: 2.5,
        total_volume: 30_000_000_000,
      },
    ];

    const targets = parseCoinGeckoTargets(items);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.name).toBe('Bitcoin');
    expect(targets[0]!.source).toBe('coingecko');
    expect(targets[0]!.type).toBe('project');
    expect(targets[0]!.reason).toContain('mcap');
    expect(targets[0]!.reason).toContain('+2.5%');
  });

  it('scores high volatility correctly', () => {
    const items: CoinGeckoMarketItem[] = [
      {
        id: 'volatile-token',
        symbol: 'vol',
        name: 'VolatileCoin',
        current_price: 1.5,
        market_cap: 50_000_000,
        price_change_percentage_24h: -45.3,
        total_volume: 5_000_000,
      },
    ];

    const targets = parseCoinGeckoTargets(items);
    // +2 mcap (50M) + 3 volatility (>20%) + 1 untouched = 6
    expect(targets[0]!.priorityScore).toBe(6);
  });

  it('formats large market caps', () => {
    const items: CoinGeckoMarketItem[] = [
      {
        id: 'large-cap',
        symbol: 'lg',
        name: 'LargeCap',
        current_price: 100,
        market_cap: 5_000_000_000,
        price_change_percentage_24h: 1,
        total_volume: 1_000_000,
      },
    ];

    const targets = parseCoinGeckoTargets(items);
    expect(targets[0]!.reason).toContain('$5.0B');
  });

  it('handles null fields', () => {
    const items: CoinGeckoMarketItem[] = [
      {
        id: 'null-fields',
        symbol: 'nul',
        name: 'NullToken',
        current_price: null,
        market_cap: null,
        price_change_percentage_24h: null,
        total_volume: null,
      },
    ];

    const targets = parseCoinGeckoTargets(items);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.priorityScore).toBe(1); // only untouched bonus
  });

  it('filters out items with short names', () => {
    const items: CoinGeckoMarketItem[] = [
      {
        id: 'x',
        symbol: 'x',
        name: 'X',
        current_price: 1,
        market_cap: 100_000,
        price_change_percentage_24h: 0,
        total_volume: 100,
      },
    ];

    expect(parseCoinGeckoTargets(items)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(parseCoinGeckoTargets([])).toHaveLength(0);
  });
});

// --- TargetDiscoverer integration tests ---

describe('TargetDiscoverer', () => {
  let tmpDir: string;
  let db: Database.Database;
  let farmTarget: FarmTargetRepository;
  let stockpile: StockpileRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-discover-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    farmTarget = new FarmTargetRepository(db);
    stockpile = new StockpileRepository(db);
    mockExecFile.mockReset();
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers targets from DexScreener', async () => {
    const dexData: DexScreenerToken[] = [
      {
        tokenAddress: '0xabc',
        chainId: 'base',
        description: 'MoonToken is the next big memecoin',
        url: 'https://dexscreener.com/base/0xabc',
      },
      {
        tokenAddress: '0xdef',
        chainId: 'ethereum',
        description: 'RocketSwap decentralized exchange',
        url: 'https://dexscreener.com/ethereum/0xdef',
      },
    ];

    mockCurlResponse(dexData);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    const { result } = await discoverer.discover({
      sources: ['dexscreener'],
      enrich: false,
    });

    expect(result.discovered).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(0);
  });

  it('discovers targets from CoinGecko', async () => {
    const geckoData: CoinGeckoMarketItem[] = [
      {
        id: 'uniswap',
        symbol: 'uni',
        name: 'Uniswap',
        current_price: 12,
        market_cap: 8_000_000_000,
        price_change_percentage_24h: -5.2,
        total_volume: 200_000_000,
      },
    ];

    mockCurlResponse(geckoData);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    const { targets, result } = await discoverer.discover({
      sources: ['coingecko'],
      enrich: false,
    });

    expect(result.discovered).toBe(1);
    expect(targets[0]!.name).toBe('Uniswap');
  });

  it('deduplicates against existing farm_targets', async () => {
    // Pre-insert a target
    farmTarget.insert({
      name: 'Uniswap',
      type: 'project',
      source: 'manual',
      priorityScore: 5,
    });

    const geckoData: CoinGeckoMarketItem[] = [
      {
        id: 'uniswap',
        symbol: 'uni',
        name: 'Uniswap',
        current_price: 12,
        market_cap: 8_000_000_000,
        price_change_percentage_24h: -5.2,
        total_volume: 200_000_000,
      },
      {
        id: 'aave',
        symbol: 'aave',
        name: 'Aave',
        current_price: 100,
        market_cap: 2_000_000_000,
        price_change_percentage_24h: 3.1,
        total_volume: 50_000_000,
      },
    ];

    mockCurlResponse(geckoData);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    const { result } = await discoverer.discover({
      sources: ['coingecko'],
      enrich: false,
    });

    expect(result.skippedDuplicates).toBe(1); // Uniswap skipped
    expect(result.discovered).toBe(1); // Only Aave stored
  });

  it('penalizes targets with 3+ stockpiled roasts', async () => {
    // Pre-populate stockpile with 3 roasts for SaturatedProject
    for (let i = 0; i < 3; i++) {
      stockpile.insert({
        targetName: 'SaturatedProject',
        targetType: 'project',
        tweetText: `roast ${String(i)}`,
        qualityScore: 4.0,
        freshnessType: 'evergreen',
      });
    }

    const geckoData: CoinGeckoMarketItem[] = [
      {
        id: 'saturated',
        symbol: 'sat',
        name: 'SaturatedProject',
        current_price: 10,
        market_cap: 50_000_000,
        price_change_percentage_24h: 25,
        total_volume: 1_000_000,
      },
      {
        id: 'fresh',
        symbol: 'frsh',
        name: 'FreshProject',
        current_price: 5,
        market_cap: 20_000_000,
        price_change_percentage_24h: 30,
        total_volume: 500_000,
      },
    ];

    mockCurlResponse(geckoData);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    const { targets } = await discoverer.discover({
      sources: ['coingecko'],
      enrich: false,
    });

    // FreshProject should rank higher (no stockpile penalty)
    expect(targets[0]!.name).toBe('FreshProject');
    // SaturatedProject gets -10 penalty
    const saturated = targets.find((t) => t.name === 'SaturatedProject');
    expect(saturated).toBeDefined();
    expect(saturated!.priorityScore).toBeLessThan(0);
  });

  it('handles API errors gracefully', async () => {
    mockCurlSequence([new Error('curl: (28) Connection timed out')]);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    const { result } = await discoverer.discover({
      sources: ['dexscreener'],
      enrich: false,
    });

    expect(result.discovered).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('dexscreener');
  });

  it('continues when one source fails and another succeeds', async () => {
    // DexScreener fails, CoinGecko succeeds
    const geckoData: CoinGeckoMarketItem[] = [
      {
        id: 'aave',
        symbol: 'aave',
        name: 'Aave',
        current_price: 100,
        market_cap: 2_000_000_000,
        price_change_percentage_24h: 3.1,
        total_volume: 50_000_000,
      },
    ];

    mockCurlSequence([
      new Error('timeout'),
      geckoData,
    ]);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    const { result } = await discoverer.discover({
      sources: ['dexscreener', 'coingecko'],
      enrich: false,
    });

    expect(result.discovered).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it('enriches top candidates with Perplexity', async () => {
    const geckoData: CoinGeckoMarketItem[] = [
      {
        id: 'enrichable',
        symbol: 'enr',
        name: 'EnrichableProject',
        current_price: 10,
        market_cap: 50_000_000,
        price_change_percentage_24h: 25,
        total_volume: 1_000_000,
      },
    ];

    mockCurlResponse(geckoData);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
      maxEnrich: 5,
    });

    const { targets, result } = await discoverer.discover({
      sources: ['coingecko'],
      enrich: true,
    });

    expect(result.enriched).toBe(1);
    // Provider was called for enrichment
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(provider.run)).toHaveBeenCalledTimes(1);
    // Score should include enrichment bonus
    expect(targets[0]!.priorityScore).toBeGreaterThan(6); // base 6 + boost 2
    expect(targets[0]!.reason).toContain('Perplexity');
  });

  it('caps Perplexity calls to maxEnrich', async () => {
    const geckoData: CoinGeckoMarketItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `token-${String(i)}`,
      symbol: `t${String(i)}`,
      name: `Token${String(i)}Name`,
      current_price: 10,
      market_cap: 50_000_000,
      price_change_percentage_24h: 25,
      total_volume: 1_000_000,
    }));

    mockCurlResponse(geckoData);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
      maxEnrich: 3,
    });

    await discoverer.discover({
      sources: ['coingecko'],
      enrich: true,
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(provider.run)).toHaveBeenCalledTimes(3);
  });

  it('handles enrichment failure gracefully', async () => {
    const geckoData: CoinGeckoMarketItem[] = [
      {
        id: 'fail-enrich',
        symbol: 'fe',
        name: 'FailEnrich',
        current_price: 10,
        market_cap: 50_000_000,
        price_change_percentage_24h: 25,
        total_volume: 1_000_000,
      },
    ];

    mockCurlResponse(geckoData);

    const provider = {
      run: vi.fn().mockRejectedValue(new Error('Perplexity timeout')),
    } as unknown as ProviderManager;

    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    const { targets, result } = await discoverer.discover({
      sources: ['coingecko'],
      enrich: true,
    });

    expect(result.enriched).toBe(0);
    expect(result.discovered).toBe(1);
    expect(targets[0]!.name).toBe('FailEnrich');
  });

  it('respects limit option', async () => {
    const geckoData: CoinGeckoMarketItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: `token-${String(i)}`,
      symbol: `t${String(i)}`,
      name: `LimitTestToken${String(i)}`,
      current_price: 10,
      market_cap: 50_000_000,
      price_change_percentage_24h: 5,
      total_volume: 1_000_000,
    }));

    mockCurlResponse(geckoData);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    const { result } = await discoverer.discover({
      sources: ['coingecko'],
      limit: 5,
      enrich: false,
    });

    expect(result.discovered).toBe(5);
  });

  it('merges duplicate targets from different sources', async () => {
    // Same project appearing in both DexScreener and CoinGecko
    const dexData: DexScreenerToken[] = [
      {
        tokenAddress: '0x1',
        chainId: 'base',
        description: 'Uniswap decentralized exchange',
        url: 'https://dexscreener.com/base/0x1',
      },
    ];

    const geckoData: CoinGeckoMarketItem[] = [
      {
        id: 'uniswap',
        symbol: 'uni',
        name: 'Uniswap',
        current_price: 12,
        market_cap: 8_000_000_000,
        price_change_percentage_24h: -5.2,
        total_volume: 200_000_000,
      },
    ];

    mockCurlSequence([dexData, geckoData]);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    const { targets } = await discoverer.discover({
      sources: ['dexscreener', 'coingecko'],
      enrich: false,
    });

    // Should be merged into one target (not duplicated)
    const uniTargets = targets.filter(
      (t) => t.name.toLowerCase() === 'uniswap',
    );
    expect(uniTargets.length).toBeLessThanOrEqual(1);
  });

  it('returns empty result when all sources return empty', async () => {
    mockCurlResponse([]);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    const { targets, result } = await discoverer.discover({
      sources: ['coingecko'],
      enrich: false,
    });

    expect(targets).toHaveLength(0);
    expect(result.discovered).toBe(0);
  });

  it('stores discovered targets in farm_targets table', async () => {
    const geckoData: CoinGeckoMarketItem[] = [
      {
        id: 'aave',
        symbol: 'aave',
        name: 'Aave',
        current_price: 100,
        market_cap: 2_000_000_000,
        price_change_percentage_24h: 3.1,
        total_volume: 50_000_000,
      },
    ];

    mockCurlResponse(geckoData);

    const provider = makeMockProvider();
    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
    });

    await discoverer.discover({
      sources: ['coingecko'],
      enrich: false,
    });

    const stored = farmTarget.findByName('Aave');
    expect(stored).toBeDefined();
    expect(stored!.source).toBe('coingecko');
    expect(stored!.status).toBe('pending');
  });
});
