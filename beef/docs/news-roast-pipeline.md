# News Roast Pipeline v2 — Design Document

## Summary

`/news` admin command: активно собирает новости из 4 источников, исследует через Perplexity, кластеризует в stories, верифицирует факты, генерирует premium-quality роусты (Opus + Sonnet параллельно), оценивает 5-judge панелью, отправляет top-5 в Telegram.

Запускается 1 раз в день. Каждый роуст — standalone tweet для прямой публикации.

## Problem

33 фолловера, 209 твитов. Reply-guy даёт видимость в чужих тредах, но не строит identity. Нужен оригинальный контент — новостные роусты, которые:
- Показывают, что бот в курсе происходящего (current affairs = relevance)
- Строят TweepCred через original content (алгоритм даёт приоритет)
- Формируют узнаваемый голос ("the bot that roasted X when it happened")

AIXBT: 300K+ подписчиков через hourly оригинальные посты + 2000 replies/день. У нас replies есть — оригинального контента нет. News roast заполняет этот пробел.

## Architecture v2

```
┌────────────────────────────────────────────────────────────────────┐
│                     PASSIVE LAYER (continuous)                      │
│                                                                    │
│  Timeline Monitor (10 min poll) ──→ news_events table              │
│  57 Base accounts, score ≥ 12       (accumulates 40-80 tweets/day) │
└────────────────────────────────────────────────────────────────────┘

                          /news command
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: DATA GATHERING (~30s, all parallel)                   │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐│
│  │ news_events   │  │ Fresh monitor│  │ DexScreener trending  ││
│  │ DB read (24h) │  │ poll if stale│  │ + CoinGecko movers    ││
│  └──────┬───────┘  └──────┬───────┘  └────────────┬───────────┘│
│         └─────────────────┼───────────────────────┘            │
│                           ▼                                     │
│                    Raw data pool                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: DEEP RESEARCH + STORY MINING (1 Opus call, 3-5 min)  │
│                                                                 │
│  Opus + Perplexity MCP + WebSearch + Bash(curl)                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. Research Base ecosystem news via Perplexity (24h)    │    │
│  │ 2. Cross-reference with monitor tweets                  │    │
│  │ 3. Cluster into stories (narratives/events)             │    │
│  │ 4. Verify key facts across sources                      │    │
│  │ 5. Assess importance for Base audience                  │    │
│  │ 6. Rate roastability with reasoning                     │    │
│  │ 7. Provide ammunition per story                         │    │
│  │ 8. Select top 5                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│  Output: researchSummary + 5 stories with facts + ammunition    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ top 5 stories
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: PARALLEL ROAST GENERATION (~5 min)                    │
│                                                                 │
│  Slot 1 ─────────────────────────────────────────────────────── │
│  │ Opus call: all 5 stories, 5 variants each = 25 variants   │ │
│  │ Profile: roast-power (Opus, high, Perplexity, 15 turns)   │ │
│  │ Deep research per story, cross-story awareness             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Slot 2 ─────────────────────────────────────────────────────── │
│  │ 5× Sonnet Lightning: 1 per story, 10 variants each = 50   │ │
│  │ 10 personas (Surgeon→Chaos Agent), mutations, self-scoring │ │
│  │ Sequential (30s each), fills slot while Opus runs          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Raw output: 25 Opus + 50 Sonnet = 75 candidates                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: FILTER + EVALUATE (~2-3 min)                          │
│                                                                 │
│  preFilter → filterRoast → jaccardDedup(0.6) → ~30 candidates   │
│  rankBatch (1 Sonnet call) → scored + sorted                    │
│  Serious eval (5 judges) on top 8 → final ranking               │
│  Top 5 selected, diverse stories enforced                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ top 5 roasts
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 5: NOTIFY + STORE                                        │
│                                                                 │
│  Telegram: story context + roast + scores + source link          │
│  Stockpile: top variants promoted (status: 'available')          │
│  news_digests: pipeline metrics logged                           │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Data Gathering

### Sources (all fetched in parallel)

| Source | What it provides | How | Latency |
|--------|-----------------|-----|---------|
| `news_events` DB | Monitor tweets scored ≥ 12, accumulated passively | SQLite read | instant |
| Fresh monitor poll | Latest tweets if last poll > 30 min ago | `monitor.poll()` | ~30s |
| DexScreener | Trending tokens on Base chain (boosts, volume spikes) | `curl` via `fetchDexScreenerTrending()` (already implemented in target-discoverer) | ~1s |
| CoinGecko | Top volume movers, market-wide context | `curl` via `fetchCoinGeckoTopMovers()` (already implemented) | ~1s |

**Why not RSS/CryptoPanic now:** Perplexity в Phase 2 уже агрегирует Cointelegraph, Decrypt, The Block, CoinDesk и десятки других источников. Отдельный RSS-парсер добавляет complexity без существенного gain. Если Perplexity окажется недостаточной — добавим в Iteration 2.

### News Accumulator (passive, continuous)

Hook в timeline monitor. Каждый poll сохраняет твиты с `score >= 12` в `news_events`.

```typescript
// Timeline monitor hook (in doPoll, after scoring):
for (const scored of allScored) {
  if (scored.score >= NEWS_ACCUMULATE_THRESHOLD) {
    this.newsEventRepo.upsert({
      tweetId: scored.tweetId,
      authorHandle: scored.authorHandle,
      authorTier: scored.tier,
      tweetText: scored.text,
      tweetUrl: scored.tweetUrl,
      monitorScore: scored.score,
      followersK: scored.followersK,
      isReply: scored.isReply,
    });
  }
}
```

**Threshold `score >= 12`**: фильтрует C-tier шум (max score 9), сохраняет все S/A + B-tier с topic match. Ожидаемый объём: 40-80 tweets/day.

### Data Format for Phase 2

Все источники сливаются в единый контекст для Opus:

```
## MONITOR TWEETS (last 24h from 57 Base ecosystem accounts)
[1] @jessepollak (S-tier, 150K) — 2h ago, score 22
"Just shipped the biggest Base upgrade this year. Onchain summer isn't a season, it's a lifestyle."

[2] @AerodromeFi (S-tier, 127K) — 4h ago, score 18
"Aerodrome v4 is live. ve(3,3) redesigned from scratch. This changes everything for Base DeFi."

... (40-80 tweets)

## DEXSCREENER TRENDING (Base chain, last 24h)
- $VIRTUAL: +34% (24h vol: $12M), boosted 5x
- $AERO: +8% (24h vol: $45M)
- $BRETT: -12% (24h vol: $3M), declining volume
...

## COINGECKO MOVERS (top volume, market context)
- BTC: $67,400 (+2.1%)
- ETH: $3,210 (-0.5%)
- Base TVL: $3.9B (no change)
...
```

## Phase 2: Deep Research + Story Mining

**Единый Opus-вызов** с Perplexity MCP, WebSearch, и Bash(curl). Это центральное звено pipeline — качество stories определяет качество роустов.

### Profile

```typescript
// New profile: 'news-research'
{
  model: 'opus',
  effort: 'high',
  tools: [...RESEARCH_TOOLS, 'Bash(curl:*)'],  // Perplexity + WebSearch + WebFetch + curl
  maxTurns: 15,
  timeoutMs: 5 * 60 * 1000,  // 5 min (shorter than farm-generate's 30 min — news is time-sensitive)
}
```

### Prompt

```
You are 0xBeef's news intelligence engine. Your job: find the most roastable stories from the last 24 hours in the Base ecosystem and broader crypto.

## YOUR DATA
{Phase 1 combined context — monitor tweets, DexScreener, CoinGecko}

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
5. **Angle suggestion**: which roast technique fits (QUOTE_FLIP, DATA_BOMB, HYPOCRISY, etc.)
6. **Source tweet link**: for attribution

## WHAT TO SKIP
- Hacks/exploits where retail lost money (don't punch down)
- Generic BTC/ETH price commentary (boring, everyone covers it)
- News older than 24h with no fresh developments
- Stories we already roasted (check against previously used stories if provided)

## OUTPUT FORMAT (strict JSON)
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
        "TVL went from $1.98B to $2.01B (+1.5%) — not the revolution they claimed",
        "Jesse Pollak endorsed it within 30 minutes of launch"
      ],
      "ammunition": {
        "quotes": ["\"This changes everything for Base DeFi\" — @AerodromeFi, 4h ago"],
        "contradictions": ["'Changes everything' = +1.5% TVL in 4 hours"],
        "numbers": ["$2.01B TVL (was $1.98B)", "ve(3,3) v4 vs v3: gas costs identical"],
        "targetHandle": "AerodromeFi"
      },
      "suggestedAngles": ["BATHOS", "QUOTE_FLIP"],
      "sourceTweetIds": ["2", "7"],
      "sourceUrl": "https://x.com/AerodromeFi/status/..."
    }
  ]
}

Select TOP 5 stories. Sort by: roastability × importance × factualConfidence weight (HIGH=1.0, MEDIUM=0.7, LOW=0.4).
If fewer than 3 stories score roastability ≥ 6, include lower-scored ones with a note.
```

### Why one Opus call instead of separate clustering + scoring

v1 had: Sonnet clustering → programmatic scoring → Sonnet generation. Three cheap steps.
v2 has: one Opus call with research tools. More expensive in time (~3-5 min), but:

1. **Research enables verification.** Sonnet clustering can't fact-check claims. Opus + Perplexity can verify TVL numbers, cross-reference announcements, catch fabrications.
2. **Context window.** One call sees ALL data simultaneously — finds connections Sonnet would miss between tweets from different accounts about the same event.
3. **Reasoning depth.** Opus rates roastability with genuine understanding of what's funny, not keyword matching. It knows that "$2B TVL → $2.01B" is funnier than "$1B TVL → $1.5B."
4. **Ammunition quality.** Opus produces specific, usable ammunition (exact quotes, numbers), not generic "this could be roasted."

## Phase 3: Parallel Roast Generation

Two concurrent legs using the provider's 2 slots:

### Leg A: Opus Deep Generation (Slot 1, ~3-5 min)

Single Opus call generating roasts for ALL 5 stories. Cross-story awareness prevents overlap.

**Profile:** `roast-power` (Opus, high effort, research tools, 15 turns, 1800s timeout)

```
You are 0xBeef — the most savage crypto roast bot on Base. Below are 5 news stories with verified facts and ammunition. Your job: generate the BEST possible standalone roasts.

## STORIES + AMMUNITION
{Phase 2 JSON output — all 5 stories}

## MARKET CONTEXT
{Phase 2 marketContext}

## GENERATION RULES

For EACH story, generate 5 variants. Use the following angle distribution:
1. YOUR BEST SHOT — whichever angle hits hardest for this story
2. QUOTE_FLIP — use their own words against them (quote from ammunition.quotes)
3. DATA_BOMB — lead with the most devastating number
4. {story.suggestedAngles[0]} — use the angle suggested by research
5. FREESTYLE — combine any techniques, maximum creativity

## FORMAT RULES (CRITICAL — violating these = instant reject)
- STANDALONE tweet. Reader has ZERO context about the story.
- Name the target in the FIRST 5 WORDS: "aerodrome shipped v4 and..."
- 80-200 chars. Sweet spot: 100-160. Over 200 = cut.
- 3rd person always. "Aerodrome's new..." NOT "your new..."
- Max 2 sentences. Setup + punchline. The punchline must work in isolation.
- ONE core idea per roast — max 2 data points.
- Self-contained: funny without clicking any link or knowing the backstory.

## ADDITIONAL RESEARCH
You have research tools. For each story, you MAY:
- Verify an additional fact via WebSearch
- Check a live price or TVL via curl
- Find a better quote from the target's recent tweets
DO THIS ONLY if it strengthens the roast. Don't research just to research.

## SELF-SCORE each variant 1-5:
5 = "stop scrolling" funny, specific data, perfect punchline
4 = solid roast, could go semi-viral
3 = decent but forgettable
2 = generic or too long
1 = not funny

## OUTPUT
{
  "variants": [
    { "storyId": "...", "text": "...", "angle": "...", "selfScore": 4.2 }
  ]
}

25 variants total (5 per story). Exclude anything you'd self-score below 3.
```

### Leg B: Sonnet Lightning Diversity (Slot 2, ~2.5 min total)

5 sequential Lightning calls, 1 per story, 10 variants each. Same proven Lightning system: 10 personas (Surgeon, CT Native, Comedian, Psychopath, Chaos Agent, Forensic Analyst, Group Chat King, Therapist, VC Partner, Reality Show Host) + mutations at slots 2/5/8 + self-scoring.

**Profile:** `news-lightning` (new, based on `roast-lightning`)

```typescript
// Per-story call (slot 2, runs while Opus works in slot 1):
for (const story of topStories) {
  const context = buildNewsLightningContext(story);  // story label + keyFacts + ammunition
  await provider.run(taskId, {
    profile: 'news-lightning',
    prompt: buildLightningPrompt({
      targetName: story.target,
      userContext: context,
      standalone: true,  // triggers 3rd-person, naming-first format rules
    }),
  });
}
```

**Key difference from standard Lightning:** `standalone: true` flag adds format rules for standalone tweet (name target first, 3rd person, self-contained).

### Concurrency Model

Provider `maxConcurrent = 2`:

```
t=0:     [Opus gen starts (slot 1)] + [Sonnet story-1 starts (slot 2)]
t=30s:                                 [Sonnet story-1 done → story-2 starts]
t=60s:                                 [Sonnet story-2 done → story-3 starts]
t=90s:                                 [Sonnet story-3 done → story-4 starts]
t=120s:                                [Sonnet story-4 done → story-5 starts]
t=150s:                                [Sonnet story-5 done]
t=180-300s: [Opus gen finishes]
```

Total Phase 3: ~3-5 min (limited by Opus call). Sonnet fills the gap.
Raw output: up to 25 Opus variants + 50 Sonnet variants = **75 candidates**.

### Why Opus + Sonnet Lightning, not 5× Max

`/roast_max` per story = 3 legs × 5 stories = 15 calls, only 2 concurrent. With each Opus call taking ~3 min: 15 × 3 / 2 = 22.5 min minimum. Too slow.

v2 approach: 1 Opus call (all stories) + 5 Sonnet calls (sequential) = 6 total calls, ~5 min. Same Opus depth + Sonnet diversity at 4× the speed.

Opus sees all 5 stories simultaneously → cross-references, avoids overlap, allocates best material across stories. Better than 5 independent Opus calls that might generate similar roasts.

## Phase 4: Filter + Evaluate

### Step 1: Filter Pipeline (instant)

```typescript
const allVariants = [...opusVariants, ...sonnetVariants];

const filtered = allVariants
  .filter(v => preFilter(v.text))      // regex: length, sentences, generic patterns
  .filter(v => filterRoast(v.text).passed)  // TOS check
  .sort((a, b) => b.selfScore - a.selfScore);  // pre-sort for dedup (higher scores survive)

const deduped = jaccardDedup(filtered, 0.6);  // Jaccard bigram, threshold 0.6
```

Expected: 75 raw → ~45 after preFilter → ~40 after TOS → **~28 after dedup**.

### Step 2: Comparative Ranking (1 Sonnet call, ~10s)

```typescript
const ranked = await evaluator.rankBatch(deduped);
// Formula: FUNNY × 0.5 + IMPACT × 0.3 + ORIGINAL × 0.2
```

### Step 3: Serious Evaluation (5 judges on top 8, ~2 min)

```typescript
const topCandidates = ranked.slice(0, 8);
const evaluated = await evaluator.evaluateBatch(topCandidates, { concurrency: 3 });
// 8 items × 5 judges = 40 eval calls, maxConcurrent=2 → ~100s
// Scoring: funny=0.40, impact=0.20, original=0.15, savage=0.10, degen=0.05, factual=0.05, crypto_native=0.05
```

### Step 4: Story Diversity Enforcement

Before selecting final 5, enforce max 2 roasts per story (prevent all 5 from one story):

```typescript
const final: RankedVariant[] = [];
const storyCount = new Map<string, number>();

for (const variant of evaluatedSorted) {
  const count = storyCount.get(variant.storyId) ?? 0;
  if (count >= 2) continue;  // max 2 per story
  storyCount.set(variant.storyId, count + 1);
  final.push(variant);
  if (final.length >= 5) break;
}
```

This guarantees diversity: 5 roasts cover at least 3 different stories.

## Phase 5: Notify + Store

### Telegram Format

```
📰 <b>NEWS ROAST DIGEST</b>
5 stories researched · 75 candidates · top 5 by 5-judge panel

━━ 1. <b>Aerodrome v4 Launch</b> ━━
🏆 4.72 | 🎭 BATHOS | 🏷 Opus
<i>"aerodrome shipped v4 with 'revolutionary ve(3,3).' tvl went from $2B to $2.01B. revolution complete."</i>
📎 <a href="https://x.com/AerodromeFi/status/...">@AerodromeFi</a>

<tg-spoiler>F:4.8 I:4.6 O:4.5 S:4.2 D:4.0 — unanimous, 0 vetoes</tg-spoiler>

━━ 2. <b>Jesse Pollak DeFi Take</b> ━━
🥈 4.51 | 🎭 QUOTE_FLIP | 🏷 Sonnet
<i>"jesse said 'base is the home of DeFi.' $3.9B tvl. solana's home has a bigger garage."</i>
📎 <a href="https://x.com/jessepollak/status/...">@jessepollak</a>

<tg-spoiler>F:4.5 I:4.8 O:4.0 S:4.2 D:3.8 — 1 veto (FACTUAL), overruled</tg-spoiler>

...

━━ 📊 Pipeline Stats ━━
⏱ 9m 14s total (research: 3m, gen: 5m, eval: 1m)
📈 Stories: 8 found → 5 selected (roastability ≥ 6)
🎯 Variants: 75 generated → 28 filtered → 8 evaluated → 5 selected
🧠 Opus: 25 variants (avg self-score 3.8) | Sonnet: 50 variants (avg 3.4)
```

### Runner-ups (6th-8th place, under spoiler)

```
<tg-spoiler>
━━ Runner-ups ━━
6. [4.31] "virtuals launched..." — IRONIC_REVERSAL
7. [4.22] "coinbase said..." — DATA_BOMB
8. [4.10] "brett holders..." — BATHOS
</tg-spoiler>
```

### Stockpile Promotion

All 8 evaluated roasts (top 5 + 3 runner-ups) → `roast_stockpile` with `status: 'available'`, `freshness_type: 'data_dependent'`, `expires_at: +48h` (news roasts have limited shelf life).

## Data Model

### Table: `news_events` (migration 022)

```sql
CREATE TABLE news_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id        TEXT NOT NULL UNIQUE,
    author_handle   TEXT NOT NULL,
    author_tier     TEXT NOT NULL CHECK (author_tier IN ('S', 'A', 'B', 'C')),
    tweet_text      TEXT NOT NULL,
    tweet_url       TEXT NOT NULL,
    monitor_score   INTEGER NOT NULL,
    followers_k     INTEGER NOT NULL,
    is_reply        INTEGER NOT NULL DEFAULT 0,
    -- Story clustering (filled by Phase 2)
    story_id        TEXT,
    story_label     TEXT,
    roastability    INTEGER,
    -- Lifecycle
    used_in_digest  INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_news_events_created ON news_events(created_at);
CREATE INDEX idx_news_events_score ON news_events(monitor_score DESC);
```

### Table: `news_digests` (migration 022)

```sql
CREATE TABLE news_digests (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    stories_found     INTEGER NOT NULL,
    stories_selected  INTEGER NOT NULL,
    variants_generated INTEGER NOT NULL,
    variants_filtered INTEGER NOT NULL,
    variants_evaluated INTEGER NOT NULL,
    roasts_sent       INTEGER NOT NULL,
    top_story         TEXT,
    top_score         REAL,
    research_summary  TEXT,         -- Phase 2 research summary (for future analytics)
    duration_ms       INTEGER NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Pruning

- `news_events` older than 14 days → DELETE (keep 2 weeks for trend analysis)
- `news_digests` kept indefinitely (small table, analytics value)
- Pruning: 1% probability per monitor poll

## LLM Call Budget (per `/news` invocation)

| Phase | Step | Model | Calls | Duration (est.) |
|-------|------|-------|-------|----------------|
| 2 | Research + story mining | **Opus** | 1 | 3-5 min |
| 3a | Deep generation (all stories) | **Opus** | 1 | 3-5 min |
| 3b | Lightning diversity (per story) | Sonnet | 5 sequential | 2.5 min |
| 4 | rankBatch | Sonnet | 1 | 10s |
| 4 | Serious eval (5 judges × 8 items) | Sonnet | 40 (2 concurrent) | 2 min |
| **Total** | | **2 Opus + 47 Sonnet** | **49 calls** | **~10-12 min** |

Opus calls: бесплатно через Claude Max subscription (CLI subprocess). Sonnet eval calls: бесплатно. Единственная цена — время (~10-12 min per invocation). Для once/day flagship контента — приемлемо.

## Standalone Format Rules

| Aspect | Reply-guy roast | News roast (standalone) |
|--------|----------------|------------------------|
| Context | Reader sees parent tweet | **Zero context — self-contained** |
| Target naming | "your TVL" / "this project" | **"Aerodrome's TVL..." in first 5 words** |
| Person | 2nd person ok | **3rd person always** |
| Length | 80-150 chars | **80-200 chars (more room for setup)** |
| Link | Not needed | **Not included (breaks flow)** |
| Discovery | In target's reply tree | **In For You / follower timeline** |
| Algorithm | Reply weight 13.5x | **Builds TweepCred (original content priority)** |
| Data source | Target's specific tweet | **News event + verified facts** |

## File Structure

```
src/news/
├── news-accumulator.ts         # Monitor hook: saves scored tweets to news_events
├── news-event.repository.ts    # SQLite CRUD for news_events + news_digests
├── news-pipeline.ts            # Orchestrator: phases 1-5
├── news-research.ts            # Phase 2: Opus research prompt builder
├── news-generator.ts           # Phase 3: Opus + Lightning generation
├── news-notify.ts              # Phase 5: Telegram formatting
└── types.ts                    # NewsEvent, NewsStory, NewsDigest types
```

**Integration points:**
- `src/monitor/timeline-monitor.ts` — hook for news accumulator (3 lines)
- `src/admin/bot.ts` — `/news` command handler
- `src/agent/agent.types.ts` — add `news-research` and `news-lightning` profiles
- `src/storage/migrations/022-news-events.sql` — new tables

## Reuse Matrix

| Component | Source | Reuse |
|-----------|--------|-------|
| Tweet accumulation | Timeline monitor | **Hook** — 3 lines in doPoll() |
| DexScreener/CoinGecko | `farm/target-discoverer.ts` | **Extract** — move fetch functions to shared util |
| Research prompt | New | **New** — Phase 2 Opus+Perplexity prompt |
| Opus generation | `roast-power` profile | **Reuse** profile, new prompt |
| Lightning generation | `generateRoastLightning()` | **Adapt** — add `standalone` flag to prompt builder |
| Content filtering | `preFilter`, `filterRoast`, `jaccardDedup` | **Full reuse** |
| Ranking | `RoastEvaluator.rankBatch()` | **Full reuse** |
| Serious evaluation | `RoastEvaluator.evaluateBatch()` | **Full reuse** |
| Telegram notify | New (pattern from `reply-guy-notify.ts`) | **New** with shared helpers |
| Stockpile promotion | `StockpileRepository.insert()` | **Full reuse** |

## Edge Cases

### Quiet Day (< 3 stories with roastability ≥ 6)

Phase 2 Opus call instructed to note this. Pipeline generates for whatever is available and reports:
```
📰 Quiet day — only 2 stories scored ≥ 6 roastability. Generated best efforts.
```

### All News Stale (> 12h old)

Phase 2 detects this and adds "evergreen angle" instruction. Opus generates roasts that don't reference timing:
- Bad: "aerodrome launched v4 today" (12h old = cringe)
- Good: "aerodrome's v4 promised to 'change everything.' tvl changed by 1.5%." (works anytime)

### `/news` Run Twice in One Day

`news_digests` table tracks last run. Second run:
1. Filters out stories already covered (via `used_in_digest` flag)
2. If < 3 fresh stories remain → warns "already digested today, only N new stories"
3. Generates for remaining stories

### Phase 2 Timeout (Opus research > 5 min)

Fallback: skip Perplexity research, use only monitor tweets + DexScreener. Phase 2 degrades to Sonnet clustering (v1 approach). Pipeline continues with reduced quality, logs warning.

### Phase 3 Opus Timeout (generation > 5 min)

Sonnet Lightning variants proceed independently. Final pool = Sonnet-only (50 variants instead of 75). Still enough for quality selection. Pipeline warns: "Opus generation timed out — Sonnet-only pool."

## Future Extensions

### Phase 2: Auto-posting cron

```env
ENABLE_NEWS_DIGEST=true
NEWS_DIGEST_CRON="0 9,21 * * *"   # 9am + 9pm UTC
NEWS_AUTO_POST_TOP_N=2
NEWS_AUTO_POST_MIN_SCORE=4.5
```

### Phase 3: Breaking News Mode

When 3+ S/A accounts tweet about same topic within 30 min → immediate Telegram alert with pre-generated roast. Reactive, not scheduled.

### Phase 4: News Knowledge Base

Expand `news_events` with price snapshots, on-chain data, sentiment classification. Enable "I told you so" roasts (compare prediction vs outcome after 7 days).

### Phase 5: External Source Integration

- CryptoPanic API ($30/mo) — panic_score, community votes (lol/bearish/important)
- RSS feeds — Cointelegraph, The Block, CoinDesk
- On-chain alerts — whale movements, exploit detection

Add when Perplexity proves insufficient for story discovery.

## Implementation Plan

### Iteration 1 (this task)

1. Migration 022: `news_events` + `news_digests` tables
2. `NewsEventRepository`: CRUD, pruning, upsert, getRecent
3. News accumulator hook in timeline monitor
4. `news-research` and `news-lightning` profiles in agent.types
5. Phase 2 research prompt (`news-research.ts`)
6. Phase 3 generator: Opus + Lightning parallel (`news-generator.ts`)
7. Pipeline orchestrator (`news-pipeline.ts`)
8. Telegram formatter (`news-notify.ts`)
9. `/news` command in admin bot (with `--quick` flag to skip serious eval)
10. Types (`types.ts`)

**Estimated effort**: ~600-700 lines new code + migration + profile definitions.

### Iteration 2 (quality loop)

- Human review of first 10 digests → prompt calibration
- Standalone format A/B testing (length, naming patterns, hashtag effect)
- `--stories N` and `--fresh` flags
- Accumulator threshold tuning based on real data

### Iteration 3 (automation + analytics)

- Auto-posting cron
- Breaking news detection
- Story tracking across days (trend lines)
- CryptoPanic integration if Perplexity gaps found
