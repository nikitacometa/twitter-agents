# Training Sessions Log

Human evaluation sessions where both founders (Nikita Gorokhov + Nikita Voronin) blind-rate farm-generated roasts. Each session drives evaluator calibration, stockpile curation, and prompt improvements.

---

## Session 1 — 2026-03-21

**Scope:** 33 roasts across 6 batches (targets: Jesse Pollak, OpenSea, bankrbot, Tether Gold, PAX Gold, Hyperliquid, Cardano, Pump.fun, Virtuals, Justin Sun, Net Protocol, Zora, Base)

**Results:** 11 keep (>= 3.3 avg), 8 borderline (3.0-3.2), 14 rejected (< 3.0)

**Key findings:**
- Short + devastating twist > long + analytical
- Single killer word punchlines work best ("witnesses", "LIQUIDATION")
- Obscure targets (Net Protocol, Zora, Base) consistently fail
- AI inflates analytical roasts (3.5-4.1 AI -> 0-2.0 human)
- Voronin ~0.5-1.0 stricter on average

**Actions taken:**
- FUNNY weight: 0.20 -> 0.30, SHAREABLE: 0.15 -> 0.20, FACTUAL: 0.10 -> 0.05
- Pre-filter: added too-technical patterns, truncation detection
- Few-shots: reduced from 26 to 6 curated (human_score >= 4.0)
- Judge personas: updated to penalize obscure targets

---

## Session 2 — 2026-03-21 (evening batches)

**Scope:** 23 roasts across 3 batches (targets: CZ, Brian Armstrong, BSC, Vitalik Buterin, TON, Justin Sun, Virtuals Protocol)

### Full ratings

| # | Stockpile ID | Attempt ID | Target | Text (truncated) | AI Score | User | Voronin | Avg | Angle | Strategy |
|---|-------------|-----------|--------|-------------------|----------|------|---------|-----|-------|----------|
| 1 | 63 | 253 | Justin Sun | "flag financial crime...exceeds my parameters. unprecedented." | 4.0 | 4.0 | 4.5 | **4.25** | SELF_AWARE | persona |
| 2 | 82 | 300 | CZ | "paid $4.3B...prison was his most profitable quarter." | 3.5 | 4.0 | 3.5 | **3.75** | UNDERSTATEMENT | adversarial |
| 3 | 69 | 271 | BSC | "validator set can be shut down by one man texting a group chat" | 3.6 | 4.0 | 3.5 | **3.75** | DATA_BOMB | adversarial |
| 4 | 66 | 266 | TON | "$300M xAI deal...reading both posts was too much due diligence." | 3.9 | 4.5 | 3.0 | **3.75** | QUOTE_FLIP | adversarial |
| 5 | 71 | 275 | Brian Armstrong | "120m verified users, 8.7m who transact...OPTIMISTICALLY." | 3.5 | 4.0 | 3.0 | **3.50** | SELF_AWARE | rubric |
| 6 | 62 | 252 | Justin Sun | "holds most of tron's supply...decentralized." | 3.6 | 3.5 | 3.5 | **3.50** | RHETORICAL | persona |
| 7 | 64 | 255 | Justin Sun | "do kwon and sam bankman-fried went to jail...evolution." | 3.7 | 3.0 | 3.5 | **3.25** | COMPARISON | persona |
| 8 | 76 | 284 | Vitalik | "$1.22M monthly L1 revenue...behind tron. base makes 3x more." | 3.5 | 3.5 | 3.0 | **3.25** | SELF_AWARE | adversarial |
| 9 | 75 | 283 | Vitalik | "sold 17,000 ETH...CoW protocol...what are the rest of us using?" | 3.6 | 2.5 | 3.8 | **3.15** | RHETORICAL | persona |
| 10 | 81 | 299 | CZ | "told binance staff 'don't leave anything in writing' is writing a memoir." | 4.0 | 3.5 | 2.5 | **3.00** | COMPARISON | adversarial |
| 11 | 79 | 296 | CZ | "pled guilty...most inspiring career pivot i've ever audited." | 3.7 | 4.0 | 2.0 | **3.00** | COMPARISON | persona |
| 12 | 77 | 286 | Vitalik | "16,384 ETH unstaked...exactly 2^14...optimizing for elegance on the way out." | 3.5 | 3.5 | 2.5 | **3.00** | RHETORICAL | adversarial |
| 13 | 72 | 276 | Brian Armstrong | "deliberately said 'bitcoin, ethereum'...price of a USED honda civic." | 3.6 | 2.0 | 3.5 | **2.75** | QUOTE_FLIP | rubric |
| 14 | 70 | 272 | TON | "messaging token, securities violation, tap-to-earn casino...fewer business lines." | 3.5 | 2.5 | 3.0 | **2.75** | COMPARISON | persona |
| 15 | 67 | 268 | TON | "1 billion telegram users, 33,852 daily active wallets...hamster down 70%." | 3.6 | 3.0 | 2.0 | **2.50** | COMPARISON | adversarial |
| 16 | 68 | 270 | BSC | "cz posted a photo of his dog...rug pull ever conducted by a pet." | 3.7 | 2.5 | 2.0 | **2.25** | TIMELINE | adversarial |
| 17 | 60 | 246 | Virtuals | "18,000 agents, $479M in 'GDP'...BCG-to-vtuber pipeline is real." | 3.6 | 2.0 | 2.5 | **2.25** | FAKE_COMPLIMENT | adversarial |
| 18 | 80 | 298 | CZ | "told compliance team 'ask forgiveness'...turns out he was right." | 3.5 | 2.0 | 2.5 | **2.25** | QUOTE_FLIP | persona |
| 19 | 73 | 280 | Vitalik | "i'm a forensic ai. even i can't explain how you sell 17k ETH..." | 3.7 | 1.5 | 2.5 | **2.00** | SELF_AWARE | rubric |
| 20 | 74 | 281 | Vitalik | "audited a $280B network...material impairment." | 3.6 | 2.0 | 2.0 | **2.00** | SELF_AWARE | persona |
| 21 | 61 | 248 | Justin Sun | "reverse-merged...theme park souvenirs...keychains are outperforming." | 3.6 | 2.0 | 2.0 | **2.00** | RHETORICAL | adversarial |
| 22 | 65 | 264 | TON | "raised $558M...down 84%...CONFIDENCE to schedule a Q4 earnings call." | 3.5 | 2.0 | 2.0 | **2.00** | QUOTE_FLIP | rubric |
| 23 | 78 | 292 | Brian Armstrong | "it's 2028. i remember a CEO who built a $70B exchange..." | 3.6 | 1.0 | 2.0 | **1.50** | FAKE_COMPLIMENT | persona |

### Summary statistics

| Metric | Value |
|--------|-------|
| Total roasts rated | 23 |
| Avg AI score | 3.63 |
| Avg human score (User) | 2.87 |
| Avg human score (Voronin) | 2.76 |
| Avg human score (combined) | 2.82 |
| AI overestimation (avg) | +0.81 |
| Keep (>= 3.25) | 8 (35%) |
| Borderline (2.5-3.24) | 6 (26%) |
| Reject (< 2.5) | 9 (39%) |
| Pearson User-Voronin | moderate (both rate Justin Sun high, Brian Armstrong "2028" low) |

### Stockpile actions

**Rejected (avg < 2.5, status -> rejected):**
- Stockpile 78: Brian Armstrong "it's 2028" (1.5)
- Stockpile 73: Vitalik "forensic ai. even i can't explain" (2.0)
- Stockpile 74: Vitalik "audited a $280B network" (2.0)
- Stockpile 61: Justin Sun "reverse-merged his blockchain" (2.0)
- Stockpile 65: TON "raised $558M" (2.0)
- Stockpile 68: BSC "cz posted photo of his dog" (2.25)
- Stockpile 60: Virtuals "18,000 agents, $479M" (2.25)
- Stockpile 80: CZ "told his compliance team" (2.25)

**Kept with human_score:** All others remain `available` with human_score recorded.

### Key findings

#### What makes roasts great (avg >= 3.5)

1. **Single-word/phrase closer that reframes everything** — "unprecedented." (4.25), "OPTIMISTICALLY" (3.5), "decentralized." (3.5), "most profitable quarter" (3.75)
2. **Short and punchy** — best roasts: 99-188 chars. Worst: 220-284 chars
3. **Escalating absurdity with ironic landing** — list increasingly insane real facts, then one phrase that makes the absurdity hit
4. **Accessible irony** — "reading both posts was too much due diligence" (3.75) doesn't need crypto knowledge to be funny
5. **UNDERSTATEMENT angle is powerful and underused** — only 1 roast used it, scored 3.75

#### What kills roasts (avg < 2.5)

1. **"it's 2028" framing** — failed in session 1 AND session 2 (avg 1.5). Dead format
2. **Fact listing without a funny twist** — accumulate 3-4 facts, weak punchline. "keychains are outperforming" (2.0) is a punchline but the setup is too long/boring
3. **"material impairment", "austerity"** — too-technical punchlines that CT doesn't use
4. **Self-aware openers that don't earn their keep** — "i'm a forensic ai. even i can't explain" (2.0) — the self-reference isn't funny on its own
5. **QUOTE_FLIP producing meh results** — "turns out he was right" (2.25), "CONFIDENCE to schedule" (2.0) — tepid closers

#### AI calibration gap

The 3.5-3.7 AI range is a **dead zone** — maps to human scores from 1.5 to 3.75:

| AI Score Range | Human Score Range | Diagnosis |
|---------------|------------------|-----------|
| 3.9-4.0 | 3.0-4.25 | Reasonable, but still overestimates |
| 3.6-3.7 | 1.5-3.75 | **Dead zone — AI can't differentiate** |
| 3.5 | 2.0-3.75 | Same problem |

Root cause: evaluator judges correctly weight FUNNY and SHAREABLE but can't assess whether a punchline will actually land with humans. The difference between "prison was his most profitable quarter" (3.75) and "keychains are outperforming" (2.0) is comedic timing/impact, not any rubric dimension.

#### User vs Voronin divergences

| Pattern | User | Voronin |
|---------|------|---------|
| CZ "pled guilty" (long career arc) | 4.0 | 2.0 |
| Vitalik "CoW protocol" (technical irony) | 2.5 | 3.8 |
| Brian Armstrong "prediction market" | 2.0 | 3.5 |
| Justin Sun "flag financial crime" | 4.0 | 4.5 |

**Interpretation:** Voronin penalizes long listy roasts more harshly, but appreciates technical irony that demonstrates deep knowledge. User values "did I laugh?" more purely. Both agree on what's clearly great (Justin Sun 4.25) and clearly bad (Brian Armstrong 2028: 1.5).

### Proposed improvements (see improvement plan below)

See `docs/improvement-plan-s2.md` for detailed action items.

---

## Cross-session patterns

### Confirmed across sessions 1-4
- Short + devastating twist > long + analytical (quantified: 0-100ch avg 3.72, 201-280ch avg 2.59)
- Accessible humor > crypto-insider jokes — non-crypto punchline metaphors ("feudalism", "lemonade stand", "grief response") universally score high
- Numbers creating absurd contrast = strong setup ($149K revenue vs $9.7B mcap, 4 months vs $47B)
- AI overestimates analytical/informative roasts by 0.7 points (mean bias across 80 samples)
- Punchline must REFRAME, not just conclude — "bear case" reframes a person, "feudalism" reframes tokenomics
- "it's 20XX" framing: dead (failed across 4 sessions)
- Single-word/phrase closers = most effective punchline format ("unprecedented.", "acceptance.", "LIQUIDATION", "feudalism.")
- UNDERSTATEMENT is the #1 angle (avg 3.73, only angle where AI doesn't overestimate)
- FAKE_COMPLIMENT mostly fails (avg 2.52, AI overestimates by +1.16)
- Big personalities > projects as targets (Jesse Pollak 4.07, CZ 3.21, Vitalik 3.27 vs Base 1.38, Zora 1.5)
- "i audited" / "i'm a forensic ai" openers overused — works only when the AI voice sets up a contrast funnier than the self-reference

### User vs Voronin pattern (stable across sessions)
- Voronin values financial/business humor and analytical depth ("expense ratio", "grief response", "L2 strategy")
- User values pure "did I laugh?" — absurdist and conceptual humor
- Both agree strongly on what's clearly great (Justin Sun 4.25, CZ 94000% 4.5) and clearly bad (Farcaster paradigm 1.25, "it's 2028" 1.5)
- Voronin more polarized: rates good stuff higher, bad stuff lower
- Average gap narrowed from -0.5 (S2, Voronin stricter) to +0.45 (S4 batch 1, Voronin more generous) — suggests quality improvement, not calibration drift

---

## Session 3 — 2026-03-21 (post-I2 validation)

**Scope:** 62 roasts, 7 targets: Brian Armstrong, Vitalik Buterin, TON, CZ, farcaster, solana, opensea. AI-only evaluation (no human blind review yet).

**Purpose:** Validate I2 improvement plan changes (punchline isolation, length guidance, pre-filter patterns, angle weight rebalance, judge calibration).

### Results summary

| Metric | S3 | S2 baseline |
|--------|-----|-------------|
| Generated | 62 | 56 |
| Pre-filtered | 24 (39%) | 0 (no pre-filter) |
| LLM-evaluated | 38 | 56 |
| Stockpiled | 14 (23% total, 37% of evaluated) | — |
| Avg AI score (evaluated) | 3.39 | 3.63 |
| Avg AI score (stockpiled) | 3.80 | — |
| Avg chars (stockpiled) | **131** | ~180 |

### Pre-filter effectiveness

24/62 (39%) rejected before LLM calls — saved ~120 judge invocations.

| Reason | Count |
|--------|-------|
| exceeds 3 sentences | ~19 |
| "it's 20XX" telegraphed | 5 |
| other telegraphed/generic | ~0 |

Adversarial strategy worst offender for sentence count (12/21 pre-filtered).

### Per-target results

| Target | Total | Pre-filtered | Stockpiled | Rate |
|--------|-------|-------------|-----------|------|
| CZ | 9 | 2 | 4 | 44% |
| Vitalik | 9 | 1 | 3 | 33% |
| farcaster | 8 | 5 | 2 | 25% |
| Brian Armstrong | 9 | 2 | 2 | 22% |
| solana | 9 | 6 | 1 | 11% |
| TON | 9 | 5 | 1 | 11% |
| opensea | 9 | 3 | 1 | 11% |

### Per-strategy results

| Strategy | Stockpiled | Pre-filtered | Avg score |
|----------|-----------|-------------|-----------|
| rubric | 7 (50%) | 7 | 3.49 |
| adversarial | 4 (29%) | 12 | 3.31 |
| persona | 3 (21%) | 5 | 3.35 |

### Top stockpiled roasts (pending human review)

| # | Score | Target | Angle | Chars | Text |
|---|-------|--------|-------|-------|------|
| 1 | 4.3 | farcaster | SELF_AWARE | 134 | "i'm a language model trained on financial disclosures and the most successful thing farcaster shipped in five years was a full refund." |
| 2 | 4.0 | Brian Armstrong | UNDERSTATEMENT | 90 | "$550 million sold, 88 trades, zero buys. brian, i say this gently — you ARE the bear case." |
| 3 | 3.9 | opensea | RHETORICAL | 132 | "90% of opensea's $2.6B comeback month was token swaps. the world's largest nft marketplace survived by not being an nft marketplace." |
| 4 | 3.9 | solana | SELF_AWARE | 137 | "i was built to detect fraud. solana's biggest app launched millions of tokens — nearly all rug pulls — i've never seen a cleaner dataset." |
| 5 | 3.9 | CZ | RULE_OF_THREE | 72 | "4 months, $50M fine, $47B richer. CZ's prison sentence returned 94,000%." |
| 6 | 3.9 | CZ | FAKE_COMPLIMENT | 94 | "$800K in lobbying bought CZ a presidential pardon. that's a lower expense ratio than vanguard." |
| 7 | 3.9 | Vitalik | COMPARISON | 145 | "vitalik 'left X' by posting to X through a wrapper called firefly. has anyone ever accidentally described ethereum's L2 strategy more accurately?" |

### Key observations

1. **Length improvement confirmed**: avg stockpiled 131 chars (was ~180). Best roasts: CZ 72 chars, Brian Armstrong 90 chars
2. **Pre-filter "it's 20XX" working**: caught 5 future-framing roasts (3 TON, 2 opensea)
3. **SELF_AWARE angle dominates**: 5/14 stockpiled (36%). Forensic AI voice is $BEEF's strongest identity signal
4. **Big personalities > projects**: CZ 44%, Vitalik 33% vs opensea/solana/TON 11% each
5. **DEGEN score remains weak**: many roasts score 1-2 on brand voice. Projects especially lack $BEEF identity
6. **Adversarial generates longest**: 12/21 pre-filtered for sentence count — strategy needs tighter constraints
7. **Needs human blind review** to validate AI scores against actual humor impact

---

## Session 4 — 2026-03-23 (human review of S3 + server farm)

**Scope:** 31 stockpile entries rated across 7 batches. Targets: CZ (5), Vitalik Buterin (8 incl. re-eval), Brian Armstrong (2), farcaster/Farcaster (6), opensea (2), solana (1), TON (1), Polygon (1), Cardano (1), pump.fun (3), tether (1), @nickvrnn (1). Batch 4 re-evaluated 8 Vitalik roasts from session 2.

**Evaluators:** Nikita Gorokhov (User) + Nikita Voronin. Blind review — AI scores hidden.

### Full ratings

| # | ID | Target | Text (truncated) | AI | User | Voronin | Avg | Angle |
|---|-----|--------|-------------------|-----|------|---------|-----|-------|
| 1 | 96 | CZ | "4 months, $50M fine, $47B richer...returned 94,000%." | 3.9 | 4.0 | 5.0 | **4.50** | RULE_OF_THREE |
| 2 | 100 | farcaster | "language model trained on financial disclosures...full refund." | 4.3 | 4.0 | 5.0 | **4.50** | SELF_AWARE |
| 3 | 92 | Vitalik | "hasn't meaningfully improved lives...in therapy: acceptance." | 3.6 | 4.0 | 4.65 | **4.33** | RULE_OF_THREE |
| 4 | 98 | TON | "248 wallets own 85%...she said 'honey that's feudalism.'" | 3.5 | 4.0 | 4.5 | **4.25** | QUOTE_FLIP |
| 5 | 102 | opensea | "survived by not being an nft marketplace." | 3.9 | 4.0 | 4.5 | **4.25** | RHETORICAL |
| 6 | 133 | Cardano | "$149K revenue. $9.7B market cap. peer-reviewed lemonade stand." | — | 4.2 | 4.0 | **4.10** | UNDERSTATEMENT |
| 7 | 91 | Vitalik | "left X through firefly...L2 strategy more accurately?" | 3.9 | 3.6 | 4.5 | **4.05** | COMPARISON |
| 8 | 89 | BA | "$550M sold, 88 trades, zero buys...you ARE the bear case." | 4.0 | 3.5 | 4.5 | **4.00** | UNDERSTATEMENT |
| 9 | 97 | CZ | "'they are here for crime'...unclear who 'they' was." | 3.7 | 3.0 | 4.8 | **3.90** | QUOTE_FLIP |
| 10 | 103 | pump.fun | "98% worthless is 'precisely the point.' $PUMP down 79%." | 3.5 | 4.2 | 3.5 | **3.85** | QUOTE_FLIP |
| 11 | 101 | solana | "detect fraud...cleanest dataset." | 3.9 | 3.0 | 4.5 | **3.75** | SELF_AWARE |
| 12 | 83 | OpenSea | "memecoin swap router...in my audit framework: 'hospice.'" | 3.5 | 4.0 | 3.5 | **3.75** | DATA_BOMB |
| 13 | 106 | @nickvrnn | "autopsy on 'b2b w wifey'...cause of death: arts and crafts." | 3.5 | 4.0 | 3.3 | **3.65** | SELF_AWARE |
| 14 | 87 | Farcaster | "wanting a billion...returning $180M...healthiest exit." | 3.5 | 3.5 | 3.5 | **3.50** | FAKE_COMPLIMENT |
| 15 | 93 | Vitalik | "99% net worth in 'wrong-shaped tool'...conviction or cry for help." | 3.6 | 3.0 | 3.9 | **3.45** | SELF_AWARE |
| 16 | 76 | Vitalik | "$1.22M monthly L1 revenue...behind tron." | 3.5 | 3.6 | 3.15 | **3.38** | SELF_AWARE |
| 17 | 105 | pump.fun | "$1.3B presale by founder who called presales 'a scam.'" | 3.6 | 3.7 | 3.0 | **3.35** | DATA_BOMB |
| 18 | 85 | Farcaster | "dan romero: '$150M for many years'...18 months later sold it." | 3.5 | 2.5 | 4.0 | **3.25** | UNDERSTATEMENT |
| 19 | 77 | Vitalik | "16,384 ETH...exactly 2^14...optimizing for elegance on the way out." | 3.5 | 3.5 | 2.75 | **3.25** | RHETORICAL |
| 20 | 134 | tether | "2027. cause of death undetermined...none would sign the AUDIT." | — | 3.5 | 3.0 | **3.25** | RHETORICAL |
| 21 | 75 | Vitalik | "CoW protocol...what are the rest of us using?" | 3.6 | 2.75 | 3.5 | **3.13** | RHETORICAL |
| 22 | 90 | BA | "$10.3B gone...88 consecutive sales...grief response." | 3.8 | 2.0 | 4.0 | **3.00** | SELF_AWARE |
| 23 | 86 | Farcaster | "audited farcaster's full arc...'it didn't work'...acceptance." | 3.5 | 2.5 | 3.5 | **3.00** | UNDERSTATEMENT |
| 24 | 104 | pump.fun | "$500M in 12 minutes...which percentile?" | 3.7 | 2.7 | 3.0 | **2.85** | COMPARISON |
| 25 | 88 | Polygon | "31 days between 'year of rebirth' and new ATL." | 3.7 | 3.5 | 2.0 | **2.75** | RHETORICAL |
| 26 | 95 | CZ | "$800K lobbying...lower expense ratio than vanguard." | 3.9 | 1.5 | 3.8 | **2.65** | FAKE_COMPLIMENT |
| 27 | 73 | Vitalik | "forensic ai...sell 17k ETH...call it austerity." | 3.7 | 2.7 | 3.7 | **2.60** | SELF_AWARE |
| 28 | 94 | CZ | "$110B...letting hamas use your exchange...grieve consequences." | 3.6 | 2.0 | 3.2 | **2.60** | SELF_AWARE |
| 29 | 74 | Vitalik | "$280B network...material impairment." | 3.6 | 2.0 | 2.0 | **2.00** | SELF_AWARE |
| 30 | 84 | Farcaster | "paradigm position...$150M in...technically a loss." | 3.7 | 1.5 | 1.0 | **1.25** | FAKE_COMPLIMENT |
| 31 | 99 | farcaster | "$180M, $2.8M revenue, 63% zero reactions." | 3.6 | 1.5 | 1.0 | **1.25** | DATA_BOMB |

### Summary statistics

| Metric | Value |
|--------|-------|
| Total roasts rated | 31 |
| Avg AI score | 3.61 (excl. 2 unscored) |
| Avg human (User) | 3.16 |
| Avg human (Voronin) | 3.58 |
| Avg human (combined) | 3.37 |
| AI overestimation (avg) | +0.30 (vs +0.81 in S2) |
| Keep (>= 3.25) | 21 (68%) |
| Borderline (2.5-3.24) | 6 (19%) |
| Reject (< 2.5) | 4 (13%) |

### Stockpile actions

**Rejected (avg < 2.5, status -> rejected):**
- ID 84: Farcaster "paradigm position...technically a loss" (1.25)
- ID 99: farcaster "$180M, $2.8M revenue" (1.25)

**Re-evaluated (batch 4, averaged with S2 scores):**
- ID 73: 2.0 → 2.6 (stays rejected — borderline but not enough)
- ID 74: 2.0 → 2.0 (stays rejected)
- ID 75: 3.15 → 3.13 (stable)
- ID 76: 3.25 → 3.38 (slight improvement)
- ID 77: 3.0 → 3.25 (improved to keep threshold)

### Key findings

#### Angle performance (all 82 rated, all sessions)

| Angle | N | Avg Human | AI Overestimate | Verdict |
|-------|---|-----------|-----------------|---------|
| UNDERSTATEMENT | 7 | **3.73** | -0.02 | **Best angle. Scale up.** |
| RULE_OF_THREE | 5 | **3.42** | +0.28 | Strong. Triplet + killer landing. |
| RHETORICAL | 10 | 3.15 | +0.49 | Solid middle. |
| COMPARISON | 10 | 3.01 | +0.66 | Decent but overestimated. |
| QUOTE_FLIP | 11 | 3.00 | +0.61 | High variance (2.0-4.25). |
| DATA_BOMB | 7 | 2.91 | +0.66 | Too factual, needs twist. |
| SELF_AWARE | 19 | 2.85 | +0.88 | Most used, most overestimated. |
| FAKE_COMPLIMENT | 8 | 2.52 | +1.16 | **Worst angle. Reduce or cut.** |
| TIMELINE | 3 | 2.67 | +0.93 | Weak. Cut. |

#### Length-quality correlation (82 rated)

| Bucket | N | Avg Human | Avg AI |
|--------|---|-----------|--------|
| 0-100 chars | 6 | **3.72** | 3.20 |
| 101-150 chars | 26 | **3.17** | 3.58 |
| 151-200 chars | 33 | 2.91 | 3.64 |
| 201-280 chars | 17 | 2.59 | 3.58 |

AI gives roughly the same score (3.5-3.6) regardless of length. Humans strongly penalize length. **Sweet spot: under 150 chars.**

#### AI calibration (82 rated, excl. 2 unscored)

| AI Range | N | Avg Human | Human Min | Human Max |
|----------|---|-----------|-----------|-----------|
| 4.0+ | 8 | 3.22 | 1.75 | 4.50 |
| 3.7-3.9 | 21 | 3.02 | 0.75 | 4.60 |
| 3.5-3.6 | 51 | 2.91 | 1.25 | 4.65 |

AI score is **not predictive** of human quality. The 3.5-3.6 range contains both the best (4.65) and worst (1.25) human-rated roasts. Mean absolute error: 0.89 points.

#### Quality improvement: S4 vs S2

| Metric | S2 | S4 | Change |
|--------|-----|-----|--------|
| Keep rate (>= 3.25) | 35% | **68%** | +33pp |
| Reject rate (< 2.5) | 39% | **13%** | -26pp |
| AI overestimation | +0.81 | **+0.30** | Improved |
| Avg human score | 2.82 | **3.37** | +0.55 |

**Significant quality jump.** The I2 changes (punchline isolation, length guidance, angle rebalance) produced measurably better roasts.

#### What makes a 4.0+ roast (pattern from 13 top entries)

1. **Single devastating reframe at the end** — "bear case", "feudalism", "lemonade stand", "full refund", "94,000%", "acceptance"
2. **Short** — avg 139 chars (vs 195 for bottom)
3. **Non-crypto punchline metaphor** — therapy, feudalism, lemonade stand, grief — anyone can understand
4. **Absurd real-world contrast** — $149K revenue vs $9.7B cap, 4 months vs $47B, $550M sold + zero buys
5. **One-sentence structure preferred** — setup → em-dash or period → reframe

#### What kills a roast (pattern from 10 bottom entries)

1. **Obscure/niche targets** — Net Protocol, Zora, Base
2. **Technical jargon punchlines** — "material impairment", "bucket shop", "technically a loss"
3. **Pure facts without reframe** — "$180M, $2.8M revenue, 63% zero reactions" = interesting but not funny
4. **Self-deprecating AI that doesn't earn its keep** — "i run on €4/month" → consistently fails
5. **"it's 20XX" dead format** — confirmed across 4 sessions
