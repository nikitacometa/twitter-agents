/**
 * Phase 2: Deep research + story mining.
 *
 * Single Opus call with Perplexity MCP, WebSearch, and Bash(curl).
 * Takes raw data from Phase 1, researches broader context,
 * clusters into stories, verifies facts, rates roastability.
 */

import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { NewsEvent, ResearchOutput, NewsStory } from './types.js';
import type { DexScreenerToken, CoinGeckoMarketItem } from '@farm/target-discoverer.js';
import { getErrorMessage } from '@common/utils/error.util.js';

// --- Data formatting for LLM context ---

function formatMonitorTweets(events: NewsEvent[]): string {
  if (events.length === 0) return '(no monitor tweets accumulated)';

  return events.map((e, i) => {
    const ageHours = Math.round((Date.now() - new Date(e.createdAt).getTime()) / 3_600_000);
    const age = ageHours < 1 ? '<1h ago' : `${String(ageHours)}h ago`;
    return `[${String(i + 1)}] @${e.authorHandle} (${e.authorTier}-tier, ${String(e.followersK)}K) — ${age}, score ${String(e.monitorScore)}${e.isReply ? ' [reply]' : ''}\n"${e.tweetText}"`;
  }).join('\n\n');
}

function formatDexScreener(tokens: DexScreenerToken[]): string {
  if (tokens.length === 0) return '(no DexScreener data)';

  const baseTokens = tokens.filter((t) => t.chainId === 'base');
  const others = tokens.filter((t) => t.chainId !== 'base');

  const lines: string[] = [];
  if (baseTokens.length > 0) {
    lines.push('Base chain:');
    for (const t of baseTokens.slice(0, 10)) {
      const boosts = t.totalAmount ? `, ${String(t.totalAmount)} boosts` : '';
      lines.push(`- ${t.description?.slice(0, 60) ?? t.tokenAddress} (${t.url})${boosts}`);
    }
  }
  if (others.length > 0) {
    lines.push('Other chains:');
    for (const t of others.slice(0, 5)) {
      lines.push(`- ${t.description?.slice(0, 60) ?? t.tokenAddress} (${t.chainId})`);
    }
  }

  return lines.join('\n');
}

function formatCoinGecko(items: CoinGeckoMarketItem[]): string {
  if (items.length === 0) return '(no CoinGecko data)';

  return items.slice(0, 15).map((item) => {
    const price = item.current_price !== null ? `$${String(item.current_price)}` : '?';
    const change = item.price_change_percentage_24h !== null
      ? `${item.price_change_percentage_24h >= 0 ? '+' : ''}${item.price_change_percentage_24h.toFixed(1)}%`
      : '?';
    const vol = item.total_volume !== null
      ? `vol $${formatLargeNum(item.total_volume)}`
      : '';
    return `- ${item.name} (${item.symbol.toUpperCase()}): ${price} (${change}) ${vol}`;
  }).join('\n');
}

function formatLargeNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

// --- Research prompt ---

function buildResearchPrompt(
  events: NewsEvent[],
  dexTokens: DexScreenerToken[],
  geckoItems: CoinGeckoMarketItem[],
): string {
  const monitorSection = formatMonitorTweets(events);
  const dexSection = formatDexScreener(dexTokens);
  const geckoSection = formatCoinGecko(geckoItems);

  return `You are 0xBeef's news intelligence engine. Your job: find the most roastable stories from the last 24 hours in the Base ecosystem and broader crypto.

## YOUR DATA

### MONITOR TWEETS (last 24h from 57 Base ecosystem accounts)
${monitorSection}

### DEXSCREENER TRENDING (Base chain focus)
${dexSection}

### COINGECKO MOVERS (top volume, market context)
${geckoSection}

## RESEARCH INSTRUCTIONS

STEP 1: Use Perplexity to research what happened in crypto in the last 24 hours. Focus on:
- Base chain: protocol launches, governance drama, TVL changes, partnerships
- Coinbase: regulatory news, product updates, executive statements
- AI agents on Base: Virtuals, AIXBT, new agent launches
- Major crypto events that Base community discusses (ETH upgrades, SEC, hacks)
- KOL drama: hot takes that got ratio'd, predictions that aged badly, feuds

STEP 2: Cross-reference your research with the monitor tweets above.
- Which tweets reference stories you found?
- Which tweets ARE the story? (e.g., a KOL's hot take is itself the news)
- Any tweets contradicting each other about the same event?
- Any tweets making claims your research can't verify?

STEP 3: Use WebSearch or curl to verify specific claims:
- TVL numbers → check DefiLlama (curl https://api.llama.fi/v2/chains)
- Token prices → check DexScreener or CoinGecko
- Protocol claims → check their docs/announcements
- Any suspiciously round numbers or unverifiable superlatives

STEP 4: Identify and rank stories.

## STORY ANALYSIS CRITERIA

### Importance (for Base ecosystem audience)
10: Directly affects Base users' money (hack, exploit, major protocol change)
7-9: Significant ecosystem event (major launch, Coinbase announcement, governance vote)
4-6: Notable but not urgent (KOL take, partnership, minor protocol update)
1-3: Noise (generic market commentary, routine update)

### Factual Confidence
- HIGH: verified across 2+ independent sources
- MEDIUM: single authoritative source or official announcement
- LOW: single tweet, unverified claim, rumor
- SKIP if LOW and importance < 7

### Roastability (1-10)
10: Hypocrisy exposed (said X, data shows Y). Gold standard.
8-9: Bold claim meets embarrassing reality (TVL, price, usage metrics)
6-7: Amusing failure, questionable decision, overpromise
4-5: Mildly funny observation, decent quote-flip material
1-3: Not roastable (factual reporting, positive news, too technical)

### Ammunition Required Per Story
Every selected story MUST include:
1. **Target**: exact @handle or project name to roast
2. **The claim**: what they said/did (direct quote preferred)
3. **The reality**: what data/facts contradict or undermine it
4. **Numbers**: specific metrics that make the roast hit (TVL, price, holders, volume)
5. **Angle suggestion**: which roast technique fits (QUOTE_FLIP, DATA_BOMB, HYPOCRISY, BATHOS, IRONIC_REVERSAL, RULE_OF_THREE)
6. **Source tweet link**: for attribution

## WHAT TO SKIP
- Hacks/exploits where retail lost money (don't punch down)
- Generic BTC/ETH price commentary (boring, everyone covers it)
- News older than 24h with no fresh developments
- Positive-only news with nothing to roast

## OUTPUT FORMAT (strict JSON, no markdown wrapping)
{
  "researchSummary": "2-3 paragraph overview of the day's most significant events",
  "marketContext": "BTC $67.4K (+2.1%), ETH $3.2K (-0.5%), Base TVL $3.9B",
  "stories": [
    {
      "storyId": "aerodrome-v4-tvl-reality",
      "label": "Aerodrome hypes v4 launch but TVL barely budged",
      "importance": 8,
      "roastability": 9,
      "factualConfidence": "high",
      "target": "@AerodromeFi",
      "keyFacts": [
        "Aerodrome launched v4 with 've(3,3) redesigned from scratch'",
        "TVL went from $1.98B to $2.01B (+1.5%) — not the revolution they claimed"
      ],
      "ammunition": {
        "quotes": ["This changes everything for Base DeFi — @AerodromeFi"],
        "contradictions": ["'Changes everything' = +1.5% TVL in 4 hours"],
        "numbers": ["$2.01B TVL (was $1.98B)"],
        "targetHandle": "AerodromeFi"
      },
      "suggestedAngles": ["BATHOS", "QUOTE_FLIP"],
      "sourceTweetIds": [],
      "sourceUrl": null
    }
  ]
}

Select TOP 5 stories. Sort by: roastability × importance × factualConfidence weight (HIGH=1.0, MEDIUM=0.7, LOW=0.4).
If fewer than 3 stories score roastability >= 6, include lower-scored ones with a note.`;
}

// --- JSON parsing ---

function parseResearchOutput(data: unknown): ResearchOutput | null {
  let obj: Record<string, unknown>;

  if (typeof data === 'string') {
    const cleaned = data.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof data === 'object' && data !== null) {
    const wrapper = data as Record<string, unknown>;
    if (typeof wrapper['text'] === 'string') {
      return parseResearchOutput(wrapper['text']);
    }
    obj = wrapper;
  } else {
    return null;
  }

  const researchSummary = typeof obj['researchSummary'] === 'string' ? obj['researchSummary'] : '';
  const marketContext = typeof obj['marketContext'] === 'string' ? obj['marketContext'] : '';

  if (!Array.isArray(obj['stories'])) return null;

  const stories: NewsStory[] = [];
  for (const raw of obj['stories'] as Array<Record<string, unknown>>) {
    const story = parseStory(raw);
    if (story) stories.push(story);
  }

  if (stories.length === 0) return null;

  return { researchSummary, marketContext, stories };
}

function parseStory(raw: Record<string, unknown>): NewsStory | null {
  if (typeof raw['storyId'] !== 'string' || typeof raw['label'] !== 'string') return null;
  if (typeof raw['target'] !== 'string') return null;

  const ammunition = raw['ammunition'] as Record<string, unknown> | undefined;

  return {
    storyId: raw['storyId'],
    label: raw['label'],
    importance: typeof raw['importance'] === 'number' ? raw['importance'] : 5,
    roastability: typeof raw['roastability'] === 'number' ? raw['roastability'] : 5,
    factualConfidence: parseConfidence(raw['factualConfidence']),
    target: raw['target'],
    keyFacts: Array.isArray(raw['keyFacts']) ? (raw['keyFacts'] as string[]).filter((f) => typeof f === 'string') : [],
    ammunition: {
      quotes: Array.isArray(ammunition?.['quotes']) ? (ammunition['quotes'] as string[]).filter((q) => typeof q === 'string') : [],
      contradictions: Array.isArray(ammunition?.['contradictions']) ? (ammunition['contradictions'] as string[]).filter((c) => typeof c === 'string') : [],
      numbers: Array.isArray(ammunition?.['numbers']) ? (ammunition['numbers'] as string[]).filter((n) => typeof n === 'string') : [],
      targetHandle: typeof ammunition?.['targetHandle'] === 'string' ? ammunition['targetHandle'] : raw['target'].replace('@', ''),
    },
    suggestedAngles: Array.isArray(raw['suggestedAngles']) ? (raw['suggestedAngles'] as string[]).filter((a) => typeof a === 'string') : [],
    sourceTweetIds: Array.isArray(raw['sourceTweetIds']) ? (raw['sourceTweetIds'] as string[]).map(String) : [],
    sourceUrl: typeof raw['sourceUrl'] === 'string' ? raw['sourceUrl'] : null,
  };
}

function parseConfidence(val: unknown): 'high' | 'medium' | 'low' {
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (lower === 'high') return 'high';
    if (lower === 'medium') return 'medium';
  }
  return 'low';
}

// --- Main research function ---

export async function runNewsResearch(opts: {
  provider: ProviderManager;
  logger: Logger;
  events: NewsEvent[];
  dexTokens: DexScreenerToken[];
  geckoItems: CoinGeckoMarketItem[];
}): Promise<ResearchOutput> {
  const { provider, logger, events, dexTokens, geckoItems } = opts;

  const prompt = buildResearchPrompt(events, dexTokens, geckoItems);
  const taskId = `news-research-${Date.now()}`;

  logger.info(
    { events: events.length, dexTokens: dexTokens.length, geckoItems: geckoItems.length },
    'Starting news research (Phase 2)',
  );

  const result = await provider.run<string>(taskId, {
    prompt,
    profile: 'news-research',
    requiresResearch: true,
  });

  const parsed = parseResearchOutput(result.data);
  if (!parsed) {
    throw new Error(`Failed to parse research output: ${typeof result.data === 'string' ? result.data.slice(0, 200) : 'non-string'}`);
  }

  logger.info(
    { stories: parsed.stories.length, durationMs: result.durationMs },
    `News research complete: ${String(parsed.stories.length)} stories found`,
  );

  return parsed;
}

// --- Fallback: lightweight research without Opus ---

export async function runNewsResearchFallback(opts: {
  provider: ProviderManager;
  logger: Logger;
  events: NewsEvent[];
}): Promise<ResearchOutput> {
  const { provider, logger, events } = opts;

  // Simple clustering by author + keyword overlap, no external research
  logger.warn('Running fallback research (no Opus) — reduced quality');

  const prompt = `You are 0xBeef's news analyst. Cluster these tweets into stories and rate roastability.

## TWEETS
${formatMonitorTweets(events)}

## TASK
1. Group related tweets into stories (same event/topic).
2. For each story: label, target @handle, key facts, roastability (1-10).
3. Select top 5 most roastable stories.

## OUTPUT FORMAT (strict JSON, no markdown wrapping)
{
  "researchSummary": "brief summary",
  "marketContext": "unknown — no market data available",
  "stories": [
    {
      "storyId": "story-slug",
      "label": "story description",
      "importance": 5,
      "roastability": 7,
      "factualConfidence": "medium",
      "target": "@handle",
      "keyFacts": ["fact1", "fact2"],
      "ammunition": { "quotes": [], "contradictions": [], "numbers": [], "targetHandle": "handle" },
      "suggestedAngles": ["QUOTE_FLIP"],
      "sourceTweetIds": [],
      "sourceUrl": null
    }
  ]
}`;

  const taskId = `news-research-fallback-${Date.now()}`;
  const result = await provider.run<string>(taskId, {
    prompt,
    profile: 'roast-lightning',
    requiresResearch: false,
  });

  const parsed = parseResearchOutput(result.data);
  if (!parsed) {
    throw new Error('Fallback research failed to produce valid output');
  }

  return parsed;
}

export { buildResearchPrompt, parseResearchOutput, formatMonitorTweets };
