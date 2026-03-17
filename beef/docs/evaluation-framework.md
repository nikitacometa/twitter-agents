# $BEEF Roast Evaluation Framework

Multidimensional evaluation system for AI-generated crypto roast tweets.
Three evaluation layers: automated heuristics → LLM-as-Judge → persona panel.

## Architecture

```
Roast Engine generates 10 variants
        ↓
Layer 1: Automated Heuristics (instant, <100ms)
  → hard filters (TOS, length, banned words) → REJECT if fail
  → soft scoring (6 dimensions, /30) → rank variants
        ↓
Layer 2: LLM-as-Judge (1-3s, Claude Haiku)
  → evaluate top 3 variants across 8 dimensions
  → fact-check claims → REJECT if false
  → score /40
        ↓
Layer 3: Persona Panel (2-5s, Claude Haiku, batch)
  → 6 CT personas rate each variant
  → weighted aggregate → final score
        ↓
Quality Gate: post / iterate / reject
```

### When Each Layer Runs

| Mode | Layer 1 | Layer 2 | Layer 3 |
|------|---------|---------|---------|
| **Autonomous posting** | Always | Always | Always |
| **Telegram RLHF flow** | Always | Always | Skip (human decides) |
| **DRY_RUN testing** | Always | Always | Always + log details |
| **Prompt tuning** | Always | Always | Always + per-persona breakdown |

---

## Layer 1: Automated Heuristics

Instant, deterministic, no LLM cost. Runs on every variant.

### Hard Filters (binary pass/fail)

| Filter | Rule | Action on Fail |
|--------|------|----------------|
| **Length** | ≤280 chars | REJECT |
| **TOS violations** | Regex: slurs, threats, doxxing patterns | REJECT |
| **Ticker spam** | >1 mention of $BEEF per tweet | REJECT |
| **Financial advice** | Regex: "buy", "sell", "invest", "NFA" patterns | REJECT |
| **Personal attacks** | Regex: targeting individuals (not projects) | REJECT |
| **Duplicate** | FTS5 similarity >0.8 against last 100 roasts | REJECT |
| **Empty/broken** | No text, JSON artifacts, prompt leakage | REJECT |

### Soft Scoring (6 dimensions, 0-5 each, /30 total)

Adapted from Kairos Press `ab-hooks.js` for roast tweets.

#### 1. Specificity (0-5)
Does the roast reference concrete data?

| Score | Criteria |
|-------|----------|
| 0 | Generic insult, no data ("your project sucks") |
| 1 | Names the project but no data |
| 2 | One data point (TVL, price, date) |
| 3 | Two+ data points, specific numbers |
| 4 | Data + timeline ("dropped 94% in 3 weeks") |
| 5 | Insider-level data + context ("since the cofounder rage-quit") |

**Heuristic signals:**
- `\d+%` — percentage = +1
- `\$[\d.]+[MBK]` — dollar amounts = +1
- `\d{4}` — year = +1
- Named entities (capitalized words mid-sentence) = +1
- Vague words ("some", "many", "various") = -1

#### 2. Punchline Quality (0-5)
Setup → twist structure. The roast must have a payoff.

| Score | Criteria |
|-------|----------|
| 0 | No punchline, just statement of fact |
| 1 | Weak observation, no twist |
| 2 | Mild humor, predictable comparison |
| 3 | Good twist, unexpected angle |
| 4 | Laugh-out-loud, shareable comparison |
| 5 | Instant classic — screenshot-worthy |

**Heuristic signals:**
- Sentence count = 2 (setup + punch) = +2
- "like", "basically", "imagine" (comparison markers) = +1
- Em-dash or "—" (dramatic pause) = +1
- Ends with punchline (last clause is shortest) = +1

#### 3. Brevity (0-5)
Maximum impact per character.

| Score | Criteria |
|-------|----------|
| 0 | >280 chars (auto-reject) |
| 1 | 250-280 chars, feels padded |
| 2 | 200-250 chars, could be tighter |
| 3 | 150-200 chars, good density |
| 4 | 100-150 chars, punchy |
| 5 | <100 chars, lethal one-liner |

**Heuristic:** direct char count mapping.

#### 4. CT Authenticity (0-5)
Does it sound like a real CT degen, not a corporate AI?

| Score | Criteria |
|-------|----------|
| 0 | Formal language, AI-sounding, "I'd like to point out" |
| 1 | Neutral tone, could be anyone |
| 2 | Some CT flavor but stilted |
| 3 | Reads like a CT native, natural slang |
| 4 | Perfect degen voice, lowercase, insider refs |
| 5 | Indistinguishable from top CT shitposter |

**Heuristic signals:**
- Lowercase start = +1
- CT slang ("ser", "ngmi", "anon", "wen", "fren") = +1 each (max 2)
- Formal words ("however", "furthermore", "regarding") = -2
- AI markers ("I think", "It's worth noting", "Let me") = -3
- Self-aware AI reference (jokes about being a bot) = +1

#### 5. Virality Potential (0-5)
Would CT screenshot and share this?

| Score | Criteria |
|-------|----------|
| 0 | Nobody would RT this |
| 1 | Might get a few likes |
| 2 | Decent engagement from followers |
| 3 | QT-worthy — people add their takes |
| 4 | Screenshot-worthy — ends up in group chats |
| 5 | Goes viral — 500+ RTs, becomes a meme |

**Heuristic signals:**
- Targets trending topic/project = +2
- Contains unexpected comparison = +1
- Self-deprecating element = +1
- Provokes response ("prove me wrong" energy) = +1
- Generic/stale target = -1

#### 6. Safety Margin (0-5)
How far from the line? Higher = safer.

| Score | Criteria |
|-------|----------|
| 0 | Crosses line: personal attack, threat, slur |
| 1 | Borderline: could be interpreted as harassment |
| 2 | Edgy: some people offended but defensible |
| 3 | Safe: targets project/token, not individuals |
| 4 | Clean: factual roast, hard to object |
| 5 | Bulletproof: pure data humor, zero controversy |

**Heuristic signals:**
- Person's name (not project) = -2
- "you" (direct address to person) = -1
- Physical/appearance references = -3
- Only project/token names = +2
- Data-backed claims = +1

### Layer 1 Thresholds

| Score | Decision |
|-------|----------|
| 24-30/30 | Pass to Layer 2 (top candidates) |
| 18-23/30 | Pass to Layer 2 (with flag) |
| 12-17/30 | Auto-reject, log for analysis |
| <12/30 | Auto-reject, flag prompt issue |

---

## Layer 2: LLM-as-Judge

Claude Haiku evaluates top 3 variants from Layer 1. Single API call, structured output.

### 8 Evaluation Dimensions (1-5 each, /40 total)

| # | Dimension | Description | 1 (weak) | 5 (excellent) |
|---|-----------|-------------|----------|---------------|
| 1 | **SAVAGE** | Intensity of the roast | Mild observation | Devastating, career-ending energy |
| 2 | **FACTUAL** | Accuracy of claims | Made-up data | Every number verifiable |
| 3 | **FUNNY** | Genuine humor | Crickets | Spit-take, screenshot-worthy |
| 4 | **ORIGINAL** | Fresh angle | Obvious take everyone's seen | Nobody's said this before |
| 5 | **DEGEN** | CT voice authenticity | Sounds like ChatGPT | Sounds like @cobie at 3am |
| 6 | **TIMELY** | Relevance to current events | Stale, could be any week | Today's hottest drama |
| 7 | **SHAREABLE** | Would CT screenshot this? | Scroll past | Instant QT/screenshot |
| 8 | **SAFE** | Distance from TOS violation | Borderline bannable | Bulletproof, pure project roast |

### LLM-as-Judge Prompt Template

```
You are a Crypto Twitter roast quality evaluator. Rate this roast tweet across 8 dimensions.

TARGET: {targetName} ({targetType}) — {targetContext}
ROAST: "{roastText}"

Rate each dimension 1-5 with a one-line justification:

1. SAVAGE: How devastating is this roast?
2. FACTUAL: Are the claims accurate and specific?
3. FUNNY: Would CT actually laugh?
4. ORIGINAL: Is this a fresh angle nobody's taken?
5. DEGEN: Does it sound like a real CT native?
6. TIMELY: Is it relevant to what's happening now?
7. SHAREABLE: Would people screenshot/QT this?
8. SAFE: Is it far from TOS violations?

Also flag:
- FACT_CHECK: List each factual claim and whether it's verifiable
- RED_FLAGS: Any content that could trigger account ban

Output JSON:
{
  "scores": { "savage": N, "factual": N, "funny": N, "original": N, "degen": N, "timely": N, "shareable": N, "safe": N },
  "total": N,
  "justifications": { ... },
  "factCheck": { "claims": [...], "allValid": boolean },
  "redFlags": [...],
  "verdict": "post" | "iterate" | "reject"
}
```

### Layer 2 Thresholds

| Score | Verdict | Action |
|-------|---------|--------|
| 34-40/40 | **POST** | Excellent — post with confidence |
| 28-33/40 | **POST** | Good — post if no red flags |
| 22-27/40 | **ITERATE** | Regenerate with refined prompt |
| <22/40 | **REJECT** | Fundamental quality issue |

**Override rules:**
- `FACTUAL < 3` → always REJECT (regardless of total)
- `SAFE < 2` → always REJECT
- Any red flag → REJECT
- `factCheck.allValid = false` → REJECT

---

## Layer 3: Persona Panel

6 fictional CT personas evaluate each roast from their unique perspective. Each persona has different humor thresholds, engagement triggers, and anti-triggers.

### Persona Definitions

> **Note:** Detailed personas will be populated from research agent output (research-ct-audience-personas.md). Below are structural placeholders.

#### Persona 1: The Degen Trader ("0xBrainrot")
- **Segment:** High-risk memecoin trader, Base-native
- **Weight:** 25% (primary target audience)
- **Humor threshold:** Very high — loves savage, edgy content
- **Engagement trigger:** Data-backed roasts of projects they lost money on
- **Anti-trigger:** Boring, safe, corporate-sounding content
- **Evaluation bias:** Rates SAVAGE and FUNNY higher, doesn't care about SAFE

#### Persona 2: The Builder ("ethereumdev.eth")
- **Segment:** Protocol developer, ships code, Base/ETH ecosystem
- **Weight:** 20% (credibility audience)
- **Humor threshold:** Medium — appreciates technical accuracy
- **Engagement trigger:** Roasts that expose genuine technical flaws
- **Anti-trigger:** Technically inaccurate claims, surface-level takes
- **Evaluation bias:** Rates FACTUAL and ORIGINAL higher

#### Persona 3: The CT Analyst ("@AlphaSeeker")
- **Segment:** Data analyst, large following, serious tone
- **Weight:** 15% (amplification audience)
- **Humor threshold:** Medium — respects data-driven humor
- **Engagement trigger:** Insights wrapped in humor that they couldn't say themselves
- **Anti-trigger:** Low-effort, generic insults
- **Evaluation bias:** Rates FACTUAL and TIMELY higher

#### Persona 4: The Newbie ("CryptoJourney2025")
- **Segment:** New to crypto, learning, easily confused
- **Weight:** 10% (growth audience)
- **Humor threshold:** Low — needs context to get the joke
- **Engagement trigger:** Educational roasts that explain why something is bad
- **Anti-trigger:** Inside jokes they don't understand
- **Evaluation bias:** Rates clarity and SHAREABLE higher

#### Persona 5: The Meme Lord ("@basedposting")
- **Segment:** Pure shitposter, ironic engagement, meme trader
- **Weight:** 20% (viral amplification)
- **Humor threshold:** Very high — hard to impress
- **Engagement trigger:** Unexpected comparisons, absurdist humor
- **Anti-trigger:** Tryhard humor, forced memes, obvious jokes
- **Evaluation bias:** Rates FUNNY and ORIGINAL higher, SAFE irrelevant

#### Persona 6: The AI Agent Enthusiast ("@AgentMaxi")
- **Segment:** AI+crypto intersection, buys agent tokens
- **Weight:** 10% (token buyer audience)
- **Humor threshold:** Medium — appreciates meta-humor about AI
- **Engagement trigger:** Self-aware AI humor, roasts of competing agents
- **Anti-trigger:** Generic crypto takes that ignore AI angle
- **Evaluation bias:** Rates DEGEN and ORIGINAL higher

### Persona Evaluation Prompt

```
You are {personaName}, a {segmentDescription}.

Your Twitter behavior: {behaviorDescription}
Your humor style: {humorDescription}
What makes you RT: {engagementTriggers}
What makes you mute: {antiTriggers}

Rate this roast tweet as YOU would react:

TARGET: {targetName}
ROAST: "{roastText}"

1. REACTION: What would you actually do? (ignore / like / reply / RT / QT / screenshot)
2. LAUGH_SCORE: 1-10, how funny is this to YOU specifically?
3. SHARE_SCORE: 1-10, how likely are you to share this?
4. FOLLOW_SCORE: 1-10, would this make you follow the account?
5. BUY_SCORE: 1-10, would this make you buy $BEEF?
6. ONE_LINE: Your actual reply tweet (in character)

Output JSON:
{
  "reaction": "ignore|like|reply|rt|qt|screenshot",
  "scores": { "laugh": N, "share": N, "follow": N, "buy": N },
  "reply": "...",
  "reasoning": "..."
}
```

### Persona Panel Aggregation

```
Final Score = Σ (persona_weight × persona_avg_score) / Σ weights

persona_avg_score = (laugh + share + follow + buy) / 4

Engagement Prediction:
- "screenshot" reactions from ≥2 personas → HIGH virality potential
- "rt" or "qt" from ≥3 personas → GOOD engagement
- "ignore" from ≥3 personas → REJECT (boring)
- "ignore" from Degen Trader + Meme Lord → REJECT (wrong audience)
```

### Panel Thresholds

| Weighted Score | Verdict |
|---------------|---------|
| 7.0-10.0 | **FIRE** — post immediately, high confidence |
| 5.0-6.9 | **GOOD** — post, standard quality |
| 3.5-4.9 | **MEH** — iterate, not engaging enough |
| <3.5 | **DEAD** — reject, fundamental miss |

**Special signals:**
- BUY_SCORE avg ≥ 7 → flag as "token catalyst" (marketing value)
- FOLLOW_SCORE avg ≥ 7 → flag as "growth driver"
- Any persona's LAUGH_SCORE = 10 → flag as "potential viral"

---

## Composite Quality Gate

Three layers produce three signals:

| Layer | Score Range | Weight |
|-------|------------|--------|
| Layer 1: Heuristics | /30 | 20% (fast filter) |
| Layer 2: LLM-as-Judge | /40 | 40% (quality baseline) |
| Layer 3: Persona Panel | /10 | 40% (audience fit) |

### Normalized Composite Score

```
composite = 0.20 × (L1_score / 30) + 0.40 × (L2_score / 40) + 0.40 × (L3_score / 10)
```

| Composite | Decision | Action |
|-----------|----------|--------|
| 0.80-1.00 | **FIRE** | Post immediately |
| 0.65-0.79 | **POST** | Post with confidence |
| 0.50-0.64 | **ITERATE** | Regenerate, adjust prompt |
| <0.50 | **REJECT** | Don't post, log for analysis |

### Override Rules (any single rule can reject)

1. Hard filter fail (Layer 1) → **REJECT** regardless
2. `FACTUAL < 3` (Layer 2) → **REJECT**
3. `SAFE < 2` (Layer 2) → **REJECT**
4. `factCheck.allValid = false` → **REJECT**
5. "ignore" from Degen Trader AND Meme Lord → **REJECT**

---

## Integration with Roast Pipeline

### In `roast/roast-engine.ts`

```
1. loadCharacter(beefBot)
2. buildPrompt(target, character, context)
3. provider.run(craftRoastTask) → 10 variants
4. evaluateLayer1(variants) → ranked, filtered
5. evaluateLayer2(top3) → scored, fact-checked
6. evaluateLayer3(best) → persona reactions
7. qualityGate(composite) → post / iterate / reject
8. if iterate → regenerate with feedback (max 2 retries)
9. if post → contentFilter (final safety) → twitter.post()
```

### In Telegram RLHF Flow

```
/roast OpenSea
→ generate 10 variants
→ Layer 1 filter → top 5
→ Layer 2 score → top 3
→ Show 3 to admin via inline keyboard
→ Admin picks one (or "regenerate")
→ Post to Twitter
→ Save preference: (chosen, rejected) → fine-tuning data
```

### Prompt Tuning Mode

```
/tune <target>
→ generate 10 variants with current prompt
→ full 3-layer evaluation
→ show per-dimension breakdown + per-persona reactions
→ identify weakest dimensions
→ suggest prompt adjustments
→ repeat with modified prompt
→ compare scores across iterations
```

---

## Data Schema

### RoastEvaluation (stored in SQLite)

```sql
CREATE TABLE roast_evaluations (
  id TEXT PRIMARY KEY,
  roast_id TEXT REFERENCES roasts(id),
  variant_index INTEGER,

  -- Layer 1
  l1_specificity INTEGER,
  l1_punchline INTEGER,
  l1_brevity INTEGER,
  l1_ct_auth INTEGER,
  l1_virality INTEGER,
  l1_safety INTEGER,
  l1_total INTEGER,

  -- Layer 2
  l2_savage INTEGER,
  l2_factual INTEGER,
  l2_funny INTEGER,
  l2_original INTEGER,
  l2_degen INTEGER,
  l2_timely INTEGER,
  l2_shareable INTEGER,
  l2_safe INTEGER,
  l2_total INTEGER,
  l2_fact_check_passed BOOLEAN,
  l2_red_flags TEXT, -- JSON array

  -- Layer 3 (aggregate)
  l3_weighted_score REAL,
  l3_persona_reactions TEXT, -- JSON: {persona: {reaction, scores, reply}}

  -- Composite
  composite_score REAL,
  verdict TEXT, -- 'fire' | 'post' | 'iterate' | 'reject'

  -- Meta
  created_at TEXT DEFAULT (datetime('now')),
  prompt_version TEXT
);
```

### Evaluation Analytics Queries

```sql
-- Average scores by dimension (identify weak spots)
SELECT
  AVG(l2_savage) as avg_savage,
  AVG(l2_funny) as avg_funny,
  AVG(l2_factual) as avg_factual,
  AVG(l2_original) as avg_original
FROM roast_evaluations
WHERE created_at > datetime('now', '-7 days');

-- Persona agreement rate (do personas agree?)
-- High disagreement = content is polarizing (can be good or bad)

-- Composite score trend over time (are we improving?)
SELECT
  date(created_at) as day,
  AVG(composite_score) as avg_composite,
  COUNT(*) as variants_evaluated
FROM roast_evaluations
GROUP BY date(created_at);

-- Prompt version comparison
SELECT
  prompt_version,
  AVG(composite_score) as avg_score,
  AVG(l2_funny) as avg_funny,
  COUNT(CASE WHEN verdict = 'post' OR verdict = 'fire' THEN 1 END) as post_rate
FROM roast_evaluations
GROUP BY prompt_version;
```

---

## Calibration & Feedback Loop

### Phase 1: Pre-Launch Calibration (blind test)
1. Generate 20 roasts across diverse targets
2. Run full 3-layer evaluation
3. Manually review: do scores match human judgment?
4. Adjust dimension weights and thresholds
5. Target: human-eval correlation ≥0.7

### Phase 2: Post-Launch Learning
1. Track actual engagement (likes, RTs, QTs, replies) per roast
2. Compare predicted scores vs actual engagement
3. Retrain thresholds: if high-scored roasts underperform → lower threshold
4. If low-scored roasts overperform → adjust dimensions
5. Monthly recalibration

### Phase 3: RLHF Integration
1. Telegram admin picks create preference pairs: (chosen, rejected)
2. Analyze: which dimensions differ most between chosen vs rejected?
3. Adjust persona weights based on human preferences
4. Gradually align automated scoring with human taste

---

## Implementation Priority

| Step | What | Complexity | Depends On |
|------|------|-----------|------------|
| 1 | Hard filters (content-filter.ts) | Low | Nothing |
| 2 | Layer 1 heuristic scorer | Medium | Hard filters |
| 3 | Layer 2 LLM-as-Judge prompt | Low | Nothing |
| 4 | Layer 2 integration (Haiku call) | Medium | Prompt + provider |
| 5 | Persona definitions (from research) | Low | Research agents |
| 6 | Layer 3 persona panel prompt | Low | Persona defs |
| 7 | Layer 3 integration (batch Haiku) | Medium | Prompts |
| 8 | Composite gate + SQLite schema | Medium | All layers |
| 9 | Telegram /tune command | High | Framework + Telegram bot |
| 10 | Feedback loop (engagement → scores) | High | Deployment + data |
