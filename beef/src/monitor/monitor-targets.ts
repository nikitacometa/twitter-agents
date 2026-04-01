export type MonitorTier = 'S' | 'A' | 'B' | 'C';
export type MonitorCategory = 'base';

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
  { handle: 'OndoFinance', followersK: 367, tier: 'A', category: 'base' },

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
  { handle: 'clanker_world', followersK: 34, tier: 'C', category: 'base' },
  { handle: 'iamheci', followersK: 38, tier: 'B', category: 'base' },
  { handle: 'drewcoffman', followersK: 21, tier: 'B', category: 'base' },
  { handle: '_proxystudio', followersK: 20, tier: 'B', category: 'base' },
  { handle: 'toady_hawk', followersK: 18, tier: 'B', category: 'base' },
  { handle: 'CryptoStatuette', followersK: 12, tier: 'B', category: 'base' },
  { handle: 'goyabean_eth', followersK: 11, tier: 'B', category: 'base' },
  { handle: 'apex_ether', followersK: 8, tier: 'B', category: 'base' },
  { handle: 'ethermage', followersK: 30, tier: 'B', category: 'base' },
  { handle: 'GMX_IO', followersK: 225, tier: 'B', category: 'base' },
  { handle: 'beefyfinance', followersK: 260, tier: 'B', category: 'base' },
  { handle: 'pendle_fi', followersK: 160, tier: 'B', category: 'base' },
  { handle: 'OriginProtocol', followersK: 166, tier: 'B', category: 'base' },
  { handle: 'odosprotocol', followersK: 243, tier: 'B', category: 'base' },
  { handle: 'trylimitless', followersK: 97, tier: 'B', category: 'base' },
  { handle: 'jacek0x', followersK: 69, tier: 'B', category: 'base' },

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
  { handle: '0xfluid', followersK: 40, tier: 'C', category: 'base' },
  { handle: 'Vader_AI_', followersK: 39, tier: 'C', category: 'base' },
  { handle: 'ExtraFi_io', followersK: 20, tier: 'C', category: 'base' },
  { handle: 'overnight_fi', followersK: 20, tier: 'C', category: 'base' },
  { handle: '0xalixbtno', followersK: 4, tier: 'C', category: 'base' },
  { handle: 'kennyistyping', followersK: 3, tier: 'C', category: 'base' },
  { handle: 'darkohh', followersK: 2, tier: 'C', category: 'base' },
  { handle: 'AlienBaseDex', followersK: 11, tier: 'C', category: 'base' },
] as const;

const MAX_QUERY_LENGTH = 512;

export interface SearchBatch {
  handles: string[];
  category: MonitorCategory;
}

export function buildSearchBatches(targets: readonly MonitorTarget[]): SearchBatch[] {
  const baseTargets = targets.filter((t) => t.category === 'base');

  return buildCategoryBatches(baseTargets, 'base');
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

export function buildSearchQuery(handles: string[], _category: MonitorCategory): string {
  const fromClauses = handles.map((h) => `from:${h}`).join(' OR ');
  return `(${fromClauses}) -is:retweet`;
}

export function buildTargetMap(targets: readonly MonitorTarget[]): Map<string, MonitorTarget> {
  const map = new Map<string, MonitorTarget>();
  for (const target of targets) {
    map.set(target.handle.toLowerCase(), target);
  }
  return map;
}
