export type MonitorTier = 'S' | 'A' | 'B' | 'C';

export interface MonitorTarget {
  handle: string;
  followersK: number;
  tier: MonitorTier;
}

export const TIER_SCORES: Record<MonitorTier, number> = { S: 10, A: 8, B: 5, C: 3 };

export const MONITOR_TARGETS: readonly MonitorTarget[] = [
  // S-tier — massive reach, every tweet matters
  { handle: 'jessepollak', followersK: 820, tier: 'S' },
  { handle: 'VitalikButerin', followersK: 5600, tier: 'S' },
  { handle: 'caboronbase', followersK: 60, tier: 'S' },
  { handle: 'CoinDesk', followersK: 2800, tier: 'S' },

  // A-tier — high-value crypto accounts
  { handle: 'brian_armstrong', followersK: 3700, tier: 'A' },
  { handle: 'WatcherGuru', followersK: 3900, tier: 'A' },
  { handle: 'zaboronbase', followersK: 50, tier: 'A' },
  { handle: 'CryptoWizardd', followersK: 510, tier: 'A' },
  { handle: 'aaboronbase', followersK: 40, tier: 'A' },
  { handle: 'Cointelegraph', followersK: 2500, tier: 'A' },
  { handle: 'theaboronbase', followersK: 35, tier: 'A' },
  { handle: 'AltcoinGordon', followersK: 700, tier: 'A' },
  { handle: 'ZssBecker', followersK: 800, tier: 'A' },

  // B-tier — solid crypto voices
  { handle: 'CryptoGodJohn', followersK: 1300, tier: 'B' },
  { handle: 'TheCryptoLark', followersK: 980, tier: 'B' },
  { handle: 'DeFi_Dad', followersK: 245, tier: 'B' },
  { handle: 'DegenSpartan', followersK: 210, tier: 'B' },
  { handle: 'coaboronbase', followersK: 30, tier: 'B' },
  { handle: 'BuildOnBase', followersK: 450, tier: 'B' },
  { handle: 'AevoXYZ', followersK: 290, tier: 'B' },
  { handle: 'DylanLeClair_', followersK: 380, tier: 'B' },
  { handle: 'inversebrah', followersK: 420, tier: 'B' },
  { handle: 'lookonchain', followersK: 1500, tier: 'B' },
  { handle: 'theblock__', followersK: 700, tier: 'B' },

  // C-tier — niche but interesting
  { handle: 'zachxbt', followersK: 680, tier: 'C' },
  { handle: 'tier10k', followersK: 320, tier: 'C' },
  { handle: 'taboronbase', followersK: 25, tier: 'C' },
  { handle: 'MoonOverlord', followersK: 220, tier: 'C' },
  { handle: 'crypto_bitlord7', followersK: 330, tier: 'C' },
  { handle: 'HsakaTrades', followersK: 490, tier: 'C' },
  { handle: 'EmberCN', followersK: 150, tier: 'C' },
  { handle: 'AutismCapital', followersK: 490, tier: 'C' },
  { handle: 'GCRClassic', followersK: 560, tier: 'C' },
  { handle: 'CryptoBanter', followersK: 800, tier: 'C' },
] as const;

const MAX_QUERY_LENGTH = 512;

export function buildSearchBatches(targets: readonly MonitorTarget[]): string[][] {
  const batches: string[][] = [];
  let currentBatch: string[] = [];

  for (const target of targets) {
    const testQuery = buildSearchQuery([...currentBatch, target.handle]);
    if (testQuery.length > MAX_QUERY_LENGTH && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [target.handle];
    } else {
      currentBatch.push(target.handle);
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

export function buildSearchQuery(handles: string[]): string {
  return handles.map((h) => `from:${h}`).join(' OR ');
}

export function buildTargetMap(targets: readonly MonitorTarget[]): Map<string, MonitorTarget> {
  const map = new Map<string, MonitorTarget>();
  for (const target of targets) {
    map.set(target.handle.toLowerCase(), target);
  }
  return map;
}
