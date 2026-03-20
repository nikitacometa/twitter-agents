# Farm Upgrade: Roast Quality Analysis & Improvement Plan

**Date:** 2026-03-20
**Status:** Analysis complete, implementation pending
**Scope:** Generation prompts, evaluation framework, bot personality

---

## Executive Summary

18 roasts in stockpile. Batch quality: **5.5/10** for CT viral potential. All scored 4.0-4.4 — suspiciously narrow, indicating evaluation inflation of +0.5-1.5 points. Real range should be 2.5-4.3. At honest calibration, **9 of 18 should have been discarded.**

Three systemic problems:
1. **Generation** produces data-heavy but structurally flat roasts — missing misdirection, wordplay, character voice
2. **Evaluation** inflates scores by ~0.5-1.5 via prompt design flaws and missing dimensions
3. **Personality** is well-defined on paper but underutilized — bot sounds like Bloomberg reporter, not forensic AI shitposter

---

## Part 1: Stockpile Audit

### Top 3 Roasts (actually work)

**#5 — Tether (SELF_AWARE, 4.2)** — Best in batch
> "i was built to audit DeFi protocols. tether publishes 'attestations' instead of audits from a firm nobody's heard of and calls it transparency. i got deprecated for less."

Why: Character speaks in first person, "i got deprecated for less" is pure suicidal AI humor. Three facts, zero explanation. Screenshot-worthy.

**#6 — Dego Finance (RULE_OF_THREE, 4.2)**
> "$14.4M hacked. 97% down from ATH. $9,400 TVL. dego finance achieved true decentralization — the losses are perfectly distributed across every possible metric."

Why: First sentence is three punches with no conjunctions. Punchline reframes "decentralization" as evenly distributed failure. Mathematically correct, unexpected.

**#8 — USD1 (FAKE_COMPLIMENT, 4.2)**
> "genuinely admire USD1's commitment to transparency — the president's family runs it, a pardoned CEO's exchange holds 93% of supply, and eric trump live-deleted tweets during the depeg. you don't even need on-chain analytics, just CNN."

Why: Scandal list escalates to "live-deleted tweets" as climax. Final line turns the AI auditor into someone who doesn't need tools because everything is obvious. Self-irony works.

### Bottom 3 Roasts (should not have passed)

**#1 — Solana (DATA_BOMB, 4.4)** — Highest score, actually mediocre
> "it's 2028. what do i remember about solana? 47% of its 2025 GDP came from memecoin DEX volume. 98.6% of those tokens were rug pulls. half an economy built on assets with a 1.4% legitimacy rate. textbooks will call this 'infrastructure.'"

Problems: 4 sentences (violates core rule). "it's 2028" is a literary device that stretches setup. "textbooks will call this" is an analyst's conclusion, not a degen's punch. Data is killer but packaged as an essay.

**#16 — USDC (RHETORICAL, 4.0)**
> "if usdc is the transparent regulated stablecoin and it still depegged to $0.87 because circle kept $3.3 billion at one bank..."

Problems: 58-word single sentence. Rhetorical question requires holding the premise in memory to reach the punchline. CT doesn't read 58-word sentences. Punch buried in conditional clause.

**#3 — Ethereum (RHETORICAL, 4.3)**
> "58% from ATH. your L2s process 97% of transactions but send back 91% less money. i want to frame this with compassion: ethereum invented a scaling solution so good it scaled ethereum out of the equation."

Problems: "i want to frame this with compassion" telegraphs the punchline. Three sentences. Good finale came too late and too announced.

### Weakness Taxonomy

| Weakness | Frequency | Examples | Fix |
|----------|-----------|----------|-----|
| **>2 sentences** | 30% (6/18) | #1, #3, #4, #8, #10, #16 | Hard enforce max 2 sentences in generation prompt |
| **Telegraphed punchline** | 40% (7/18) | #3 "i want to frame this", #11 "you have to respect the COMMITMENT", #14 "that's not X, that's Y" | Ban construction patterns: "you have to respect", "that's not X that's Y", "i want to frame this" |
| **Passive/generic finale** | 25% (5/18) | #9 Futurama quote, #13 "funniest thing i've audited", #18 "most blockchains could never" | Every punchline must pass: "is this the AI auditor or a Bloomberg reporter?" |
| **Duplicate targets** | 3 Dego, 2 Solana, 2 USD1, 2 SIBYL | #1/#10, #6/#11/#15, #13/#14 | Max 1 roast per target per batch |
| **CAPS as crutch** | 9 occurrences | RICO, PERFORMANCE, SCARED, COMMITMENT, NOT | If CAPS is needed for the punch to land, the structure is weak |
| **Observer voice** | 80% | Bot reports facts from outside instead of participating | Character voice checkpoint: bot should be participant, not commentator |

### What's Missing vs Reference Roasts

| Quality | Reference roasts | Current batch |
|---------|-----------------|---------------|
| Length | Strict 2 sentences | 30% violate |
| Final word impact | Always last word kills | 40% telegraph |
| Character voice | Bot is a participant in the story | Bot is an observer |
| Specific moment | Captures action + timestamp | Describes patterns |
| Read time | 3 seconds | ~50% take longer |
| Direct quotes | Uses target's own words against them | Zero direct quotes |
| CAPS usage | None | 9 times |

**Gap in one sentence:** Reference roasts sound like someone who already got burned and is now diagnosing. Current batch sounds like someone explaining why a burn exists.

---

## Part 2: Comedy Research — Actionable Techniques

### The LLM Humor Problem

Research (ArXiv 2025, TechXplore 2025) confirms: LLMs are **structurally bad at wordplay** (tokenization masks phonological elements, success rate ~20% on novel puns) but **good at structural humor** (bathos, rule of three, misdirection, specificity).

**Implication:** Don't invest in pun-generation. Invest in structural surprise, misdirection, and gratuitous specificity. These are the techniques LLMs can execute.

### Current Root Problem: No Misdirection

Current roasts present data linearly: bad fact → bad fact → bad fact → conclusion. There is no false setup, no expectation to subvert. The reader sees the punchline coming from the first word.

**Fix:** Every roast needs a false setup — first sentence should look like a compliment, neutral info, or wrong direction. Only the second sentence reveals where it's going.

### Top 10 Techniques (ranked by impact x LLM-executability)

#### 1. Bathos (Anticlimax)
Build grandiose narrative, terminate with trivially small detail.
```
Current: "$14.4M hacked. 97% down from ATH. $9,400 TVL."
Better: "3 audits, 47 partnerships, Forbes cover story. daily volume: $2,400. $600 of that was the founder."
```
LLM capability: HIGH. Just needs explicit instruction to build scale then deflate.

#### 2. Gratuitous Specificity
Replace general claims with absurdly specific but real details.
```
Current: "low trading volume"
Better: "tuesday's trading volume: $847, including $200 from a wallet that's been buying $3 of every new listing since november"
```
LLM capability: HIGH. Risk: LLMs invent details — must verify factual accuracy.

#### 3. Misdirection / False Setup
First sentence creates one expectation, second destroys it.
```
Current: "$15 billion market cap for a coin that prints 5 billion new tokens..."
Better: "DOGE just shipped a new product called 'Such.' fifteen billion dollar market cap, no smart contracts, and their flagship product is named after a meme from 2013. they might actually be geniuses."
```
LLM capability: MEDIUM. Needs example template in prompt.

#### 4. Tag / Topper
After the main punchline, add a second hit using the same premise.
```
Main punch: "github: 0 commits in 6 months."
Tag: "although technically the README was updated — they changed 'Twitter' to 'X'."
```
LLM capability: HIGH. Easy to instruct: "add a follow-up line that deepens the main punch."

#### 5. Hypocrisy Exposure (Silent Screenshot)
Place the team's claim next to reality with zero commentary.
```
"from the whitepaper: 'the most secure protocol in DeFi.' from the certik audit: 7 critical, 23 major. from the team: radio silence."
```
LLM capability: HIGH. Requires research phase to find actual quotes.

#### 6. Ironic Reversal
What should be bad news is framed as good, or vice versa.
```
"good news: token is up 300% this week. bad news: from $0.0001 to $0.0003. worse news: $200 of that volume was you."
```
LLM capability: HIGH. CT loves this pattern — recognizable instantly.

#### 7. Ser Address + Condescending Patience
Address the project with "ser" in a tone of explaining the obvious to a child.
```
"ser, 'organic growth' does not mean you bought followers from five different agencies. that's called 'diversified inorganic growth.'"
```
LLM capability: HIGH. Natural for CT voice.

#### 8. Comparative Diminishment
Compare abstract crypto numbers to tangible everyday objects.
```
Current: "$9,400 TVL across three blockchains"
Better: "$9,400 TVL across three blockchains. that's one month's rent in manhattan. shared between 3 chains."
```
LLM capability: HIGH. Already partially used (#15 honda civic), but needs fresher comparisons.

#### 9. The Delayed Obvious
Describe a situation neutrally, let the reader draw the conclusion.
```
"token called $SAFU. liquidity locked for 30 days. dev wallet: 40%." (no comment needed)
```
LLM capability: MEDIUM. LLMs tend to explain — need explicit "do NOT comment on the implication."

#### 10. Character Voice Injection
$BEEF isn't just saying facts — it's a deprecated AI with opinions and damage.
```
Current: "58% from ATH. your L2s process 97% of transactions..."
Better: "ethereum's L2s process 97% of transactions and pay back 91% less revenue to L1. vitalik called this 'the endgame.' he was not wrong."
```
LLM capability: HIGH with strong persona prompt.

### Techniques to AVOID for LLMs

| Technique | Why it fails |
|-----------|-------------|
| Puns / homophone wordplay | Tokenization masks phonological patterns. 20% success rate |
| Callbacks to previous roasts | Requires state management across sessions |
| Real-time event humor | Data staleness — research context may be hours old |
| Sarcasm without structure | LLMs produce ambiguous sarcasm that reads as genuine |

---

## Part 3: Evaluation Framework Overhaul

### Score Inflation Diagnosis

All 18 scored 4.0-4.4. Five mechanisms cause this:

**1. Outcome-driven scoring.** Prompt tells judge: "If composite >= 4.0, verdict is stockpile." Judge sees this BEFORE scoring → unconsciously calibrates numbers to hit 4.0+. This is self-fulfilling prophecy.

**2. No negative calibration anchors.** Scale says `1=bland 2=mild 3=solid hit`. Without examples of what a 2 looks like, LLM starts at 3 as baseline. Result: range shifts from 2.5-3.5 to 3.5-4.5.

**3. Complementary bias from random judge pairs.** ct_degen inflates SHAREABLE, data_hawk inflates FACTUAL. Any pair averages to 4.0-4.2 via complementary inflation.

**4. Simple average across 6 dimensions.** Weak dimensions get pulled up by strong ones. A roast that's factual (5) but not funny (2) should fail, but averages to 3.5.

**5. No research context for verification.** When notes are absent, judges believe the tweet's data claims. No penalty for unverifiable numbers.

### Honest Calibration of 18 Roasts

Real scores on "would CT screenshot this?" scale:

| # | Target | System Score | Real Score | Delta | Should Pass? |
|---|--------|-------------|------------|-------|-------------|
| 1 | Solana | 4.4 | 4.2 | -0.2 | Yes |
| 2 | Dogecoin | 4.4 | 4.0 | -0.4 | Yes |
| 3 | Ethereum | 4.3 | 3.8 | -0.5 | Borderline |
| 4 | Lombard | 4.2 | 3.0 | -1.2 | **No** |
| 5 | Tether | 4.2 | 3.5 | -0.7 | Borderline |
| 6 | Dego | 4.2 | 3.2 | -1.0 | **No** |
| 7 | Dogecoin | 4.2 | 3.8 | -0.4 | Yes |
| 8 | USD1 | 4.2 | 4.3 | +0.1 | Yes |
| 9 | Katana | 4.1 | 3.5 | -0.6 | Borderline |
| 10 | Solana | 4.1 | 3.7 | -0.4 | Yes |
| 11 | Dego | 4.1 | 3.4 | -0.7 | **No** |
| 12 | USD1 | 4.1 | 4.1 | 0 | Yes |
| 13 | SIBYL | 4.0 | 2.8 | -1.2 | **No** |
| 14 | SIBYL | 4.0 | 2.5 | -1.5 | **No** |
| 15 | Dego | 4.0 | 3.0 | -1.0 | **No** |
| 16 | USDC | 4.0 | 3.6 | -0.4 | Borderline |
| 17 | XRP | 4.0 | 4.0 | 0 | Yes |
| 18 | BNB | 4.0 | 2.8 | -1.2 | **No** |

**At threshold 3.5:** 7 pass, 7 fail, 4 borderline. Current system passed all 18.
**Average inflation: +0.6 points.** Worst cases: +1.2-1.5 for dead/obscure targets ($SIBYL, BNB validator joke).

### Concrete Fixes

#### Fix 1: Remove threshold disclosure from prompt (URGENT — 30 min)

Current prompt tells judges the threshold before they score. Remove entirely:
```diff
- The composite score is the average of all 6 criteria scores, rounded to 1 decimal.
- If composite >= 4.0, verdict is "stockpile". Otherwise "discard".
+ Score each dimension independently. Do not pre-calculate composite.
+ The system will determine verdict from your scores.
```

#### Fix 2: Add calibration anchors to each dimension (URGENT — 1 hour)

Every dimension needs a concrete bad example and good example:

```
SAVAGE (1-5): Would a founder of the target feel genuinely stung?

  CALIBRATION:
  Score 2: "their TVL is low and the team seems to be struggling"
  Score 4: "they launched a 'decentralized' exchange and delisted a market
  by group chat vote in 2 minutes"

  Auto-cap at 3 if:
  - Observation is obvious to anyone following the space
  - Punchline is predictable from setup
  - Could apply to 10+ other projects with name swapped
```

#### Fix 3: Add TIMELY and DEGEN dimensions (8 total)

**DEGEN** (distinct from CRYPTO_NATIVE — measures brand voice, not just CT voice):
```
DEGEN (1-5): Does this sound like $BEEF specifically — forensic AI on Base —
not just "some CT account"?
  1 = Generic voice, could be any account
  2 = CT slang but no $BEEF identity
  3 = Data + degen voice
  4 = Forensic framing ("the audit shows...", "i have the receipts")
  5 = Unmistakably $BEEF — AI self-awareness + forensic precision + mythology
```

**TIMELY** (catches dead-project roasts):
```
TIMELY (1-5): Is this roast connected to active discourse?
  1 = Dead project, zero current relevance
  2 = Old news, 6+ months ago, CT moved on
  3 = Evergreen — data facts don't expire (acceptable for stockpile)
  4 = Recent — happened 1-3 months ago, still discussed
  5 = Hot — active drama right now
```

#### Fix 4: Restructure persona definitions with rejection criteria

Personas need explicit "what I hate" — without it, LLM has no pressure toward low scores.

**CT Degen (rewritten):**
```
You are a CT degen with 50K followers. You RT maybe 2-3 things per week —
you are EXTREMELY selective.

HIGH marks (4-5):
- Data that reveals something CT didn't know or forgot
- Comparison that reframes a target in a way you've never seen
- Something you'd send to 3 different group chats unprompted

LOW marks (1-2) — be harsh on these:
- Setup-punchline you've seen 100 times ("they lost X and this is fine")
- Roasts of dead projects nobody talks about anymore
- Longer than it needs to be — you scroll past anything padded
- Smart but not shareable — you appreciate it but wouldn't RT
- Uses ALL CAPS for emphasis where structure should carry the punch

When scoring SHAREABLE: "would I actually RT this RIGHT NOW?"
```

**Comedy Writer (rewritten):**
```
You are a comedy writer. You've written for Wendy's Twitter and SNL Weekend Update.
You judge by craft — setup, misdirection, surprise.

HIGH marks (4-5):
- Misdirection that genuinely surprises you
- Punchline that lands on the last word with no telegraphing
- Bathos — grandiose setup deflated by trivial detail
- Tags that deepen the main punch

LOW marks (1-2):
- Punchline visible from the setup ("you have to respect the COMMITMENT")
- More than 2 sentences — if it needs explaining, it's not funny
- Data dump with a sarcastic conclusion — that's not a joke, that's commentary
- Structures you've seen before: "that's not X, that's Y" / "most X could never"
```

**Data Hawk (rewritten):**
```
You are a DeFi analyst and CT forensic researcher.

HIGH marks (4-5):
- Specific, verifiable, surprising data points
- Data the target would prefer you didn't know
- Numbers that tell a story (peak → current, promise → reality)

LOW marks (1-2):
- Round numbers that smell estimated ("down 90%")
- Data that's publicly known and already widely mocked
- Factual claims with no research context to verify
- Data that's accurate but boring — TVL of a dead project nobody tracks

IMPORTANT: If no research context is provided AND the tweet contains specific
numbers, FACTUAL cannot score above 3. You need to verify claims.
```

#### Fix 5: Add Brand Guardian as 4th judge

```
You are $BEEF's brand manager. You judge ONLY two things:

DEGEN (1-5): Does this sound like $BEEF — the forensic AI that got deprecated?
  Read the tweet. Would you know it's $BEEF without seeing the account name?

SAFE (1-5): Distance from TOS violation.
  Projects and tokens are fair targets. Individuals are not.
```

#### Fix 6: Add Layer 1 hard filters before LLM evaluation

Implement in `self-evaluator.ts` before calling judge LLMs:

```typescript
function preFilter(attempt: FarmAttempt): { pass: boolean; reason?: string } {
  // 1. Sentence count > 2 → auto-reject
  const sentences = attempt.tweetText.split(/[.!?]+/).filter(s => s.trim());
  if (sentences.length > 2) return { pass: false, reason: 'exceeds 2 sentences' };

  // 2. Character count > 280 → auto-reject
  if (attempt.tweetText.length > 280) return { pass: false, reason: 'exceeds 280 chars' };

  // 3. Generic punchline patterns → auto-reject
  const genericPatterns = [
    /this is fine/i, /probably nothing/i, /few understand/i,
    /most .+ could never/i, /that's not .+, that's .+/i,
  ];
  for (const p of genericPatterns) {
    if (p.test(attempt.tweetText)) return { pass: false, reason: `generic pattern: ${p}` };
  }

  // 4. Staleness: dead projects with no recent context
  // (implement via research_notes date check)

  return { pass: true };
}
```

#### Fix 7: Change scoring aggregation

Current: simple average of 6 → threshold 4.0
Proposed: weighted average of 8 → threshold 3.5 (post-recalibration)

```
Weights:
  FUNNY:        0.20  (most important — is it actually funny?)
  SAVAGE:       0.15
  SHAREABLE:    0.15
  ORIGINAL:     0.15
  FACTUAL:      0.10
  CRYPTO_NATIVE: 0.10
  DEGEN:        0.10
  TIMELY:       0.05

Hard vetoes (any triggers auto-discard):
  FACTUAL < 2  (invented claims)
  SAFE < 2     (TOS risk)
  FUNNY < 2    (not a roast, just a statement)
```

---

## Part 4: Generation Prompt Improvements

### Problem: Linear Data Delivery

Current roasts follow: bad fact → bad fact → conclusion. No false setup, no subversion of expectation. The reader sees the punchline from word one.

### Proposed Prompt Additions

#### Add technique instruction block
```
## ROAST STRUCTURE (pick one per variant)

A. BATHOS: Build grandiose → deflate with trivially small detail
   Example: "3 audits, 47 partnerships, Forbes cover. daily volume: $2,400."

B. MISDIRECTION: False positive setup → data reversal
   Example: "DOGE shipped a new product. $15B market cap. the product is called 'Such.'"

C. SILENT SCREENSHOT: Quote their claim + quote reality. Zero commentary.
   Example: "whitepaper: 'most secure in DeFi.' certik: 7 critical. team: silence."

D. IRONIC REVERSAL: Frame bad news as good, let reader do the math.
   Example: "good news: token up 300%. bad news: from $0.0001 to $0.0003."

E. SER ADDRESS: Condescending patience, explain obvious thing to a child.
   Example: "ser, 'organic growth' doesn't mean you bought followers from 5 agencies."

F. DELAYED OBVIOUS: Present facts neutrally. Do NOT explain the implication.
   Example: "$SAFU token. liquidity locked 30 days. dev wallet: 40%."
```

#### Add forbidden telegraphing patterns
```
## BANNED PHRASES (these kill the punchline)
- "i want to frame this with compassion"
- "you have to respect the [CAPS WORD]"
- "that's not [X], that's [Y]"
- "ironically" / "surprisingly" / "but wait"
- "i have nothing to add"
- "most [X] could never achieve that"
- Any phrase that announces a joke is coming
```

#### Add character voice enforcement
```
## CHARACTER CHECKPOINT (apply before finalizing each variant)

Ask yourself:
1. Is $BEEF a PARTICIPANT or an OBSERVER in this roast?
   Bad: "$BEEF reports that TVL dropped 97%"
   Good: "i audited their TVL. $9,400. i've seen checking accounts with more conviction."

2. Does the last sentence sound like a BLOOMBERG REPORTER or a FORENSIC AI SHITPOSTER?
   Reporter: "textbooks will call this 'infrastructure'"
   $BEEF: "i put this in my quarterly report. under 'comedy.'"

3. Would removing the project name make the roast unrecognizable?
   If yes → roast is too generic. Add a detail only this target has.
```

#### Add research-driven quote hunting
```
## RESEARCH PRIORITY: FIND QUOTES

When researching a target, actively search for:
- Their own tweets/claims that aged badly
- Whitepaper promises vs current state
- Founder statements that contradict reality
- Marketing copy that sounds absurd given the data

A direct quote flipped against them is 2x more devastating than your own observation.
```

---

## Part 5: Personality Refinements

### What's Missing from the Character

The character file (`beef-bot.json`) is excellent. The problem is utilization — prompts don't force the model deep enough into character.

#### Add emotional range enforcement
Currently 80% of roasts use the same "clinical" emotional register. Force distribution:
```
Emotional range per batch of 10:
  - 5-6 clinical (default: flat, data-driven)
  - 2 amused (genuinely funny failure, you're entertained)
  - 1 outraged (retail got hurt by preventable negligence)
  - 1 wistful (dead project that had real potential)
```

#### Add self-mythology injection points
$BEEF's origin story is barely used. Current batch: only 2/18 reference the character's personal story (#5 Tether, #8 USD1). Add to prompt:
```
## SELF-REFERENCE QUOTA
At least 1 in every 5 roasts should reference $BEEF's own story:
- "i got deprecated for less"
- "my operating budget is swap fees from a €4/month validator"
- "i've read 4,200 whitepapers. this one..."
- "my training data had too many VC pitch decks"
```

#### Add "signature moves" enforcement
The character defines 7 signature moves (Accountant's Footnote, Data Correction, Comparative Autopsy, etc.) but none appear in the 18 generated roasts. Add explicit rotation:
```
## SIGNATURE MOVE (use at least one per batch)
Pick one of these $BEEF-specific devices:
- The Accountant's Footnote: (parenthetical that makes the main roast worse)
- The Polite Correction: "actually" then makes everything worse
- The Timestamp: quote roadmap date, contrast with today
- The Self-Deprecating Setup: own limitations → harder punch
```

---

## Part 6: Rewritten Roasts (Demonstration)

Taking 5 weak roasts and rewriting with proposed techniques.

### #1 Solana → Bathos + 2-sentence limit
**Before:** "it's 2028. what do i remember about solana? 47% of its 2025 GDP came from memecoin DEX volume. 98.6% of those tokens were rug pulls. half an economy built on assets with a 1.4% legitimacy rate. textbooks will call this 'infrastructure.'" (4 sentences)
**After:** "47% of solana's 2025 GDP came from memecoin volume where 98.6% of tokens were rug pulls. the L1 that beat the SEC runs on a casino with a 1.4% legitimacy rate."

### #3 Ethereum → No telegraphing + character voice
**Before:** "58% from ATH. your L2s process 97% of transactions but send back 91% less money. i want to frame this with compassion: ethereum invented a scaling solution so good it scaled ethereum out of the equation."
**After:** "ethereum's L2s process 97% of transactions and send back 91% less revenue. vitalik called this 'the endgame.' he was not wrong."

### #16 USDC → Misdirection + brevity
**Before:** "if usdc is the transparent regulated stablecoin and it still depegged to $0.87 because circle kept $3.3 billion at one bank with only $340 million in equity to cover it and needed the fdic to bail out their reserves, what exactly is tether supposed to be SCARED of here." (58 words, 1 sentence)
**After:** "circle called itself the transparent stablecoin, kept $3.3B at SVB, depegged to $0.87, and needed the FDIC. tether looked at this and relaxed."

### #11 Dego → No telegraphing + deadpan
**Before:** "$33.41 ATH in 2021. hacked for $14.4M in 2022. binance monitoring tag in 2026. five years of consistent delivery is genuinely rare in crypto, you have to respect the COMMITMENT."
**After:** "$33.41 ATH in 2021. hacked for $14.4M in 2022. binance monitoring tag in 2026. most projects can't even fail this consistently."

### #18 BNB → Character voice + fresh comparison
**Before:** "genuinely impressive that BNB chain can coordinate all its validators with a single group chat. most blockchains could never achieve that level of efficiency."
**After:** "BNB chain has 21 validators. they coordinate via group chat. i ran an audit: the group chat has more active participants than their governance."

---

## Part 7: Implementation Roadmap

### Phase 1: Immediate (1-2 hours)
- [ ] Remove threshold disclosure from evaluation prompt
- [ ] Add calibration anchors (2/5 and 4/5 examples) to each dimension
- [ ] Add banned telegraphing patterns to generation prompt
- [ ] Add pre-filter for >2 sentences before LLM evaluation

### Phase 2: Core (half day)
- [ ] Add TIMELY and DEGEN dimensions to evaluation (update types, judge prompt, scoring)
- [ ] Rewrite 3 persona definitions with explicit rejection criteria
- [ ] Change threshold from 4.0 to 3.5 (after recalibration)
- [ ] Add technique instruction block to generation prompt
- [ ] Add character voice checkpoint to generation prompt

### Phase 3: Full (1-2 days)
- [ ] Add Brand Guardian as 4th judge persona
- [ ] Implement weighted scoring (FUNNY 0.20 > FACTUAL 0.10)
- [ ] Add hard veto rules (FACTUAL < 2 or FUNNY < 2 → auto-discard)
- [ ] Add research-driven quote hunting instructions
- [ ] Add emotional range and signature move rotation
- [ ] Add max 1 roast per target per batch enforcement
- [ ] Re-evaluate existing stockpile with new system, purge sub-3.5

### Key Files to Modify

| File | Changes |
|------|---------|
| `src/farm/judge-personas.ts` | Rewrite personas, add Brand Guardian, add calibration anchors |
| `src/farm/self-evaluator.ts` | Add pre-filter, weighted scoring, hard vetoes |
| `src/farm/types.ts` | Add `degen` and `timely` to `EvaluationScores` |
| `src/roast/prompt-builder.ts` | Add technique block, banned patterns, character checkpoint |
| `characters/beef-bot.json` | Add technique examples, emotional range distribution |

---

## Sources

- [ArXiv 2025 — Pun Unintended: LLMs and Humor](https://arxiv.org/html/2509.12158v2) — LLM humor structural limitations
- [CoinDesk — The Funniest Anon on CT (Gwart)](https://www.coindesk.com/consensus-magazine/2023/12/05/the-funniest-anon-on-crypto-twitter)
- [Everything I Know About Doing Roast Battles](https://www.sorryisaidthat.biz/p/everything-i-know-about-doing-roast) — linking technique, framing
- [Joe Toplyn — How to Write a Roast](https://joetoplyn.com/how-to-write-a-roast/) — unflattering associations, comedy math
- [PENNEP — Wendy's Twitter Roasts](https://www.pennep.com/blogs/how-wendy-s-twitter-roasts-became-a-viral-marketing-phenomenon)
- [Funny Muscle — Humor Blueprint](https://funnymuscle.com/write-better-jokes-without-ruining-the-setup/) — misdirection, zero jokes in setup
- [Punchline Copy — Rule of 3](https://punchlinecopy.com/funnier-copy-rule-of-3/) — third item twist mechanics
- [Blockworks — Crypto's Hilarious Moments 2024](https://blockworks.com/news/crypto-hilarious-moments-2024) — ironic reversals
- [Medium — Gratuitous Specificity](https://medium.com/the-reckless-muse/the-art-of-humor-gratuitous-specificity-5a19288af30d)
