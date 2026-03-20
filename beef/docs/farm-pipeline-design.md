# Roast Farm Pipeline — Design Document

**Date:** 2026-03-19
**Status:** Draft — pending approval
**Author:** Claude (Opus) + Nikita

---

## Executive Summary

Roast Farm is a local pipeline that generates, evaluates, and curates high-quality pre-roasted content for the $BEEF bot. It fills three gaps:

1. **Landing page** — instant roasts for "Submit to Audit" feature
2. **Bot acceleration** — pre-roasted stockpile means instant responses for known targets
3. **Quality evolution** — the farm generates volume, evaluation selects for quality, best examples feed back into CreativeMemory

The pipeline runs locally, outputs curated roasts as JSON, and syncs to the server. It does NOT run on the server or inside the bot process.

---

## Critical Design Decisions

### What I got wrong in v1 (self-critique)

| v1 Decision | Problem | v2 Fix |
|-------------|---------|--------|
| Extend `roasts` table with `source='stockpile'` | Pollutes FTS, breaks `getRecent()`, `getTodayCount()`, engagement tracker tries to track non-existent tweets | **Separate tables**: `farm_attempts` + `roast_stockpile` |
| Auto-promote high-scored roasts to `human_feedback` | Creates closed LLM→LLM feedback loop = mode collapse. LLM evaluates its own output, feeds it back as examples | **Three-tier memory isolation**: farm output NEVER auto-enters CreativeMemory. Human promotion required |
| Anthropic SDK for evaluation | Unnecessary dependency, user preference for unified CLI approach | **All via Claude Code CLI** — Opus for generation, Sonnet for evaluation, different profiles |
| 3 strategies × 3 variants = 9 per target | Too expensive with Opus. 10 targets = 90 Opus calls with research | **1 random strategy × 3 variants per target**. Diversity comes from strategy rotation across targets + mutation system |
| Same prompts every run | Deterministic inputs → convergent outputs → mode collapse over time | **Entropy system**: mutation modifiers, temperature variation, wildcard angles, judge persona rotation |
| Single LLM judge with one rubric | Single selection pressure → over-optimization for one dimension | **Judge panel**: 3 personas, 2 randomly selected per evaluation. Different perspectives prevent monoculture |

### What was good in v1

- Reusing existing `RoastEngine` + `ProviderManager` + `CreativeMemory` infrastructure
- CLI-based pipeline (not embedded in bot)
- NDJSON sync approach
- Multi-criteria scoring (not single score)
- TTL / freshness awareness

---

## Architecture

```
ROAST FARM (local, manual runs)

pnpm farm pipeline --count 10
        │
        ▼
┌─── DISCOVER (Sonnet) ────────────────────────────┐
│ DexScreener trending → CoinGecko movers →         │
│ Perplexity enrichment (top candidates only)        │
│ Output: ranked target list in farm_targets         │
└───────────────────────┬──────────────────────────┘
                        │
                        ▼
┌─── GENERATE (Opus, roast-power profile) ─────────┐
│ For each target:                                    │
│   1. Pick 1 random strategy (rubric/persona/adv.)  │
│   2. Apply 1-2 random mutation modifiers            │
│   3. Generate 3 variants with research              │
│   4. Content filter                                 │
│   5. Store ALL in farm_attempts (raw, unscored)     │
└───────────────────────┬──────────────────────────┘
                        │
                        ▼
┌─── EVALUATE (Sonnet, farm-evaluate profile) ─────┐
│ For each attempt:                                   │
│   1. Pick 2 of 3 judge personas                     │
│   2. G-Eval with CoT per persona                    │
│   3. Composite score = average of both judges        │
│   4. Store scores in farm_attempts                   │
└───────────────────────┬──────────────────────────┘
                        │
                        ▼
┌─── CURATE (deterministic, no LLM) ──────────────┐
│ score ≥ 4.0 → promote to roast_stockpile          │
│ score < 4.0 → stays in farm_attempts (TTL 30d)    │
│ Diversity check: max 3 stockpiled per target       │
│ Dedupe: cosine via FTS5 match against existing     │
└───────────────────────┬──────────────────────────┘
                        │
                        ▼
┌─── EXPORT (no LLM) ─────────────────────────────┐
│ pnpm farm export → data/stockpile-export.json      │
│ pnpm farm sync   → scp to server                   │
└──────────────────────────────────────────────────┘
```

### Memory Safety: Three-Tier Isolation

```
                         ┌──────────────────────────────┐
                         │     CreativeMemory            │
                         │  (influences generation)      │
                         └──────────┬───────────────────┘
                                    │
                              ONLY via human
                              promote in Telegram
                                    │
                         ┌──────────┴───────────────────┐
                         │     human_feedback            │
                         │  (verdict = 'fire')           │
                         └──────────┬───────────────────┘
                                    │
                              manual /promote command
                                    │
┌────────────────┐    score ≥ 4.0   ┌──────────────────────┐
│ farm_attempts   │ ──────────────→ │ roast_stockpile       │
│ (raw, TTL 30d)  │                 │ (curated, served)     │
│ NO feedback     │                 │ NO feedback loop      │
│ loop connection │                 │ until human promotes   │
└────────────────┘                 └──────────────────────┘
```

**Why this matters:** If farm output auto-entered CreativeMemory, we'd create a closed loop where the LLM trains on its own output. This is textbook model collapse (Nature, 2024). Human curation is the quality gate that prevents it.

**What enters CreativeMemory and when:**
- Farm roasts: NEVER automatically. Only when a human uses `/promote <id>` in Telegram
- Bot-posted roasts: via existing RLHF flow (human rates `fire/post/iterate/reject`)
- External examples: via existing `/example` flow

---

## Data Model

### New migration: `005-roast-farm.sql`

```sql
-- Targets discovered by farm pipeline
CREATE TABLE farm_targets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('project', 'token', 'trend', 'person')),
    source          TEXT NOT NULL,          -- 'dexscreener', 'coingecko', 'perplexity', 'manual'
    priority_score  REAL NOT NULL DEFAULT 0,
    reason          TEXT,                   -- why this target was selected
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'generating', 'completed', 'skipped')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Raw generation output (high volume, temporary)
CREATE TABLE farm_attempts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    target_name     TEXT NOT NULL,
    target_type     TEXT NOT NULL,
    tweet_text      TEXT NOT NULL,
    angle           TEXT,
    strategy        TEXT,                   -- 'rubric', 'persona', 'adversarial'
    mutation_seed   TEXT,                   -- JSON: applied mutations
    llm_self_score  REAL,                  -- generator's own score
    evaluator_score REAL,                  -- judge composite score
    evaluator_output TEXT,                 -- JSON: per-criteria + reasoning
    research_notes  TEXT,
    fact_check_passed INTEGER DEFAULT 0,
    agent_output    TEXT,                   -- full LLM raw output
    promoted        INTEGER DEFAULT 0,      -- 1 = promoted to stockpile
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Curated high-quality roasts (long-lived, served to bot/landing)
CREATE TABLE roast_stockpile (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id      INTEGER REFERENCES farm_attempts(id),
    target_name     TEXT NOT NULL,
    target_type     TEXT NOT NULL,
    tweet_text      TEXT NOT NULL,
    angle           TEXT,
    quality_score   REAL NOT NULL,
    evaluator_output TEXT,
    research_notes  TEXT,
    freshness_type  TEXT NOT NULL DEFAULT 'evergreen'
                    CHECK (freshness_type IN ('evergreen', 'data_dependent')),
    expires_at      TEXT,                   -- NULL for evergreen
    status          TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available', 'served_bot', 'served_landing', 'promoted', 'expired')),
    served_at       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_fa_target ON farm_attempts(target_name);
CREATE INDEX idx_fa_score ON farm_attempts(evaluator_score);
CREATE INDEX idx_fa_created ON farm_attempts(created_at);
CREATE INDEX idx_ft_status ON farm_targets(status);
CREATE INDEX idx_rs_target ON roast_stockpile(target_name, status);
CREATE INDEX idx_rs_score ON roast_stockpile(quality_score DESC);
CREATE INDEX idx_rs_status ON roast_stockpile(status);
CREATE INDEX idx_rs_expires ON roast_stockpile(expires_at)
    WHERE freshness_type = 'data_dependent';
```

### FTS for stockpile (dedupe detection)

```sql
CREATE VIRTUAL TABLE stockpile_fts USING fts5(tweet_text, content=roast_stockpile, content_rowid=id);

CREATE TRIGGER stockpile_fts_insert AFTER INSERT ON roast_stockpile BEGIN
    INSERT INTO stockpile_fts(rowid, tweet_text) VALUES (new.id, new.tweet_text);
END;

CREATE TRIGGER stockpile_fts_delete AFTER DELETE ON roast_stockpile BEGIN
    INSERT INTO stockpile_fts(stockpile_fts, rowid, tweet_text)
    VALUES ('delete', old.id, old.tweet_text);
END;
```

---

## Components (Detailed)

### 1. Target Discoverer

**File:** `src/farm/target-discoverer.ts`
**Model:** Sonnet via `discovery` profile (already exists)
**Cost:** Cheap — free APIs first, Perplexity only for enrichment

```
Source priority (cheapest first):
1. DexScreener API (free) → trending tokens on Base chain
   curl https://api.dexscreener.com/token-boosts/top/v1

2. CoinGecko API (free tier) → top movers by 24h change
   curl https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc

3. Perplexity MCP (paid, use sparingly) → "trending crypto controversies this week"
   Only for enriching top 3-5 candidates from above sources

4. Manual input → pnpm farm generate --targets "Uniswap,Aave,Jupiter"
```

**Target scoring heuristics (no LLM needed):**
- Market cap > $10M: +2 (worth roasting)
- 24h price change > 20% (up or down): +3 (timely)
- Already in target_profiles with 0 roasts: +1 (untouched)
- Already has ≥3 stockpiled roasts: -10 (skip)
- Base chain native: +2 (our audience)

**Output:** `farm_targets` rows with `priority_score`.

### 2. Batch Generator

**File:** `src/farm/batch-generator.ts`
**Model:** Opus via `roast-power` profile
**Concurrency:** 2 parallel (Opus is slow, don't overwhelm)

**Key design: one strategy per target, rotation across batch.**

```typescript
// Instead of running all 3 strategies per target (expensive):
// Distribute strategies across targets for batch-level diversity

const strategies: PromptStrategy[] = ['rubric', 'persona', 'adversarial'];
for (let i = 0; i < targets.length; i++) {
  const strategy = strategies[i % strategies.length]; // rotate
  await generate(targets[i], strategy, mutations);
}
```

This means:
- 10 targets × 1 strategy × 3 variants = 30 Opus calls (not 90)
- Each target gets a different strategy than its neighbors
- Cross-batch diversity is natural

**Mutation injection (see Entropy System below):**
Each target gets 1-2 randomly selected mutations appended to the generation prompt.

### 3. Self-Evaluator

**File:** `src/farm/self-evaluator.ts`
**Model:** Sonnet via new `farm-evaluate` profile
**NOT the same agent as the generator** — critical for avoiding self-enhancement bias

**New profile to add to `claude-cli.config.ts`:**

```typescript
'farm-evaluate': {
  model: 'sonnet',
  effort: 'medium',
  tools: [],          // no research — evaluating existing text
  maxTurns: 1,        // single-turn evaluation
  timeoutMs: 60_000,
}
```

**G-Eval rubric with Chain-of-Thought:**

```
You are a {PERSONA}. Evaluate this crypto roast.

Target: "{target_name}"
Roast: "{tweet_text}"
Research context: "{research_notes}"

Think through each criterion step-by-step, then score.

## Criteria

1. SAVAGE (1-5): How hard does this hit? Is it genuinely brutal or just mildly snarky?
   1=bland  2=mild  3=solid hit  4=ouch  5=lethal

2. FACTUAL (1-5): Is it grounded in verifiable data/events?
   1=made up  2=vague reference  3=real but common knowledge  4=specific real data  5=surgical data point

3. FUNNY (1-5): Does the setup→punchline land?
   1=not funny  2=smile  3=chuckle  4=laugh  5=screenshot-worthy

4. ORIGINAL (1-5): Would crypto twitter have seen this take before?
   1=cliché  2=slight twist  3=fresh angle  4=novel  5=never seen this

5. SHAREABLE (1-5): Would someone RT this without context?
   1=niche  2=needs context  3=works standalone  4=very shareable  5=viral potential

6. CRYPTO_NATIVE (1-5): Does it sound like CT, not a marketing team?
   1=corporate  2=trying too hard  3=passable  4=native  5=sounds like a degen with data

## Output (strict JSON):
{
  "reasoning": "2-3 sentences explaining your overall impression",
  "scores": { "savage": N, "factual": N, "funny": N, "original": N, "shareable": N, "crypto_native": N },
  "composite": N.N,
  "verdict": "stockpile" | "discard",
  "one_line_why": "why this works or doesn't in ≤15 words"
}
```

**Judge personas (rotate 2 of 3 per evaluation):**

| Persona | Bias | Prompt prefix |
|---------|------|---------------|
| **CT Degen** | Prioritizes shareability, meme energy, viral potential | "You are a CT degen with 50K followers who only RTs the most savage takes. You've seen every roast format." |
| **Comedy Writer** | Prioritizes craft, setup-punchline, originality | "You are a comedy writer who consults for Wendy's Twitter. You judge jokes by structure and surprise, not just shock value." |
| **Data Hawk** | Prioritizes factual accuracy, specificity, research depth | "You are a DeFi analyst who fact-checks everything. A roast without a real data point is worthless to you." |

**Composite score:** Average of both judges' composites. This prevents optimizing for one dimension.

**Threshold:** ≥ 4.0 composite → promote to stockpile.

### 4. Stockpile Manager

**File:** `src/farm/stockpile-manager.ts`

```typescript
class StockpileManager {
  // Promote attempt to stockpile (after evaluation passes threshold)
  promote(attemptId: number, score: number, evaluatorOutput: string): number;

  // Find best available roast for a target
  // Selection: 70% chance pick top-scored, 30% chance pick random from qualified
  // This prevents always serving the "safest" roast
  findBest(targetName: string): StockpiledRoast | undefined;

  // Mark as served (bot or landing)
  markServed(id: number, destination: 'bot' | 'landing'): void;

  // Human promotes to CreativeMemory (via Telegram /promote)
  promoteToFeedback(id: number, evaluatorTelegramId: number): void;

  // Export for landing page
  exportForLanding(limit: number): LandingRoast[];

  // Prune expired data-dependent roasts
  pruneExpired(): number;

  // Prune old farm_attempts (>30 days, not promoted)
  pruneAttempts(): number;

  // Stats
  getStats(): FarmStats;

  // Dedupe check via FTS5
  isDuplicate(text: string, targetName: string): boolean;
}
```

**Selection diversity (findBest):**
```typescript
findBest(targetName: string): StockpiledRoast | undefined {
  const candidates = this.getAvailable(targetName);
  if (candidates.length === 0) return undefined;

  // 70% chance: best by score. 30% chance: random from top 5.
  if (Math.random() < 0.7 || candidates.length <= 2) {
    return candidates[0]; // already sorted by quality_score DESC
  }
  const pool = candidates.slice(0, Math.min(5, candidates.length));
  return pool[Math.floor(Math.random() * pool.length)];
}
```

### 5. Sync

**File:** `src/farm/sync.ts`

**Export:** Stockpiled roasts → NDJSON file → scp to server
**Import:** Server reads NDJSON → upserts into local `roast_stockpile`

```bash
# Export (local)
pnpm farm sync --export --output data/stockpile-sync.ndjson

# Upload to server
scp data/stockpile-sync.ndjson beef-server:~/beef/data/

# Import (server)
pnpm farm sync --import --input data/stockpile-sync.ndjson
```

**Upsert key:** `(target_name, tweet_text)` — idempotent, safe to re-run.

**Format:**
```jsonl
{"target_name":"Uniswap","target_type":"project","tweet_text":"...","angle":"DATA_BOMB","quality_score":4.3,"research_notes":"...","freshness_type":"data_dependent","expires_at":"2026-03-26"}
```

---

## Entropy System

The biggest risk for a generation pipeline is convergence: same inputs → same outputs → stale content. The entropy system adds controlled randomness at every stage.

### Layer 1: Mutation Modifiers (generation)

Each farm run picks 1-2 random mutations per target. Mutations are constraints or perspective shifts that force the LLM down different creative paths.

```typescript
const MUTATIONS: Mutation[] = [
  // --- Constraint mutations ---
  { id: 'short',       type: 'constraint', text: 'CONSTRAINT: Must be under 140 characters. Half-tweet challenge — every word must earn its place.' },
  { id: 'max-length',  type: 'constraint', text: 'CONSTRAINT: Use exactly 270-280 characters. Fill the space — density is a weapon.' },
  { id: 'question',    type: 'constraint', text: 'CONSTRAINT: Must end with a question, not a statement. Let them answer it in their head.' },
  { id: 'single-sent', type: 'constraint', text: 'CONSTRAINT: Single sentence only. No periods except the last one.' },
  { id: 'no-data',     type: 'constraint', text: 'CONSTRAINT: No numbers, percentages, or dollar amounts. Pure narrative roast.' },
  { id: 'number-lead', type: 'constraint', text: 'CONSTRAINT: Must open with a specific number (dollar amount, percentage, date, or count).' },

  // --- Voice mutations ---
  { id: 'ice-cold',    type: 'voice', text: 'VOICE OVERRIDE: Maximum restraint. Ice cold. No exclamation energy. Whisper the kill shot.' },
  { id: 'amused',      type: 'voice', text: 'VOICE OVERRIDE: Genuinely amused, not angry. You find this project FUNNY. The humor is that it exists.' },
  { id: 'fake-respect', type: 'voice', text: 'VOICE OVERRIDE: The compliment IS the roast. Sound impressed. The reader should need 2 seconds to realize you just destroyed them.' },
  { id: 'normie',      type: 'voice', text: 'VOICE OVERRIDE: Explain this project to a confused normie. The explanation itself is the roast.' },
  { id: 'therapist',   type: 'voice', text: 'VOICE OVERRIDE: Sound like a therapist gently breaking bad news. Clinical empathy that somehow makes it worse.' },

  // --- Perspective mutations ---
  { id: 'investors',   type: 'perspective', text: 'PERSPECTIVE: Roast from their own investors\' internal group chat.' },
  { id: 'obituary',    type: 'perspective', text: 'PERSPECTIVE: You are writing this project\'s obituary, dated 2027. What did it die of?' },
  { id: 'non-crypto',  type: 'perspective', text: 'PERSPECTIVE: Compare this to a non-crypto thing — a restaurant, movie, or historical event. The comparison IS the roast.' },
  { id: 'competitor',  type: 'perspective', text: 'PERSPECTIVE: You are this project\'s biggest competitor. What would YOU tweet about them?' },
  { id: 'future',      type: 'perspective', text: 'PERSPECTIVE: It\'s 2028. This project was a footnote. What do you remember about it? Probably nothing — that\'s the roast.' },

  // --- Wildcard mutations ---
  { id: 'ignore-angle', type: 'wildcard', text: 'WILDCARD: Ignore the assigned angle. Find the angle that HURTS most. Trust your instinct.' },
  { id: 'no-name',      type: 'wildcard', text: 'WILDCARD: The roast must work even if you remove the project name. It should be recognizable from the description alone.' },
  { id: 'one-word',     type: 'wildcard', text: 'WILDCARD: The punchline must be a single word. Build to it.' },
];
```

**Selection:**
```typescript
function pickMutations(count: number = 2): Mutation[] {
  // Weighted: constraint mutations 40%, voice 30%, perspective 20%, wildcard 10%
  const weights = { constraint: 0.4, voice: 0.3, perspective: 0.2, wildcard: 0.1 };
  // ... weighted random selection without replacement
}
```

**Applied in prompt as an extra section before TASK:**
```
## FARM MUTATION (this run's creative constraint)
${mutation.text}
Apply this constraint to ALL variants. It overrides default behavior for this run only.
```

### Layer 2: Strategy Rotation (generation)

Instead of always running all 3 strategies, rotate across the batch:

```
Target 1: rubric    + mutations [ice-cold, question]
Target 2: persona   + mutations [investors]
Target 3: adversarial + mutations [short, normie]
Target 4: rubric    + mutations [obituary, no-data]
...
```

Each target gets a different combination. Over multiple farm runs, every target accumulates roasts from all strategies and many mutation combinations.

### Layer 3: Judge Persona Rotation (evaluation)

Each evaluation picks 2 of 3 judge personas. Over time, all roasts are evaluated from multiple perspectives. No single evaluator personality dominates selection.

```typescript
function pickJudges(): [JudgePersona, JudgePersona] {
  const all: JudgePersona[] = ['ct_degen', 'comedy_writer', 'data_hawk'];
  const shuffled = all.sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}
```

### Layer 4: Freshness Tagging (curation)

Roasts are tagged as `evergreen` or `data_dependent`:
- **data_dependent** (references specific prices, TVL, dates): TTL 7 days
- **evergreen** (personality, narrative, structural humor): no expiry

Detection heuristic (no LLM needed):
```typescript
function classifyFreshness(text: string, researchNotes: string | null): 'evergreen' | 'data_dependent' {
  const dataPatterns = /\$[\d,.]+[MBK]|\d+%|TVL|mcap|volume|Q[1-4]\s*20\d{2}/i;
  if (dataPatterns.test(text)) return 'data_dependent';
  if (researchNotes && researchNotes.length > 200) return 'data_dependent';
  return 'evergreen';
}
```

---

## CLI Interface

**Entry point:** `src/farm/index.ts`
**Package.json script:** `"farm": "tsx src/farm/index.ts"`

```bash
# Full pipeline: discover → generate → evaluate → curate
pnpm farm pipeline --count 10 --concurrency 2

# Just discover new targets
pnpm farm discover --sources dexscreener,coingecko --limit 20

# Generate for specific targets (skip discovery)
pnpm farm generate --targets "Uniswap,Aave,Jupiter" --variants 3

# Generate for pending farm_targets
pnpm farm generate --from-discovered --limit 5

# Evaluate unevaluated attempts
pnpm farm evaluate --threshold 4.0

# Export stockpile for landing page
pnpm farm export --top 50 --output data/stockpile-export.json

# Sync to server
pnpm farm sync --export && scp data/stockpile-sync.ndjson server:~/beef/data/

# Statistics
pnpm farm stats

# Prune expired data-dependent roasts and old attempts
pnpm farm prune --attempts-ttl 30 --expired

# Human promote: move stockpile roast into CreativeMemory
# (This is done via Telegram /promote command, not CLI)
```

### Pipeline output example

```
🎯 Discovered 12 targets (3 dexscreener, 4 coingecko, 5 perplexity)
   Skipped 4 (already have ≥3 stockpiled)
   Queued 8 for generation

🔥 Generated 24 variants for 8 targets (Opus, roast-power)
   Strategy distribution: rubric=3, persona=3, adversarial=2
   Mutations applied: ice-cold×2, question×1, investors×2, short×1, obituary×1, none×1
   Content filter: 22 passed, 2 filtered

📊 Evaluated 22 attempts (Sonnet, 2-judge panels)
   Judge panels: ct_degen+comedy_writer×8, comedy_writer+data_hawk×7, ct_degen+data_hawk×7
   Score distribution: ≥4.5: 3 | ≥4.0: 8 | ≥3.5: 6 | <3.5: 5

✅ Promoted 8 to stockpile (1 dedupe rejected)
   New stockpile total: 47 roasts across 18 targets
   Freshness: 5 evergreen, 3 data_dependent (expires 2026-03-26)

📦 Run complete in 12m 34s
   Opus calls: 8 | Sonnet calls: 44 | Perplexity calls: 3
```

---

## Bot Integration

### Check stockpile before generating

In `queue-manager.ts`, add a stockpile check at the top of `dequeueAndProcess()`:

```typescript
// Before calling generateRoasts(), check stockpile
const stockpiled = this.stockpileManager.findBest(item.targetName);
if (stockpiled) {
  this.logger.info(
    { queueId: item.id, stockpileId: stockpiled.id, target: item.targetName, score: stockpiled.qualityScore },
    'Using stockpiled roast instead of generating',
  );

  const roastId = this.roastRepo.insert({
    targetName: item.targetName,
    targetType: item.targetType,
    tweetText: stockpiled.tweetText,
    source: item.source,
    status: 'pending_approval',
    factChecked: true,
    contextData: stockpiled.researchNotes ?? undefined,
  });

  this.stockpileManager.markServed(stockpiled.id, 'bot');

  // Continue with normal posting flow...
}
```

### Telegram `/promote` command

New command in admin bot to promote stockpiled roasts to CreativeMemory:

```
/promote <stockpile_id>
→ Reads roast from roast_stockpile
→ Inserts into human_feedback with verdict='fire', evaluator_name='farm-promote'
→ Updates stockpile status to 'promoted'
→ Response: "Promoted to CreativeMemory. This will influence future generation."
```

This is the ONLY path from farm output to CreativeMemory. No automation.

### Landing page export format

```json
{
  "generated_at": "2026-03-19T12:00:00Z",
  "roasts": [
    {
      "target": "Uniswap",
      "text": "uniswap raised $11M to build...",
      "score": 4.6,
      "angle": "DATA_BOMB",
      "freshness": "data_dependent",
      "expires": "2026-03-26"
    }
  ]
}
```

Landing page can read this JSON statically. No API needed for v1. Refresh by re-exporting periodically.

---

## Cost Analysis

### Per pipeline run (10 targets)

| Component | Calls | Model | Est. tokens | Notes |
|-----------|-------|-------|-------------|-------|
| Discovery | 1-3 | Sonnet | ~5K in + 2K out | DexScreener/CoinGecko free, Perplexity for top 3 |
| Generation | 8-10 | **Opus** | ~15K in + 3K out × 10 | Research + 3 variants per target |
| Evaluation | 20-30 | Sonnet | ~2K in + 500 out × 25 | 2 judges per attempt, single-turn |

**With Claude Max subscription:** Generation via CLI uses your subscription, not API credits. Evaluation likewise. So the marginal cost is $0 beyond subscription.

**Perplexity MCP:** ~3-5 calls per run for enrichment = ~$0.02-0.05/run.

**Bottleneck:** Opus generation time. 10 targets × ~3-5 min each at concurrency 2 = ~15-25 minutes per run.

---

## File Structure

```
beef/src/farm/
├── index.ts                    # CLI entry point (commander.js)
├── target-discoverer.ts        # Find new roastable targets
├── batch-generator.ts          # Generate roasts with entropy
├── self-evaluator.ts           # LLM-as-judge evaluation
├── stockpile-manager.ts        # CRUD for stockpile + dedupe
├── mutations.ts                # Mutation modifiers registry
├── judge-personas.ts           # Evaluator persona definitions
├── sync.ts                     # NDJSON export/import
├── freshness.ts                # Freshness classification
└── types.ts                    # Farm-specific types

beef/src/storage/
├── migrations/005-roast-farm.sql
└── repositories/
    ├── farm-attempt.repository.ts
    ├── farm-target.repository.ts
    └── stockpile.repository.ts
```

---

## Milestones

### Milestone 1: Foundation

**Goal:** Database schema + repositories + basic CLI skeleton
**Files:** migration 005, 3 repositories, `farm/types.ts`, `farm/index.ts` (stub)

**Deliverables:**
- `005-roast-farm.sql` with all 3 tables + indexes + FTS
- `FarmAttemptRepository` — insert, getUnevaluated, pruneOld
- `StockpileRepository` — insert, findBest, markServed, getAvailable, isDuplicate, pruneExpired
- `FarmTargetRepository` — insert, getPending, markStatus
- Farm types (`FarmAttempt`, `StockpiledRoast`, `FarmTarget`, `FarmStats`)
- CLI entry point that can run `pnpm farm stats` (reads from new tables)

**Testing:**
- Unit tests for all 3 repositories (vitest, in-memory SQLite)
- Insert/query/promote/prune cycle works
- FTS dedupe detection works
- `findBest` selection randomness: run 100 times, verify distribution ~70/30

**Verification:** `pnpm test` passes, `pnpm farm stats` runs without errors

---

### Milestone 2: Evaluation Engine

**Goal:** LLM-as-judge with persona rotation
**Files:** `self-evaluator.ts`, `judge-personas.ts`, new profile in `claude-cli.config.ts`
**Why evaluation before generation:** We need to test the judge on existing roasts from `human_feedback` table. If we can verify the judge agrees with human verdicts, we trust its scores.

**Deliverables:**
- `farm-evaluate` profile added to `claude-cli.config.ts`
- `farm-evaluate` added to `TaskProfile` union type
- 3 judge persona prompt templates
- `SelfEvaluator` class: takes attempt, picks 2 judges, runs G-Eval, returns composite
- `pnpm farm evaluate` command (evaluates unevaluated attempts)

**Testing:**
- **Calibration test:** Take 20 existing roasts from `human_feedback` (10 fire, 10 reject). Run evaluator. Verify:
  - ≥80% of fire-rated roasts score ≥ 3.5
  - ≥80% of reject-rated roasts score < 3.5
  - If calibration fails → adjust rubric weights or persona prompts
- **Inter-judge reliability:** Same roast, all 3 pairs of judges. Scores should be within ±0.8 of each other
- **No self-enhancement:** Generator (Opus) produces text → Evaluator (Sonnet) scores it. Different model = different biases

**Verification:** Calibration test passes, `pnpm farm evaluate` processes attempts correctly

---

### Milestone 3: Generation with Entropy

**Goal:** Batch generation with mutations, strategy rotation, content filter
**Files:** `batch-generator.ts`, `mutations.ts`, `freshness.ts`

**Deliverables:**
- `mutations.ts` — mutation registry (18+ mutations in 4 categories)
- `BatchGenerator` class: takes targets, generates with entropy, stores in `farm_attempts`
- Strategy rotation across batch
- 1-2 random mutations per target
- Content filter integration (existing `filterRoast()`)
- Freshness classification for each roast
- `pnpm farm generate --targets "X,Y,Z"` command

**Testing:**
- **Entropy test:** Generate 3 roasts for same target, 3 times. Verify:
  - Different strategies used
  - Different mutations applied
  - Resulting texts are meaningfully different (not just shuffled words)
- **Content filter:** All generated roasts pass existing `filterRoast()`
- **Mutation effect:** Compare roasts with mutation vs without. Mutations should produce noticeably different structure/tone
- **Performance:** 3 targets in <10 minutes

**Verification:** `pnpm farm generate` produces variants in `farm_attempts`, mutations visible in `mutation_seed` column

---

### Milestone 4: Target Discovery

**Goal:** Automatic target finding from free APIs + Perplexity enrichment
**Files:** `target-discoverer.ts`

**Deliverables:**
- DexScreener trending integration (curl, no library)
- CoinGecko top movers integration (curl)
- Perplexity enrichment for top candidates (via `discovery` profile)
- Priority scoring heuristic
- Dedup against existing `target_profiles` + `roast_stockpile`
- `pnpm farm discover` command

**Testing:**
- **API integration:** DexScreener and CoinGecko return parseable data
- **Dedup:** Targets already in stockpile (≥3 roasts) are skipped
- **Priority scoring:** Higher-cap, more-volatile targets score higher
- **Perplexity budget:** At most 5 Perplexity calls per discover run

**Verification:** `pnpm farm discover` populates `farm_targets` with ranked targets

---

### Milestone 5: Full Pipeline + Export

**Goal:** End-to-end `pnpm farm pipeline` + export + sync + prune
**Files:** `sync.ts`, wiring in `index.ts`

**Deliverables:**
- `pnpm farm pipeline` — runs discover → generate → evaluate → curate in sequence
- `pnpm farm export` — JSON for landing page
- `pnpm farm sync --export` — NDJSON for server
- `pnpm farm prune` — TTL cleanup
- `pnpm farm stats` — full statistics
- Pretty CLI output with progress

**Testing:**
- **End-to-end:** `pnpm farm pipeline --count 3` completes, produces stockpiled roasts
- **Export format:** JSON matches landing page expected schema
- **Sync idempotency:** Import same NDJSON twice → no duplicates
- **Prune safety:** Only deletes non-promoted attempts older than TTL
- **Stats accuracy:** Counts match actual DB state

**Verification:** Full pipeline run, exported JSON contains quality roasts, stats are accurate

---

### Milestone 6: Bot Integration

**Goal:** Bot checks stockpile before generating, Telegram `/promote`
**Files:** Changes to `queue-manager.ts`, `admin/bot.ts`

**Deliverables:**
- Stockpile check in `QueueManager.dequeueAndProcess()`
- `/promote <id>` command in Telegram admin bot
- Stockpile status shown in `/status` command

**Testing:**
- **Bot integration:** Queue item for target with stockpiled roast → uses stockpile, doesn't generate
- **Promote flow:** `/promote` inserts into `human_feedback` with correct data
- **No auto-promote:** Verify no code path auto-inserts farm output into `human_feedback`
- **Fallback:** If stockpile empty for target → normal generation proceeds

**Verification:** Bot uses stockpiled roasts in dry-run mode, promote flow works in Telegram

---

## Evolution Roadmap (Post-MVP)

These are NOT in scope for initial implementation but inform design decisions:

| Feature | When | Why |
|---------|------|-----|
| **Engagement feedback** | After 50+ posted stockpile roasts | Track which stockpiled roasts get best engagement → refine scoring rubric |
| **Prompt evolution** (EvoPrompt) | After 200+ farm attempts | Mutate prompt templates based on what generates highest-scored output |
| **Embedding-based dedupe** | If FTS5 dedupe proves insufficient | Replace text matching with vector similarity for better near-duplicate detection |
| **Auto-scheduling** | When pipeline is proven stable | cron job: `pnpm farm pipeline --count 5` weekly |
| **A/B testing** | After bot integration works | Serve 50% stockpile, 50% live-generated → compare engagement |

---

## Summary

| Dimension | Decision | Rationale |
|-----------|----------|-----------|
| **Generation model** | Opus (roast-power) | User preference. Quality over speed for farm |
| **Evaluation model** | Sonnet (farm-evaluate) | Different model = no self-enhancement bias |
| **All via CLI** | No Anthropic SDK | User preference. Unified approach |
| **Separate tables** | farm_attempts + roast_stockpile | Don't pollute production `roasts` table |
| **Memory isolation** | Three-tier, human gate | Prevents LLM→LLM mode collapse |
| **Entropy** | Mutations + strategy rotation + judge panels | Prevents convergence |
| **Sync** | NDJSON export/import | Safer than rsync for live SQLite |
| **Cost** | ~$0 with Claude Max, ~25 min per run | Opus bottleneck, not cost |
