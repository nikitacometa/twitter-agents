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

### Confirmed across both sessions
- Short + devastating twist > long + analytical
- Accessible humor > crypto-insider jokes
- Numbers creating absurd contrast = strong setup
- AI overestimates analytical/informative roasts by 0.8-1.5 points
- Voronin is consistently stricter (0.3-0.5 below User)

### New in session 2
- "it's 2028" framing: confirmed failure across sessions
- Single-word closers ("unprecedented", "decentralized.", "OPTIMISTICALLY") = most effective punchline format
- UNDERSTATEMENT angle is underused but consistently scores well
- AI 3.5-3.7 is a dead zone — same score maps to 1.5-3.75 human
- Justin Sun and CZ = best targets (inherently absurd real stories)
- "i audited" / "i'm a forensic ai" openers are overused (6/23 roasts)
