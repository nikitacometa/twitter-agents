# Human Review Analysis — Session 1 (Farm Generation, March 2026)

21 roasts across 5 targets. Evaluators: Gorokhov (G), Voronin (V). Pipeline: rubric + adversarial strategies (pre-unified merge), quote-flip Step 0, angle system v2.

## Raw Data

| # | Target | Punchline (last 5-10 words) | G | V | Avg | V comment |
|---|--------|-----------------------------|---|---|-----|-----------|
| 1 | zkSync | bodega with a WHITEPAPER | 3.5 | 2.6 | 3.05 | not funny |
| 2 | zkSync | function called sweepUnclaimed | 4.0 | 3.5 | 3.75 | good info but dry |
| 3 | Opensea | we call this 'failure to thrive' | 2.0 | 2.6 | 2.3 | not funny |
| 4 | Opensea | tollbooth that removed the toll | 2.8 | 3.5 | 3.15 | not bad |
| 5 | Worldcoin | is the iris refundable? | 3.8 | 4.2 | 4.0 | good |
| 6 | Worldcoin | where most of humanity lives | 4.2 | 3.2 | 3.7 | not very funny |
| 7 | Worldcoin | the scans are permanent | 1.5 | 2.5 | 2.0 | dry fact, no joke |
| 8 | Worldcoin | hard part wasn't proving personhood | 1.5 | 2.5 | 2.0 | not funny |
| 9 | Opensea | product with clear utility is finzer's apology | 4.5 | 3.2 | 3.85 | — |
| 10 | Opensea | nobody's reading | 2.5 | 2.7 | 2.6 | — |
| 11 | Base | who was the control group? | 3.0 | 2.5 | 2.75 | — |
| 12 | Base | mission statement become exhibit A? | 3.0 | 3.0 | 3.0 | — |
| 13 | FilthyTrikks | most accurate artist statement | 3.8 | 2.0 | 2.9 | didn't get it |
| 14 | Worldcoin | was that the distortion? | 4.0 | 2.5 | 3.25 | not funny |
| 15 | Worldcoin | we'd call that a pattern | 2.3 | 3.0 | 2.65 | ok |
| 16 | Worldcoin | chrome ball that stares at people outside a gap store | 3.5 | 2.5 | 3.0 | not funny |
| 17 | Opensea | forgotten before launch | 4.0 | 4.0 | 4.0 | good |
| 18 | Base | financial abuse — have you told ethereum? | 4.0 | 3.7 | 3.85 | ok, not amazing |
| 19 | zkSync | i gently agree | 4.0 | 2.7 | 3.35 | boring |
| 20 | zkSync | breaks even in the year 3,999 | 3.8 | 3.5 | 3.65 | ok data, ok humor |
| 21 | Base | defi term for a 49x markup? | 3.2 | 3.0 | 3.1 | boring |

## Aggregate Stats

| Metric | Value |
|--------|-------|
| Total roasts | 21 |
| Gorokhov avg | 3.26 |
| Voronin avg | 2.91 |
| Combined avg | 3.09 |
| Both agree 3.5+ | 5 roasts (24%) |
| Both agree <2.8 | 4 roasts (19%) |
| Stockpile-worthy (avg >= 3.5) | 7/21 (33%) |

## Finding 1: TOP 5 vs BOTTOM 5 — Structural DNA

### TOP 5 (avg >= 3.75)
| # | Avg | Technique | Punchline words | Creates surprise? |
|---|-----|-----------|-----------------|-------------------|
| 5 | 4.0 | Absurd question | 5 | YES — practical question about eyeball scan |
| 17 | 4.0 | Quote-flip | 3 | YES — their own claim inverted |
| 9 | 3.85 | Name-drop + twist | 4 | YES — CEO name as "product" |
| 18 | 3.85 | Domain shift (therapy) | 8 | YES — couples therapy framing |
| 2 | 3.75 | Ironic naming + tech detail | 5 | YES — function name as evidence |

**Common traits:** Punchline <= 5 words (4/5). Creates cognitive dissonance. Specific (names, function names, exact quotes). Never explains the joke.

### BOTTOM 5 (avg <= 2.6)
| # | Avg | Problem | Punchline words | Creates surprise? |
|---|-----|---------|-----------------|-------------------|
| 7 | 2.0 | Fact without joke | 4 | NO — states the obvious |
| 8 | 2.0 | Observation, not joke | 6 | NO — smart, but not funny |
| 3 | 2.3 | Label, not twist | 4 | NO — jargon as punchline |
| 10 | 2.6 | Obvious implication | 2 | NO — we knew nobody reads |
| 15 | 2.65 | Weak landing | 5 | NO — "a pattern" = so what? |

**Common traits:** Describe/label instead of reframe. Punchlines are conclusions. Professional jargon ≠ humor. Work for any company (not specific enough).

## Finding 2: Technique Effectiveness

| Technique | Examples | Avg score | Verdict |
|-----------|----------|-----------|---------|
| Quote-flip | #2, #14, #17, #19 | 3.59 | BEST — but only when punchline is short |
| Absurd question | #5 | 4.00 | HIGH CEILING — forces reader to answer mentally |
| Name-drop specificity | #2, #9 | 3.80 | STRONG — exact names/functions hit harder |
| Temporal math | #20 | 3.65 | RELIABLE — "year 3,999" always lands |
| Domain shift | #1, #3, #10, #18 | 2.95 | MIXED — therapy works, publishing doesn't |
| Pure data bomb | #7, #8, #21 | 2.37 | WORST — facts alone aren't roasts |
| Name irony | #6 | 3.70 | GOOD — but single example |

## Finding 3: Evaluator Divergence

Gorokhov scores +0.29 higher on average. Key divergence pattern:

| Pattern | G likes more | V likes more |
|---------|-------------|-------------|
| Structural irony (#6, #14, #19) | YES (+1.2 avg) | — |
| Visceral absurdity (#5, #17) | — | YES (or equal) |
| Niche references (#13) | YES (+1.8) | NO — "didn't get it" |
| Data-driven roasts (#4, #20) | — | YES (slight) |

**Interpretation:** G rewards *clever construction*. V rewards *gut laugh*. For Twitter virality, **optimize for V** — screenshots happen when people laugh, not when they appreciate structure.

## Finding 4: Target Saturation

| Target | Roasts | Avg | Issue |
|--------|--------|-----|-------|
| Worldcoin | 7 | 2.94 | "97%" appears 4x, "38M iris scans" 3x — severe data repetition |
| zkSync | 4 | 3.45 | "$458M" appears 3x, "$635/day" appears 2x |
| Opensea | 5 | 3.18 | Better variety — each angle different |
| Base | 4 | 3.18 | "3 wallets 47%" appears 2x |
| FilthyTrikks | 1 | 2.90 | Too niche for wider audience |

**Worldcoin is worst** because 7 roasts recycled 2 data points. Diminishing returns after 3-4 roasts per target.

## Finding 5: Voronin's "Not Funny" Signal

6/21 roasts marked "not funny" or "not very funny" by Voronin. Pattern analysis:

All 6 share: **the punchline DESCRIBES an irony rather than CREATING a surprise.**

- "the scans are permanent" — yes, we know
- "failure to thrive" — a label, not a twist
- "was that the distortion?" — intellectual, not visceral
- "chrome ball outside a gap store" — visual, but no punchline twist

None of the 6 create the "wait what?" moment. They make you nod, not laugh.

## Actionable Recommendations

### R1: "Laugh Test" instruction in prompt
Add to CHARACTER CHECKPOINT: "Does this make someone LAUGH or NOD? If nod — needs more absurdity. The best punchlines make the reader go 'wait what?' not 'hm, clever'."

### R2: Short punchline enforcement
Data: 4/5 top roasts have punchlines <= 5 words. Add explicit rule: "Your punchline should be 1-5 words. If it's longer, the joke is probably buried."

### R3: Intra-batch data dedup
When generating multiple roasts for the same target, track used data points across variants. Pass "ALREADY USED: 97% decline, 38M iris scans" to prevent repetition.

### R4: Boost question mutation weight
The `question` mutation is currently weighted at 0.4 (constraint type). Data shows question punchlines score 4.0 when absurd. Increase weight or make it a dedicated technique.

### R5: Anti-conclusion filter
Post-generation filter: if punchline matches patterns like "and they call this X", "that's not X, that's Y", "we'd call that X" — flag as concluding, not reframing.

### R6: New chaos mutations for unpredictable humor
See experimental proposals below.

## Experimental Proposals

### E1: Format mutations (new category)
```
- "FORMAT: Write as a 1-star Yelp review"
- "FORMAT: Write as a dictionary definition"
- "FORMAT: Write as a breaking news chyron"
- "FORMAT: Write as a Wikipedia deletion notice"
```
Why: Forces completely different framing. "Yelp review" of a protocol could be hilarious.

### E2: Absurdity amplifier
```
"CHAOS: Your punchline must be a question that sounds practical but is absurd in context. Example: 'is the iris refundable?' — NOT 'how is this possible?'"
```
Why: #5 (4.0 avg) proves this pattern works. Make it reproducible.

### E3: Comparison roulette
```
"CHAOS: Compare the target to [randomly selected: restaurant/appliance/animal/sport/weather event]. The comparison IS the roast."
```
Why: "Bodega with a whitepaper" (3.05) works. More absurd comparisons = higher ceiling.

### E4: Math projection constraint
```
"CONSTRAINT: Include an 'at current rate, X by year YYYY' calculation. The year must be absurdly far away."
```
Why: "Year 3,999" (3.65) is a reliable pattern. Calculable absurdity.

### E5: Setup-destroy format
```
"CHAOS: First sentence must be a genuine compliment. Second sentence must destroy it in under 5 words."
```
Why: Forces setup-punchline structure with maximum contrast.

### E6: Headline mode
```
"VOICE: Write as a deadpan Bloomberg headline. No commentary, no personality. The facts ARE the joke."
```
Why: Best roasts let facts speak. This forces that pattern.
