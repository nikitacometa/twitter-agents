export type MonitorTier = 'S' | 'A' | 'B' | 'C';
export type MonitorCategory = 'base' | 'general';

export interface MonitorTarget {
  handle: string;
  followersK: number;
  tier: MonitorTier;
  category: MonitorCategory;
}

export const TIER_SCORES: Record<MonitorTier, number> = { S: 10, A: 8, B: 5, C: 3 };

export const MONITOR_TARGETS: readonly MonitorTarget[] = [
  // ──────────────────────────────────────────────
  // BASE ECOSYSTEM — core team, DeFi, AI agents, memecoins
  // ──────────────────────────────────────────────

  // S-tier Base — ecosystem leaders, every tweet matters
  { handle: 'jessepollak', followersK: 150, tier: 'S', category: 'base' },
  { handle: 'AerodromeFi', followersK: 127, tier: 'S', category: 'base' },
  { handle: 'virtuals_io', followersK: 281, tier: 'S', category: 'base' },

  // A-tier Base — official accounts, major protocols, AI agent leaders
  { handle: 'base', followersK: 500, tier: 'A', category: 'base' },
  { handle: 'BuildOnBase', followersK: 200, tier: 'A', category: 'base' },
  { handle: 'aixbt_agent', followersK: 400, tier: 'A', category: 'base' },
  { handle: 'coinbase', followersK: 1500, tier: 'A', category: 'base' },
  { handle: 'MoonwellDeFi', followersK: 55, tier: 'A', category: 'base' },
  { handle: 'zaboronbase', followersK: 180, tier: 'A', category: 'base' },
  { handle: 'KaitoAI', followersK: 418, tier: 'A', category: 'base' },
  { handle: 'farcaster_xyz', followersK: 231, tier: 'A', category: 'base' },
  { handle: 'elizaOS', followersK: 145, tier: 'A', category: 'base' },

  // B-tier Base — social, memecoins, DeFi, AI agents, KOLs
  { handle: 'faboronbase', followersK: 100, tier: 'B', category: 'base' },
  { handle: 'degentokenbase', followersK: 150, tier: 'B', category: 'base' },
  { handle: 'BasedBrett', followersK: 150, tier: 'B', category: 'base' },
  { handle: 'caboronbase', followersK: 60, tier: 'B', category: 'base' },
  { handle: 'MorphoLabs', followersK: 80, tier: 'B', category: 'base' },
  { handle: 'dwr', followersK: 80, tier: 'B', category: 'base' },
  { handle: 'brian_armstrong', followersK: 1700, tier: 'B', category: 'base' },
  { handle: 'Bankless', followersK: 344, tier: 'B', category: 'base' },
  { handle: 'zora', followersK: 280, tier: 'B', category: 'base' },
  { handle: 'truth_terminal', followersK: 246, tier: 'B', category: 'base' },
  { handle: 'DefiantNews', followersK: 211, tier: 'B', category: 'base' },
  { handle: 'cookiedotfun', followersK: 194, tier: 'B', category: 'base' },
  { handle: 'shawmakesmagic', followersK: 164, tier: 'B', category: 'base' },
  { handle: 'Spectral_Labs', followersK: 163, tier: 'B', category: 'base' },
  { handle: 'NousResearch', followersK: 100, tier: 'B', category: 'base' },
  { handle: 'CoinbaseDev', followersK: 61, tier: 'B', category: 'base' },
  { handle: 'luna_virtuals', followersK: 51, tier: 'B', category: 'base' },
  { handle: 'dolos_diary', followersK: 37, tier: 'B', category: 'base' },
  { handle: 'clanker_world', followersK: 34, tier: 'B', category: 'base' },
  { handle: 'ethermage', followersK: 30, tier: 'B', category: 'base' },

  // C-tier Base — niche protocols, smaller projects, researchers
  { handle: 'Toshi_base', followersK: 40, tier: 'C', category: 'base' },
  { handle: 'SeamlessFi', followersK: 30, tier: 'C', category: 'base' },
  { handle: 'AcrossProtocol', followersK: 50, tier: 'C', category: 'base' },
  { handle: 'PoolTogether', followersK: 40, tier: 'C', category: 'base' },
  { handle: 'BaseSwap_fi', followersK: 30, tier: 'C', category: 'base' },
  { handle: 'goldfinch_fi', followersK: 73, tier: 'C', category: 'base' },
  { handle: 'tengyanAI', followersK: 43, tier: 'C', category: 'base' },
  { handle: 'HighCoinviction', followersK: 38, tier: 'C', category: 'base' },
  { handle: 'BaseChain_News', followersK: 6, tier: 'C', category: 'base' },

  // ──────────────────────────────────────────────
  // GENERAL CRYPTO — news, KOLs, analysts
  // ──────────────────────────────────────────────

  // S-tier General — massive reach
  { handle: 'VitalikButerin', followersK: 5600, tier: 'S', category: 'general' },
  { handle: 'CoinDesk', followersK: 2800, tier: 'S', category: 'general' },

  // A-tier General — high-value crypto accounts
  { handle: 'WatcherGuru', followersK: 3900, tier: 'A', category: 'general' },
  { handle: 'Cointelegraph', followersK: 2500, tier: 'A', category: 'general' },
  { handle: 'CryptoWizardd', followersK: 510, tier: 'A', category: 'general' },
  { handle: 'AltcoinGordon', followersK: 700, tier: 'A', category: 'general' },
  { handle: 'ZssBecker', followersK: 800, tier: 'A', category: 'general' },

  // B-tier General — solid crypto voices
  { handle: 'CryptoGodJohn', followersK: 1300, tier: 'B', category: 'general' },
  { handle: 'DegenSpartan', followersK: 210, tier: 'B', category: 'general' },
  { handle: 'lookonchain', followersK: 1500, tier: 'B', category: 'general' },
  { handle: 'theblock__', followersK: 700, tier: 'B', category: 'general' },
  { handle: 'zachxbt', followersK: 680, tier: 'B', category: 'general' },
  { handle: 'DylanLeClair_', followersK: 380, tier: 'B', category: 'general' },

  // C-tier General — niche analysts
  { handle: 'AutismCapital', followersK: 490, tier: 'C', category: 'general' },
  { handle: 'GCRClassic', followersK: 560, tier: 'C', category: 'general' },
  { handle: 'HsakaTrades', followersK: 490, tier: 'C', category: 'general' },
  { handle: 'tier10k', followersK: 320, tier: 'C', category: 'general' },
  { handle: 'EmberCN', followersK: 150, tier: 'C', category: 'general' },
] as const;

const MAX_QUERY_LENGTH = 512;

export interface SearchBatch {
  handles: string[];
  category: MonitorCategory;
}

export function buildSearchBatches(targets: readonly MonitorTarget[]): SearchBatch[] {
  const baseTargets = targets.filter((t) => t.category === 'base');
  const generalTargets = targets.filter((t) => t.category === 'general');

  return [
    ...buildCategoryBatches(baseTargets, 'base'),
    ...buildCategoryBatches(generalTargets, 'general'),
  ];
}

function buildCategoryBatches(targets: readonly MonitorTarget[], category: MonitorCategory): SearchBatch[] {
  const batches: SearchBatch[] = [];
  let currentHandles: string[] = [];

  for (const target of targets) {
    const testQuery = buildSearchQuery([...currentHandles, target.handle], category);
    if (testQuery.length > MAX_QUERY_LENGTH && currentHandles.length > 0) {
      batches.push({ handles: currentHandles, category });
      currentHandles = [target.handle];
    } else {
      currentHandles.push(target.handle);
    }
  }

  if (currentHandles.length > 0) {
    batches.push({ handles: currentHandles, category });
  }

  return batches;
}

export function buildSearchQuery(handles: string[], category: MonitorCategory): string {
  const fromClauses = handles.map((h) => `from:${h}`).join(' OR ');
  // Base accounts engage primarily via replies — include them for richer content
  // General accounts (news, KOLs) — filter replies to get headlines only
  const filters = category === 'base' ? '-is:retweet' : '-is:reply -is:retweet';
  return `(${fromClauses}) ${filters}`;
}

export function buildTargetMap(targets: readonly MonitorTarget[]): Map<string, MonitorTarget> {
  const map = new Map<string, MonitorTarget>();
  for (const target of targets) {
    map.set(target.handle.toLowerCase(), target);
  }
  return map;
}
