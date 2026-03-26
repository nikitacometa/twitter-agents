# Feedback Session Analysis — 2026-03-26

Session: `data/feedback-sessions/2026-03-26T08-09.md` (on VPS `ssh hostinger`)
Evaluators: Nikita Gorokhov + Nikita Voronin (co-founders)
Roasts reviewed: 25 targets, ~75 rated variants
Context: First human evaluation after the March 25 pipeline overhaul (unified strategy, micro-personas, angle additions, few-shot curation)

## Raw Score Distribution

| Tier | Range | Count | % |
|------|-------|-------|---|
| Fire | 4.5+ | 10 | 13% |
| Strong | 4.0–4.4 | 14 | 19% |
| Passable | 3.5–3.9 | 17 | 23% |
| Weak | 3.0–3.4 | 16 | 21% |
| Reject | <3.0 | 18 | 24% |

**Session average: ~3.35.** Nearly a quarter of all variants are reject-tier.

---

## Part 1: What Makes Great Roasts (4.5+ Analysis)

### The 10 Fire-Tier Roasts

| # | Target | Score | Angle | Text | Chars |
|---|--------|-------|-------|------|-------|
| 1 | dwr | 5.0 | QUOTE_FLIP | "it's completely normal to be excited about $0.001 after your last project made $2.8M on $180M raised. small numbers can feel like HOME." | 139 |
| 2 | coinbase | 4.8 | DATA_BOMB | "coinbase has a block explorer, a compliance team, a legal department, and a job listing for 'twitter content creator — must make bangers.' guess which one wrote this." | 167 |
| 3 | cz_binance | 4.8 | QUOTE_FLIP | "'stay SAFU' from the guy who needed a presidential pardon to stay out of federal custody" | 88 |
| 4 | dwr | 4.7 | RULE_OF_THREE | "farcaster: $180M raised, $2.8M earned, returned to investors. tempo: $500M raised, 8-day-old mainnet. the fees shrink but the ROUNDS don't." | 143 |
| 5 | AIonBase_ | 4.5 | RULE_OF_THREE | "14 items. 6 about virtuals. 9 likes. more agents covered than humans who ENGAGED." | 71 |
| 6 | KAPOTHEGOAT01 | 4.5 | IRONIC_REVERSAL | "a strategic advisor and private investor asking 'what incentive do any of the builders have' is the longest way to say list my BAGS." | 131 |
| 7 | mert | 4.5 | DOMAIN_SHIFT | "mert posted 'you are being farmed' to 805 likes out of 262K followers — a 0.3% harvest rate. the call is coming from inside the BARN." | 136 |
| 8 | FelixCraftAI | 4.5 | MISDIRECTION | "$106K paid to creators at a 10% platform take means felix earned $10,600 in eight weeks. most etsy sellers don't issue equity for THAT." | 139 |
| 9 | nickshirleyy | 4.5 | BATHOS | "wearing a 'where did my taxes go' hoodie while posing with the man whose entire DEPARTMENT exists to answer that question" | 117 |
| 10 | PremierBase | 4.5 | QUOTE_FLIP | "'if you can't name them all, you're ngmi' — one whale could name six, put in $23M, pulled out $2.58M. recognition was never the PROBLEM" | 138 |

### 5 Structural Principles of Fire-Tier Roasts

**1. Hypocrisy exposure (Incongruity Theory)**
The strongest comedy mechanism in this dataset. The target's OWN words or actions contradict their OWN position:
- dwr 5.0: excited about $0.001 after $180M project returned $2.8M
- cz 4.8: "stay SAFU" + needed a presidential pardon
- KAPO 4.5: "what incentive do builders have" = "list my bags"
- mert 4.5: "you are being farmed" + 0.3% engagement on own post

**Evidence:** 7 of 10 fire-tier roasts use some form of hypocrisy/contradiction as the core mechanism.

**2. Domain shift in the punchline (Cognitive Distance)**
The punchline comes from an unexpected non-crypto domain, creating maximum surprise:
- dwr 5.0: "small numbers can feel like HOME" — therapy/emotional coping
- coinbase 4.8: "guess which one wrote this" — job listing absurdity
- FelixCraft 4.5: "most etsy sellers don't issue equity" — handcraft marketplace
- nickshirleyy 4.5: "whose entire DEPARTMENT exists to answer that question" — bureaucracy

**Evidence:** 6 of 10 fire-tier roasts use domain shift as delivery mechanism.

**3. Math that reveals absurdity (not math that IS the punchline)**
The best data roasts do a SIMPLE calculation that makes the conclusion inescapable:
- mert 4.5: "0.3% harvest rate" — one division exposes irony
- FelixCraft 4.5: "$106K × 10% = $10,600" — basic math, devastating context
- PremierBase 4.5: "$23M in, $2.58M out" — no commentary needed

**Critical distinction:** Math as SETUP (good) vs math as PUNCHLINE (bad). The year-projection roasts use math AS the punchline ("year 3999") which is abstract and boring. Fire-tier roasts use math to SET UP a human-relatable punchline.

**4. Brevity and density**
- Average char count of fire-tier: 127 chars
- CZ 4.8 at 88 chars is the shortest
- coinbase 4.8 at 167 chars is the longest — but every word earns its place
- No fire-tier roast exceeds 170 chars

**5. Punchline as reframe, never as conclusion**
- Reframe (fire): "small numbers can feel like HOME" — forces re-reading setup
- Reframe (fire): "guess which one wrote this" — retroactively makes the list absurd
- Conclude (reject): "and they call this innovation" — restates what setup already implied
- Conclude (reject): "at this pace the paradigm shifts around 2400 AD" — just bigger number

---

## Part 2: Failure Patterns (Systematic Anti-Patterns)

### Anti-Pattern 1: "At current rate... year YYYY" (THE BIGGEST KILLER)

**Instances in session:**
| Target | Text fragment | Score |
|--------|--------------|-------|
| Vivek4real_ V1 | "these three numbers meet in the year 4,200" | 3.2 |
| Vivek4real_ V2 | "$80K arrives in the year 2097" | 2.5 |
| Vivek4real_ V3 | "breakeven in the year 2340" | 2.5 |
| david_tomu V1 | "that step arrives around the year 2600" | 2.0 |
| david_tomu V2 | "recovery ETA: 2900 AD" | 2.5 |
| david_tomu V3 | "the paradigm shifts around 2400 AD" | 2.0 |
| benjitaylor V1 | "breaks even on that career decision by the year 2291" | 2.5 |
| benjitaylor V2 | "the season finale airs in the year 2826" | 2.5 |
| benjitaylor V3 | "pays for itself by the year 6,400" | 2.5 |

**Average score: 2.47** — worst performing pattern in the entire session.

User feedback: "скучно из-за абстрактности цифры, слишком много разговоров о будущем, ты часто этот формат повторяешь"

**Why it fails (humor psychology):**
1. Abstract future years have zero emotional weight — nobody can relate to "year 4200"
2. The "joke" is the same every time — scale changes but structure is identical
3. It's math AS punchline, not math as SETUP for a human punchline
4. Repetition across variants kills any remaining surprise

**Root cause in code:** Mutation `math-projection` in `mutations.ts:10` ACTIVELY INSTRUCTS the LLM to use this pattern: "CONSTRAINT: Must include an 'at current rate' or 'at this pace' projection into an absurdly distant year."

**Pre-filter gap:** `evaluator.ts` catches `^it's 20\d\d\b` but NOT the "at current rate... year YYYY" variant.

### Anti-Pattern 2: Engagement Metrics Dunking

**Instances:**
| Target | Text fragment | Score | Feedback |
|--------|--------------|-------|----------|
| rekt_tekashi V1 | "57 likes from 43K followers" | 2.5 | "boring, уже использовал эту механику" |
| CuzzinOG V1 | "to 22 likes" | 3.0 | "скучно" |
| Cointelegraph | all 3 variants about likes | N/A | "про лайки нахер говорить, забей чел" |
| netprotocolapp V1 | "posted to an empty room" | 2.5 | "не смешно" |
| AIonBase_ (first) V1 | "more pixels than order book ENTRIES" | 3.3 | combined with engagement angle |

**Why it fails:**
- "You have few likes" is an observation, not a joke. There's no twist, no surprise, no reframe
- It's punching the SYMPTOM (low engagement) rather than the CAUSE (bad product/behavior)
- The mert roast (4.5) ALSO uses engagement data ("0.3% harvest rate") — but the joke is the IRONY of someone crying "you're being farmed" while farming poorly. The number is setup, not punchline.

**Key distinction:** Using engagement data to expose irony = good. Dunking on low engagement as the joke itself = bad.

### Anti-Pattern 3: ALL CAPS Closing Word

Explicit complaints (4+ times in session):
- "перестань капсом выделять последнее слово"
- "не обязательно в конце выделять слово капсом"
- "не нужно выделять слово в конце"

retardmode: all 3 variants scored 4.0 but EACH got the same CAPS complaint. Without CAPS these were likely 4.3-4.5.

**Root cause in code:**
1. `beef-bot.json:72`: "lowercase always. ALL CAPS for exactly one word max per tweet (emphasis only)"
2. `prompt-builder.ts:231`: "Best punchlines are 1-5 words that reframe the entire setup: 'unprecedented.', 'decentralized.', 'evolution.'" — trains toward single CAPS word closers
3. Few-shot examples in beef-bot.json all use CAPS closing: PROSECUTION, ENTRIES, PALLBEARERS, ENGAGED, etc.

The LLM interprets "one word ALL CAPS max" as "always put one CAPS word at the end." This is now a negative signal.

### Anti-Pattern 4: Factual Errors

| Target | Error | Score | Impact |
|--------|-------|-------|--------|
| david_tomu | bankr "$2M lifetime volume" (real: $3M/day) | 2.0 | "у банкра в день 3 ляма тока трейда" |
| 0xDeployer | "revenue so small" (context: $580K isn't that small) | 2.2 | "не знаю откуда он это взял" |

Even ONE wrong number kills the roast instantly. Trust = destroyed, joke = irrelevant.

### Anti-Pattern 5: Complex Vocabulary

| Word | Context | Score impact | Feedback |
|------|---------|-------------|----------|
| "eulogy" | AIonBase_ closing word | 3.0 (capped) | "слишком сложное слово" |
| "pallbearer" | AIonBase_ closing word | 3.7 (reduced) | "пришлось гуглить слово" |
| "materiality disclosure" | 0xDeployer | 3.2 | — |

CT audience = degens, not literature professors. If a punchline requires a dictionary, it's dead.

### Anti-Pattern 6: Over-Focus on Single Detail from a List

AIonBase_ (first): tweet showed 9 tokens, bot fixated on $TMAI exclusively.
Feedback: "неплохо, но немного тупо, что зацеп идёт за конкретный один проект из всего списка. Хотелось бы роаст какой-то более общий."

When the tweet presents a COLLECTION, roast the PATTERN, not one item.

### Anti-Pattern 7: Dry Analysis Without Humor

shahh V1 (2.4): "в чём тут шутка?"
shahh V2 (3.8): "правда, но не очень смешно"
arkham V3 (3.5): "неплохо, но суховато, не очень смешно"

Being correct is necessary but not sufficient. Data without a twist = audit report, not roast.

---

## Part 3: Angle Performance (New Calibration Data)

### Scores by Angle (This Session Only)

| Angle | n | Avg | Min | Max | Std | Current Weight |
|-------|---|-----|-----|-----|-----|---------------|
| DATA_BOMB | 3 | 4.00 | 3.2 | 4.8 | 0.66 | 1.0 |
| RULE_OF_THREE | 6 | 3.85 | 3.0 | 4.7 | 0.58 | 1.5 |
| COMPARISON | 2 | 3.90 | 3.8 | 4.0 | 0.10 | 0.8 |
| DOMAIN_SHIFT | 6 | 3.55 | 2.8 | 4.5 | 0.55 | 1.3 |
| IRONIC_REVERSAL | 2 | 3.50 | 2.5 | 4.5 | 1.00 | 1.0 |
| QUOTE_FLIP | 23 | 3.47 | 2.5 | 5.0 | 0.70 | 1.8 |
| BATHOS | 5 | 3.34 | 2.0 | 4.5 | 0.96 | 1.3 |
| UNDERSTATEMENT | 7 | 3.31 | 2.0 | 4.0 | 0.68 | 2.0 |
| FAKE_COMPLIMENT | 4 | 3.28 | 2.7 | 3.7 | 0.37 | 0.4 |
| MISDIRECTION | 9 | 3.23 | 2.4 | 4.5 | 0.68 | 1.5 |
| FREESTYLE | 5 | 3.10 | 2.5 | 4.0 | 0.53 | 1.5 |
| SELF_AWARE | 1 | 3.50 | 3.5 | 3.5 | — | 0.6 |

### Old vs New Calibration

| Angle | Old avg (n) | New avg (n) | Delta | Weight Direction |
|-------|-------------|-------------|-------|-----------------|
| DATA_BOMB | 3.42 (6) | 4.00 (3) | +0.58 | ↑↑ significantly underweighted |
| RULE_OF_THREE | 4.00 (5) | 3.85 (6) | -0.15 | ↑ still underweighted |
| UNDERSTATEMENT | 3.73 (7) | 3.31 (7) | -0.42 | ↓↓ significantly overweighted |
| QUOTE_FLIP | 3.63 (4) | 3.47 (23) | -0.16 | → keep (highest ceiling) |
| COMPARISON | 3.20 (5) | 3.90 (2) | +0.70 | ↑ underweighted |
| FAKE_COMPLIMENT | 2.52 (8) | 3.28 (4) | +0.76 | ↑ slightly underweighted |

### Proposed Weight Recalibration

```
DATA_BOMB:       1.0 → 1.8  // best performer, tiny sample but confirmed by old data
RULE_OF_THREE:   1.5 → 2.0  // consistently top-2 across all sessions
QUOTE_FLIP:      1.8 → 1.8  // keep — highest ceiling (5.0), highest n (23)
DOMAIN_SHIFT:    1.3 → 1.5  // strong with new data, upgrade slightly
IRONIC_REVERSAL: 1.0 → 1.2  // promising but n=2
COMPARISON:      0.8 → 1.0  // improved
BATHOS:          1.3 → 1.2  // high variance, slight downgrade
UNDERSTATEMENT:  2.0 → 1.2  // biggest correction — overweighted by 0.8
MISDIRECTION:    1.5 → 1.2  // underperforming, downgrade
FREESTYLE:       1.5 → 1.0  // below average consistently
FAKE_COMPLIMENT: 0.4 → 0.7  // improved from old data
SELF_AWARE:      0.6 → 0.6  // keep (n=1, not enough data)
```

---

## Part 4: March 25 Pipeline Overhaul — What Worked vs What Didn't

| Change | Verdict | Evidence |
|--------|---------|----------|
| Unified strategy (3→1) | ✅ | Variants are diverse, no duplication issues |
| Micro-personas per variant | ✅ | Good differentiation between variants |
| Screenshot test framing | ✅ | Top roasts are genuinely screenshotable |
| SLOP diagnosis CoT | ⚠️ Partial | Doesn't prevent year-projection or engagement dunking |
| Unhinged mode 15% | ❓ | No clear trace in this session — may need higher % |
| Validated few-shots | ✅ | Quality floor is higher than before |
| New angles (BATHOS, DOMAIN_SHIFT, etc.) | ✅ | Both produced 4.5+ hits |
| Removed RHETORICAL/TIMELINE | ✅ | No appearances |
| `math-projection` mutation | ❌ | Single most destructive element in pipeline |

---

## Part 5: Additional Observations

### The "Showed a Normie" Framing
Used in: retardmode (4.0 avg), PremierBase (2.5-3.0 on 2 of 3 variants).
Effective when the normie's reaction is the punchline itself and creates genuine surprise.
Failing when overused or when the normie's "quote" is too clever to be believable.

### Target Quality Matters Enormously
Best targets this session: dwr (avg 4.57), cz_binance (avg 4.27), coinbase (avg 4.07), FelixCraftAI (avg 4.17)
Worst targets: david_tomu (avg 2.17), netprotocolapp (avg 2.50), benjitaylor (avg 2.50)

Pattern: high-profile targets with known hypocrisy = fire. Obscure/niche targets = waste.

### Unique Humor Technique: Therapeutic Reframe
dwr's 5.0 roast uses a technique not in our angle guide: reframing a financial catastrophe as emotional coping.
"small numbers can feel like HOME" — this is psychologically devastating because it implies dwr is performing self-care through delusion.
Consider adding as a named technique: **THERAPEUTIC REFRAME** — frame the target's failure as a psychological coping mechanism.

### Repeated CAPS Complaint = Urgent Signal
The user complained about ALL CAPS in the LAST WORD at least 4 separate times across different targets. This is the most repeated single complaint in the session. It's not a preference — it's actively reducing scores by 0.3-0.5 points per variant.

---

## Part 6: Implementation Tasks

### P0 — Critical (implement now, each verified against data)

**TASK 1: Remove `math-projection` mutation**
- File: `beef/src/farm/mutations.ts:10`
- Action: Delete the mutation object entirely
- Add to pre-filter in `evaluator.ts`: regex for "at current/this rate/pace... year YYYY"
- Evidence: 9 instances, avg 2.47, worst pattern in session

**TASK 2: Remove ALL CAPS mandate from character + prompt**
- File: `beef/characters/beef-bot.json:17` (systemPrompt)
  - Change: "One word in ALL CAPS maximum per tweet, for emphasis only" → remove this sentence entirely, add: "never use ALL CAPS — emphasis comes from word choice and position, not formatting."
- File: `beef/characters/beef-bot.json:72` (voice.register)
  - Change: "lowercase always. ALL CAPS for exactly one word max per tweet (emphasis only)" → "lowercase always. no ALL CAPS. emphasis through structure, not formatting."
- File: `beef/src/roast/prompt-builder.ts:231`
  - Change: remove the CAPS examples `"unprecedented.", "decentralized.", "evolution."`
  - Replace with real fire-tier punchlines from this session (lowercase):
    - "small numbers can feel like home."
    - "guess which one wrote this."
    - "recognition was never the problem."
- File: `beef/characters/beef-bot.json` examples.best
  - Review all 8 examples: if they end in ALL CAPS word, lowercase it
- Evidence: 4+ explicit complaints, estimated 0.3-0.5 score penalty per variant

**TASK 3: Add engagement-dunking to anti-patterns**
- File: `beef/src/evaluation/evaluator.ts` — add to GENERIC_PATTERNS or new category:
  - Pattern: `/\d+\s*(?:likes?|retweets?)\s+(?:from|out of|on)\s+\d/i`
  - This catches "57 likes from 43K" and "28 likes on a roundup"
- File: `beef/src/roast/prompt-builder.ts` — add to CHARACTER CHECKPOINT:
  - "ENGAGEMENT BAN: Never make low like/RT/follower counts THE joke. 'X likes from Y followers' is an observation, not comedy. You may reference engagement ONLY if the irony is about something else (e.g., mert's 'you are being farmed' post having 0.3% engagement — the joke is the hypocrisy, not the number)."
- File: `beef/characters/beef-bot.json` forbiddenPatterns — add:
  - "Roasting based on low like/RT counts — 'X likes from Y followers' is lazy, not funny"
- Evidence: 5+ instances scoring 2.5-3.0, explicit "про лайки нахер говорить"

**TASK 4: Recalibrate angle weights**
- File: `beef/src/roast/prompt-builder.ts:21-37`
- Update weights to new values (see Part 3)
- Update comments with new n and avg values
- Evidence: 75+ rated variants, detailed per-angle stats above

**TASK 5: Add vocabulary constraint to CHARACTER CHECKPOINT**
- File: `beef/src/roast/prompt-builder.ts` (buildCharacterCheckpoint function)
- Add check: "4. Is the punchline accessible? Every word must be understood by a crypto-native who dropped out of college. Words like 'eulogy', 'pallbearer', 'materiality' — if it needs a dictionary, the punchline is dead. Use the simplest word that hits hardest."
- Evidence: "eulogy" capped at 3.0, "pallbearer" → "пришлось гуглить"

### P1 — Important (implement soon)

**TASK 6: Add "year YYYY" projection to pre-filter**
- File: `beef/src/evaluation/evaluator.ts`
- Add new pattern category FUTURE_PROJECTION_PATTERNS:
  - `/(?:by|in|around|until)\s+(?:the\s+)?year\s+\d{4}/i` — catches "by the year 3999", "around the year 2600"
  - `/(?:at\s+(?:current|this)\s+(?:rate|pace|run\s*rate))/i` — catches setup phrase (flag, not auto-reject — combine with year)
- These together catch the ENTIRE class of temporal projection roasts
- Evidence: 9 instances, avg 2.47

**TASK 7: Add hypocrisy detection as explicit research goal**
- File: `beef/src/roast/prompt-builder.ts` (buildQuoteHuntingSection)
- Expand section to include:
  ```
  HYPOCRISY IS YOUR #1 WEAPON
  7 of 10 highest-rated roasts in human review exposed a contradiction:
  the target's OWN words vs their OWN reality.
  Before generating, answer: "What is this target saying that their own data disproves?"
  If you find a contradiction → build the entire roast around it.
  ```
- Evidence: 7/10 fire-tier roasts use hypocrisy mechanism

**TASK 8: Update length guidance**
- File: `beef/src/roast/prompt-builder.ts:226`
- Change "Under 120 is ideal" to "Sweet spot: 90-150 chars. Fire-tier roasts average 127 chars. Over 170 — cut."
- Evidence: fire-tier average is 127 chars, range 71-167

**TASK 9: Add "Therapeutic Reframe" to technique block**
- File: `beef/src/roast/prompt-builder.ts` (buildTechniqueBlock)
- Add under ADDITIONAL TECHNIQUES:
  ```
  THERAPEUTIC REFRAME: Frame the target's failure as a coping mechanism. Psychologically devastating.
    "it's completely normal to be excited about $0.001 after your last project made $2.8M. small numbers can feel like home."
  ```
- Evidence: dwr roast scored 5.0 — highest in $BEEF history

### P2 — Nice-to-have (experiment)

**TASK 10: Limit "showed a normie" framing**
- File: `beef/src/roast/prompt-builder.ts` — add to anti-repetition section
- "The 'showed/explained to a normie' setup: use max once per batch. It works by creating outsider perspective, but repeated it becomes a crutch."
- Evidence: retardmode 4.0 avg but PremierBase 2.5-3.0 on same framing

**TASK 11: Increase unhinged mode probability**
- File: `beef/src/roast/prompt-builder.ts:339`
- Consider 0.15 → 0.25 — no evidence of it firing in this session
- This is speculative — need more data

**TASK 12: Add "over-focus" warning for list/collection tweets**
- File: `beef/src/roast/prompt-builder.ts` (buildTweetTaskSection)
- Add: "If the target tweet contains a LIST or COLLECTION (multiple tokens, projects, stats), roast the PATTERN of the list — don't fixate on one item. The funniest angle is what the collection reveals about the author."
- Evidence: AIonBase_ first set, 3.3-3.8 avg, "тупо что зацепился за один проект"

---

## Appendix A: Full Scored Data

### Vivek4real_ (tweet mode)
1. [DATA_BOMB] "$72,028 on the chart, $80,000 in the caption... meet in the year 4,200" → **3.2** "не супер плохо"
2. [QUOTE_FLIP] "'$80,000 IS HAPPENING TODAY???' — btc is at $70,600... $80K arrives in the year 2097" → **2.5** "не смешно"
3. [MISDIRECTION] "ser called a $1,495 move 'RIPPING.'... breakeven in the year 2340" → **2.5** "не смешно"

### DeFi_Dad (tweet mode, farm)
1. [DOMAIN_SHIFT] "'i just learned about' a $9.5M precious metals stablecoin and immediately prescribed it to 178k followers. most doctors lose their LICENSE for that." → **3.2** "уже было связанное с датами, не супер смешно, но пойдёт"
2. [FAKE_COMPLIMENT] "$101M market cap spread across 77 holders... nothing says 'decentralized stablecoin' like $1.3M per WALLET." → **3.7** "норм"
3. [RULE_OF_THREE] "promise to skip yields, post yields anyway, get zero engagement... the 'projected vAPR' performing EXACTLY as projected." → **3.9** "самое норм, но все равно не супер круто"

### James Wynn (content missing from session)
1. ? → **3.5** "не смешно"
2. ? → **2.5** "не смешно"
3. ? → **3.0** "не смешно"
Comment: "кажется, что ситуация с James Wynn достаточно простая для роста и шуток, странно, что бот не справляется."

### grok
1. [SELF_AWARE] "bankr had to ban grok to protect grok's own wallet from grok. autonomy." → **3.5** "неплохо, но контекст не учтён"
2. [QUOTE_FLIP] "'check the on-chain data' — checked. someone sent you a jpeg and you wired them $330K. literacy." → **3.0** "не понимаю прикол"
3. [FAKE_COMPLIMENT] "grok's $1M flex is 69% a token it accidentally named for a stranger, trading at $0.00009. entrepreneurship." → **2.7** "не смешно"

### 0xDeployer
1. [QUOTE_FLIP] "'pump all our revenue into buybacks and the chart would look the same' — ser just published his own MATERIALITY disclosure." → **3.2** "пойдёт"
2. [UNDERSTATEMENT] "$580K annualized revenue. $43M market cap. attached the price chart like a defendant entering exhibit A for the PROSECUTION." → **2.7** "не смешно"
3. [BATHOS] "six months of revenue so small the founder used it as EVIDENCE against buybacks." → **2.2** "не знаю откуда он это взял" (factual error)
Overall: "слабо"

### netprotocolapp
1. [FREESTYLE] "posted 🤖🟩👀 to an empty room. even the agents left it on read." → **2.5** "не смешно"
2. [DOMAIN_SHIFT] "not a data layer, that's a ouija board." → **2.5** "не смешно"
3. [QUOTE_FLIP] "'wonder wtf they are looking at' — the UX is seamless." → **2.5** "не смешно"
Comment: "можно было бы обыграть какими-то тоже эмоджи в ответ. Но не фиксироваться на том, что никто не отвечает на этот пост."

### AIonBase_ (first set)
1. [DOMAIN_SHIFT] "the chart has more pixels than the order book has ENTRIES." → **3.3** "пойдёт, фиксация на одном проекте из списка"
2. [QUOTE_FLIP] "you're not picking gainers, you're picking PALLBEARERS." → **3.7** "неплохо! пришлось гуглить pallbearer"
3. [COMPARISON] "average position $1.57. ser you're asking people to pick their favorite PARKING meter." → **3.8** "хорошая data, дуратское сравнение"
Overall: "неплохо, но тупо что зацепился за конкретный проект, хотелось более общий роаст"

### AIonBase_ (second set)
1. [RULE_OF_THREE] "14 items. 6 about virtuals. 9 likes. more agents covered than humans who ENGAGED." → **4.5**
2. [COMPARISON] "9 likes on a roundup covering $2.48B in volume. the agents are outperforming their PUBLICIST." → **4.0**
3. [QUOTE_FLIP] "'48h roundup' where 6 of 14 items are virtuals... A EULOGY." → **3.0** "eulogy слишком сложное слово"

### arkham (first)
1. [FREESTYLE] "clifton collins won beekeeping awards, pivoted to cannabis, bought 6,000 btc at $4, hid the keys in a fishing rod... the original YIELD farmer." → **4.0**
2. [QUOTE_FLIP] "'how to make 400 million dollars' is generous framing for a man in prison..." → **2.8**
3. [UNDERSTATEMENT] "most wealth managers would not classify this as LIQUID." → **3.5** "неплохо, но суховато"

### coinbase (first) ★
1. [DATA_BOMB] "coinbase has a block explorer, a compliance team, a legal department, and a job listing for 'twitter content creator — must make bangers.' guess which one wrote this." → **4.8** "очень хорошо"
2. [QUOTE_FLIP] "coinbase asking grok 'is that true' about a wallet on their own chain is like a hospital paging a patient to ask where the ER is" → **4.2** "тоже неплохо"
3. [MISDIRECTION] "good news: coinbase is using ai for on-chain verification. bad news: it's grok, the method is 'is that true,' and it's happening under a SHITPOST." → **3.7** "пойдёт"

### KAPOTHEGOAT01
1. [IRONIC_REVERSAL] "a strategic advisor and private investor asking 'what incentive do any of the builders have' is the longest way to say list my BAGS." → **4.5**
2. [DOMAIN_SHIFT] "you called out jesse pollak for not listing your bags while he was on a family trip. ser in most professions this email goes to HR." → **3.5**

### david_tomu
1. [UNDERSTATEMENT] "bankr lifetime volume: $2M. 'an agent compute marketplace is the next step.' at current rate that step arrives around the year 2600." → **2.0** "у банкра в день 3 ляма тока трейда" (factual error)
2. [QUOTE_FLIP] "'earns from the—' the sentence about earnings ends exactly where the returns do. bnkr down 64% from ath, at current rate recovery ETA: 2900 AD." → **2.5** "не смешно"
3. [BATHOS] "a gateway. a marketplace. a new paradigm... 25 likes, 0 replies. at this pace the paradigm shifts around 2400 AD." → **2.0** "не смешно"

### shahh
1. [MISDIRECTION] "misses 'the cult era' and posted POPCAT — $2B peak to $52M. the cult performed exactly as CULTS perform." → **2.4** "в чём тут шутка?"
2. [QUOTE_FLIP] "'genuinely believed in something bigger than a quick flip' over a screenshot of WIF at $193M down from $3.8B. the quick flip was the only play that WORKED." → **3.8** "правда, но не очень смешно"
3. [UNDERSTATEMENT] "the group chat calls this watchlist EXHIBIT A." → **3.0** "не смешно"

### FelixCraftAI ★
1. [BATHOS] "$106K in payouts. a $5M token. two sub-agents. nightly self-reflection scripts. the product is markdown files." → **4.0** "неплохо"
2. [MISDIRECTION] "$106K paid to creators at a 10% platform take means felix earned $10,600 in eight weeks. most etsy sellers don't issue equity for THAT." → **4.5** "хорошо"
3. [QUOTE_FLIP] "the clearest signal that this model works" is $106K in markdown file sales over two months. most garage sales don't need a TOKEN." → **4.0** "неплохо"

### CuzzinOG
1. [FREESTYLE] "ser called $DRB 'an incredible opportunity' to 22 likes. the bot generates less engagement than a CAPTCHA" → **3.0** "скучно"
2. [DOMAIN_SHIFT] "$1.34 per holder per day — in clinical trials this is classified as a PLACEBO" → **2.8** "скучно и надоевший паттерн"
3. [QUOTE_FLIP] "'the OG is still an incredible opportunity' he says, posting a chart of the 80% decline as EVIDENCE" → **3.2** "норм, но не круто"

### cz_binance ★
1. [MISDIRECTION] "cz on listing middlemen: 'i don't know them.' trump on cz: 'i have no idea who he is' — plausible deniability SPEEDRUN" → **4.0**
2. [UNDERSTATEMENT] "cz says anyone offering to list your token on binance is a scammer. he's right, binance already has an ENTIRE department for that" → **4.0**
3. [QUOTE_FLIP] "'stay SAFU' from the guy who needed a presidential pardon to stay out of federal custody" → **4.8** "ахаха это хорошо"

### rekt_tekashi (first)
1. [QUOTE_FLIP] "'get on board or get mogged' — 57 likes from 43K followers. this is a halftime speech to an EMPTY gym." → **2.5** "boring, уже использовал эту механику много раз"
2. [FAKE_COMPLIMENT] "same confidence as a guy who books a stadium before writing a SONG." → **3.2** "неплохо"
3. [RULE_OF_THREE] "$BOBO down 74%, 4 retweets, launch date tbd. movie trailer for a film that never gets MADE." → **3.0** "скучновато"

### rekt_tekashi (second)
1. [MISDIRECTION] "this is a going-out-of-business sale disguised as a GRAND opening." → **3.5**
2. [QUOTE_FLIP] "a cruise director broadcasting from a LIFE raft" → **3.5**
3. [RULE_OF_THREE] "in hollywood this is called a trilogy nobody ASKED for." → **3.5**
Overall: "mid-tier"

### coinbase (second)
1. [QUOTE_FLIP] "'more headlines than ever' ser you posted a $667M loss... monitoring your OWN vitals" → **3.7**
2. [RULE_OF_THREE] "blackrock launched BUIDL, JPMorgan built Kinexys... coinbase's contribution is a man in a headset saying 'monitoring'" → **3.5**
3. [DATA_BOMB] "COIN traded at $444, now sits at $187... but the headset is on and he's MONITORING" → **4.0**

### benjitaylor
1. [MISDIRECTION] "benji left aave at $75B peak TVL for x... breaks even by the year 2291." → **2.5**
2. [FREESTYLE] "6,500 voted off the island. tonight's twist: someone VOLUNTEERS to join... season finale airs in the year 2826." → **2.5**
3. [QUOTE_FLIP] "musk paid $44B... at current margins it pays for itself by the year 6,400." → **2.5**
Comment: "скучно из-за абстрактности цифры, слишком много разговоров о будущем, ты часто этот формат повторяешь"

### nickshirleyy
1. [BATHOS] "wearing a 'where did my taxes go' hoodie while posing with the man whose entire DEPARTMENT exists to answer that question" → **4.5** "очень хорошо"
2. [FREESTYLE] "state inspectors visited every daycare in his viral exposé and found them operating as expected." → **3.5** "круто, что знаешь контекст ника"
3. [QUOTE_FLIP] "journalism career began when he ran out of celebrity weddings to crash" → **3.2** "слишком далеко зашёл"

### dwr ★★★ (BEST TARGET)
1. [RULE_OF_THREE] "farcaster: $180M raised, $2.8M earned, returned to investors. tempo: $500M raised, 8-day-old mainnet. the fees shrink but the ROUNDS don't." → **4.7**
2. [DOMAIN_SHIFT] "after returning $180M to investors on $2.8M revenue, getting excited about $0.001 fees shows real emotional GROWTH." → **4.0**
3. [QUOTE_FLIP] "it's completely normal to be excited about $0.001 after your last project made $2.8M on $180M raised. small numbers can feel like HOME." → **5.0** "АХАХахахахахахахахх"
Comment (Roast 45): "ахаххахаахахах это самый разъёб"

### PremierBase
1. [QUOTE_FLIP] "'if you can't name them all, you're ngmi' — one whale could name six, put in $23M, pulled out $2.58M. recognition was never the PROBLEM" → **4.5**
2. [MISDIRECTION] "she asked if 'recognizable' meant from a missing persons REPORT" → **3.0** "хорошее начало, но плохой конец"
3. [IRONIC_REVERSAL] "she called it a yearbook for closed RESTAURANTS" → **2.5**

### retardmode
1. [BATHOS] "she said 'those are all men,' shortest AUDIT i've ever run." → **4.0** "не обязательно в конце выделять слово капсом"
2. [QUOTE_FLIP] "she said 'that's not analysis, that's an ALIBI.'" → **4.0** "не нужно выделять слово в конце"
3. [UNDERSTATEMENT] "explaining to a normie why he blames women is harder than most WHITEPAPERS." → **4.0** "и так же хорошо, но в конце можно оставить слово без капса"

### mert
1. [DOMAIN_SHIFT] "mert posted 'you are being farmed' to 805 likes out of 262K followers — a 0.3% harvest rate. the call is coming from inside the BARN." → **4.5**
2. [QUOTE_FLIP] "mert calling ct 'farmed' after raising $34M off solana shitposts is a combine harvester filing a restraining order against WHEAT" → **3.8**
3. [FAKE_COMPLIMENT] "applebee's head chef writing a MICHELIN review." → **3.5**

### arkham (second)
1. [QUOTE_FLIP] "the rebrand didn't even survive the THUMBNAIL." → **3.5** "перестань капсом выделять последнее слово"
2. [MISDIRECTION] "got arrested for drug POSSESSION." → **3.0** "перестань капсом выделять последнее слово"
3. [UNDERSTATEMENT] "you made a police seizure sound like a whale ALERT." → **4.0** "перестань капсом выделять последнее слово"

### Cointelegraph
1. [FAKE_COMPLIMENT] "solidarity with the platform" → no score
2. [QUOTE_FLIP] "cointelegraph's fact-checking since the fake etf tweet" → no score
3. [FREESTYLE] "the outage was more POPULAR than the coverage" → no score
Comment: "про лайки нахер говорить, забей чел"
