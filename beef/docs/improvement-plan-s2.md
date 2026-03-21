# Improvement Plan — Session 2

Based on 23 roasts rated by both founders (session 2, 2026-03-21 evening) + 33 from session 1. Total human-rated corpus: 56 roasts.

## Executive Summary

AI overestimates by +0.81 on average. The 3.5-3.7 AI range is a dead zone mapping to human 1.5-3.75. Root cause: evaluator can't assess comedic timing and punchline impact. Roasts that are "factually devastating but not funny" still score 3.5+ from AI.

**Top priority:** Teach the system the difference between clever analysis and comedy. The best roasts are SHORT with a single devastating closer.

---

## Changes by System Component

### 1. Pre-filter (evaluator.ts) — 3 additions

**1a. Ban "it's 2028" framing**
- Pattern: `/^it's 20\d\d\b/i`
- Evidence: Failed in session 1 AND session 2. Brian Armstrong "it's 2028" scored 1.5 avg. This framing adds setup length without comedic value
- File: `src/evaluation/evaluator.ts`, add to `TELEGRAPHED_PATTERNS`

**1b. Ban "genuinely the most" pattern**
- Pattern: `/genuinely the most/i`
- Evidence: "genuinely the most inspiring career pivot" (3.0 avg) — reads as sarcasm label, telegraphs the joke
- File: `src/evaluation/evaluator.ts`, add to `TELEGRAPHED_PATTERNS`

**1c. Soft penalty for "i audited" / "i'm a forensic" overuse**
- Not a hard ban — these openers work sometimes (BSC "validator set" 3.75)
- But 6/23 roasts used these openers. When ALL variants from a batch use it, diversity suffers
- Implementation: track opener diversity in the farm pipeline. If >50% of a target's variants start with "i audited" or "i'm a forensic", flag in logs

### 2. Few-shot Examples (beef-bot.json) — 2 additions, 1 replacement

**2a. Add: CZ "prison was his most profitable quarter"**
```json
{
  "text": "CZ paid $4.3B in fines, served 4 months, and came out $47B richer. prison was his most profitable quarter.",
  "target": "CZ",
  "angle": "UNDERSTATEMENT",
  "charCount": 107
}
```
- Score: 3.75 avg. Demonstrates UNDERSTATEMENT angle (underrepresented — only 1 of 6 current examples uses it, and that's Virtuals which is also UNDERSTATEMENT)
- Ultra-short (107 chars), killer single-phrase closer

**2b. Add: TON "xAI deal — reading both posts was too much due diligence"**
```json
{
  "text": "$300 million xAI deal announced by durov\u2014musk replied 'no deal has been signed.' toncoin still closed green because reading both posts was too much due diligence.",
  "target": "TON",
  "angle": "QUOTE_FLIP",
  "charCount": 164
}
```
- Score: 3.75 avg. Demonstrates QUOTE_FLIP done right — two quotes in tension, then a CT-accessible punchline
- Contrasts with bad QUOTE_FLIP examples ("turns out he was right" scored 2.25)

**2c. Consider replacing Jesse Pollak example**
- Jesse Pollak "four thousand whitepapers" (203 chars) was rated 3.75 in session 1 but is the longest example at 203 chars
- Keeping it anchors the model toward longer roasts
- Replace with Brian Armstrong "120m vs 8.7m OPTIMISTICALLY" (117 chars, scored 3.5) to demonstrate the short SELF_AWARE format

After changes: 8 few-shots covering FAKE_COMPLIMENT (2), UNDERSTATEMENT (1), SELF_AWARE (2), QUOTE_FLIP (1), COMPARISON (0... consider adding one)

### 3. Character Voice (beef-bot.json) — 2 additions

**3a. Add to signatureMoves: "The One-Word Closer"**
```
"The One-Word Closer — setup lists escalating facts, single word/phrase at the end reframes everything ('unprecedented.', 'decentralized.', 'OPTIMISTICALLY', 'evolution.')"
```
- Evidence: 4 of top 6 rated roasts use this device. It's the highest-impact technique not currently named

**3b. Add to forbiddenPatterns: future-framing**
```
"Setting roast in the future ('it's 2028', 'it's 2030') — adds length without comedy, consistently fails in blind evaluation"
```

### 4. Prompt Builder (prompt-builder.ts) — 3 changes

**4a. Add punchline isolation instruction to all 3 strategies**
After the "MAX 2 sentences" constraint, add:
```
- Your punchline must work in ISOLATION. Extract the last 5-10 words — if they're not funny alone, rewrite.
- Best punchlines are 1-5 words that reframe the entire setup: "unprecedented.", "decentralized.", "evolution."
```
This directly addresses the dead zone: the model generates facts but doesn't concentrate humor into the closer.

**4b. Add explicit length guidance with quality scaling**
Replace "Be UNDER 280 characters" with:
```
- TARGET LENGTH: 80-150 characters. Under 120 is ideal.
- You MAY go up to 280 chars ONLY if every additional word earns its place.
- Data shows: roasts under 150 chars score 3.4 avg; over 200 chars score 2.3 avg.
```
Concrete numbers from our data make the instruction more compelling to the model.

**4c. Boost UNDERSTATEMENT angle weight**
In `pickAngles()`, add default weights:
```typescript
const DEFAULT_WEIGHTS: AngleWeight[] = [
  { angle: 'UNDERSTATEMENT', weight: 1.8 },
  { angle: 'DATA_BOMB', weight: 1.3 },
  { angle: 'COMPARISON', weight: 1.0 },
  { angle: 'FAKE_COMPLIMENT', weight: 1.0 },
  { angle: 'SELF_AWARE', weight: 1.0 },
  { angle: 'QUOTE_FLIP', weight: 0.8 },
  { angle: 'RHETORICAL', weight: 0.9 },
  { angle: 'TIMELINE', weight: 0.6 },
  { angle: 'RULE_OF_THREE', weight: 0.7 },
];
```
Rationale from data:
- UNDERSTATEMENT: 1 sample, 3.75 avg — underrepresented, high quality
- DATA_BOMB: strong when paired with short format (BSC validator 3.75)
- TIMELINE: "cz posted photo of dog" scored 2.25 — the chronological format produces flat narratives
- QUOTE_FLIP: mixed results (3.75 TON xAI but 2.0-2.25 on "turns out he was right" and "$558M")
- RULE_OF_THREE: not represented well in this session's data

### 5. Evaluator Judges (judge-personas.ts) — 2 calibration updates

**5a. Add "punchline impact" to ct_degen judge**
The `ct_degen` judge should explicitly check: "Does the last phrase make you stop scrolling? Could you tweet just the punchline and it would still be funny?"

**5b. Add length penalty to comedy_writer judge**
"Roasts over 180 chars get a FUNNY penalty of -0.5 unless the punchline is exceptional. Most great comedy is short."

This directly addresses the 3.5-3.7 dead zone — longer roasts with tepid punchlines currently score the same as shorter roasts with devastating closers.

### 6. Evaluator Weights (evaluator.ts) — no change

Current weights (FUNNY 0.30, SHAREABLE 0.20) are correct. The problem isn't weight distribution — it's that judges give similar FUNNY scores to roasts humans rate 2.0 vs 3.75. The fix is in judge calibration (5a, 5b), not weights.

### 7. Farm Pipeline — 1 diversity check

**Track opener diversity per target batch**
When generating 3 variants per strategy (9 total per target), log how many start with:
- "i audited" / "i'm a forensic" / "i was built to"
- "it's 2028" / "it's 20XX"

If >60% use the same opener family, log a warning. Future: re-generate the duplicates.

### 8. Anti-pattern Examples — enhance

Currently `buildAntiPatternSection()` shows 3 rejected examples. Enhance with WHY they failed:
```
## ANTI-PATTERNS (rated BAD by humans — avoid similar patterns)
  - [RHETORICAL] "he reverse-merged..." (target: Justin Sun) — TOO LONG, lists facts without a funny twist
  - [SELF_AWARE] "i'm a forensic ai. even i can't explain..." (target: Vitalik) — self-reference is setup, but payload is boring
  - [FAKE_COMPLIMENT] "it's 2028. i remember a CEO..." (target: Brian Armstrong) — future framing never works
```
Adding "why it failed" gives the model actionable guidance, not just negative examples.

---

## Implementation Priority

| Priority | Change | Impact | Effort |
|----------|--------|--------|--------|
| P0 | 4a: Punchline isolation instruction | High — directly targets the root cause | 10 min |
| P0 | 4b: Length guidance with data | High — data-backed constraint | 5 min |
| P0 | 1a: Ban "it's 2028" | Medium — prevents known failures | 2 min |
| P1 | 2a-2c: Few-shot updates | High — anchors model toward shorter, punchier | 15 min |
| P1 | 3a: "One-Word Closer" signature move | Medium — names the pattern | 5 min |
| P1 | 5a-5b: Judge calibration | Medium — improves dead zone differentiation | 20 min |
| P1 | 4c: Angle weight defaults | Medium — more UNDERSTATEMENT, less TIMELINE | 10 min |
| P2 | 3b: Ban future-framing in character | Low — covered by pre-filter | 2 min |
| P2 | 1b: Ban "genuinely the most" | Low — rare occurrence | 2 min |
| P2 | 7: Opener diversity tracking | Low — observability improvement | 15 min |
| P2 | 8: Anti-pattern enhancement | Medium — better negative examples | 10 min |

**Total estimated implementation: ~1.5 hours**

---

## Success Criteria

After implementing, run a new farm batch (3 targets, 9 roasts per target = 27) and blind-evaluate:
1. Average human score >= 3.2 (currently 2.82)
2. AI-human gap < 0.5 (currently 0.81)
3. Zero roasts using "it's 2028" framing
4. At least 3 roasts under 120 chars
5. At least 2 roasts using UNDERSTATEMENT angle
6. Rejection rate < 30% (currently 39%)
