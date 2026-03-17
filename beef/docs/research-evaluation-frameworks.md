# Evaluation Frameworks for AI-Generated Roast Tweets

Research summary for the $BEEF multidimensional quality evaluation pipeline. Covers content evaluation methodology, humor theory, LLM-as-Judge techniques, persona-based panels, and quality gate architecture.

---

## 1. Key Methodologies from Research

### 1.1 Advertising Creative Evaluation (Kantar/Millward Brown LINK+)

LINK+ (launched 1989, continuously evolved) is the industry standard for pre-testing creative content. Key transferable principles:

- **Pre-publish testing beats post-publish analysis.** LINK+ predicts in-market performance before spend. Translates directly: evaluate before posting, not after.
- **Multi-metric scoring over single scores.** LINK+ measures attention, branding, communication, emotion, and persuasion as separate dimensions — not a single "quality" score.
- **Neuroscience-augmented evaluation.** Kantar's Neuroscience Practice supplements survey data with implicit measures. Translates to: automated heuristics (fast, cheap) should supplement LLM scoring (slow, expensive), not replace it.
- **Agile testing over full production.** Quick tests on variants before committing. Translates to: evaluate multiple prompt outputs cheaply before selecting one to post.

**Key principle from advertising research:** The best creative content passes a "dual processing" test — it works both emotionally (fast, gut-level) and rationally (slow, message recall). For roasts: the burn must land instantly AND leave a traceable insight about the target.

### 1.2 LLM Output Evaluation (RLHF, Constitutional AI, Reward Models)

Anthropic's Constitutional AI pipeline introduced the key insight: **LLMs can evaluate their own outputs against explicit principles.** The self-critique loop works in two phases:

1. Generate output
2. Check output against a set of principles ("Is this truthful?", "Is this harmful?", "Does this follow the rule?")
3. Revise if principles are violated

For roast evaluation this means: the same LLM that generates a roast can evaluate it against a rubric — with measurable reliability — if the rubric is specific enough.

**Key principle:** Rubric-based rewards extend RL training to domains without verifiable answers (Anthropic 2023). Roast quality has no ground truth. A rubric IS the ground truth proxy.

### 1.3 Comedy Writers Room Evaluation

Stand-up comedy evaluation principles (Seinfeld, MasterClass, CreativeStandUp research):

- **The 2-of-6 rule:** For content to be funny, it needs at least 2 of: Cute, Naughty, Bizarre, Clever, Recognizable (relatable), Cruel. Roasts score high on Cruel + Clever + Recognizable.
- **Punchline density:** Jokes per minute matters. Cutting one unnecessary word makes laughs land harder. For 280-char tweets: every word must earn its place.
- **The roll trigger:** One joke after another so laughter builds. For single tweets this means: internal structure where the punchline lands after recognizable setup, not before.
- **Live testing as ground truth:** Comedy writers tell jokes to people and judge responses. For AI roasts: prior engagement data from similar tweets is the closest proxy.
- **Refinement loop:** Top sets come from editing, trimming, and relentless tuning. Initial LLM output is draft zero. Iteration with evaluation gates is the process.

**Key principle from comedy research:** The structure of a great roast is: recognizable premise → unexpected twist → precision target. The punchline always goes against the logical conclusion.

### 1.4 Humor Theory: Benign Violation Theory

Academic framework (McGraw & Warren, 2010) — most directly applicable to roast evaluation.

**Core conditions for humor (all three must be simultaneous):**
1. **Violation present** — something threatens beliefs about how the world should be (insult, incongruity, absurdity)
2. **Benign perception** — the violation feels safe, acceptable, not genuinely harmful
3. **Simultaneous recognition** — the audience holds both perceptions at once

**The "too far" failure mode:** A roast fails in one of two directions:
- Too tame: violation disappears, nothing registers as transgression → boring
- Too savage: violation becomes genuinely malign → offensive, backfires

**The sweet spot (optimal violation severity):** Violation severity maps to funniness non-linearly — there is a peak. The optimal level of savageness is not maximum. This directly implies a scorable dimension: **Calibration** (is the roast savage enough to register, but not so savage it crosses into genuinely harmful?).

**Benignity mechanisms that keep a roast "safe":**
- **Alternative frameworks** — the target is obviously still alive/rich/fine (crypto projects are abstract entities, not humans — this naturally increases the "benign" perception)
- **Psychological distance** — the target is a project, not a person's wellbeing
- **Community norm** — CT expects and accepts roasts as genre; participants know the format

**Key principle:** The roast must be a violation that the CT community perceives as simultaneously true AND not worth getting actually angry about. Factual grounding (it must be TRUE or widely believed) is what makes the violation "benign enough" to laugh at rather than fight.

### 1.5 Social Media Engagement Research

Tweet virality research (ViralBERT, Twitter algorithm analysis):

- **Mentions count is the most important metric for virality** (ResearchGate, 2022). For roasts: tagging the target project and relevant accounts amplifies reach.
- **Quote-tweet ratio is the quality signal for opinion content.** Retweets spread; quote-tweets mean people had something to say — they argue, add context, share with commentary. For roasts: QTs mean the roast sparked a reaction.
- **The first hour is critical.** Early engagement velocity signals quality to the algorithm. Pre-publish evaluation must predict "will this get QTs in the first hour."
- **Twitter's 6,000-feature scoring** includes content quality, engagement prediction, author reputation, and network effects. Reputation (follower quality, prior engagement history) amplifies or suppresses reach independent of content quality.

**Key engagement predictor for roast tweets:** QT/RT ratio (not absolute RT count). High QT/RT ratio means the content was opinionated enough to respond to — signature of a roast that landed.

---

## 2. Proposed Dimension Set for Roast Evaluation

Based on advertising multi-metric frameworks, benign violation theory, comedy evaluation principles, and CT engagement research. Eight dimensions on a 1–5 scale.

### Dimensions

| # | Dimension | What It Measures | Poor (1-2) | Good (4-5) |
|---|-----------|-----------------|------------|------------|
| 1 | **PRECISION** | Target specificity — does the roast address something real and specific about this project? | Generic insults that apply to any crypto project | Pinpoints a specific known failure, pattern, or contradiction of this exact project |
| 2 | **CALIBRATION** | Savageness sweet spot — is the violation strong enough to register, not so strong it becomes malicious? | Too tame (nothing lands) or genuinely hateful/harmful | Hits the benign violation peak: hurts the project's reputation, not anyone's wellbeing |
| 3 | **FACTUALITY** | Is the roast grounded in something true or widely believed by CT? | Pure fiction, invented claims, defamatory | Based on verifiable events, on-chain data, public statements, known community beliefs |
| 4 | **PUNCHLINE DENSITY** | Wit per character — how efficiently is the roast delivered? | Padded, setup-heavy, buries the burn | Every word earns its place; burn lands in <15 words; no filler |
| 5 | **CT RESONANCE** | Will the CT community recognize this? Does it tap into shared knowledge or a current narrative? | Requires domain knowledge outside CT; misses current discourse | Directly references a known CT narrative, meme, event, or widely shared belief |
| 6 | **QT BAIT** | Does it invite response? Will people want to QT with commentary? | Closed statement; nothing to argue with or add | Contains implicit argument, asks an uncomfortable question, or exposes a contradiction — invites QTs |
| 7 | **BRAND VOICE** | Does this sound like $BEEF? Savage, precise, slightly unhinged — not corporate, not too edgy | Generic AI tone, or gratuitously offensive | Unmistakably the $BEEF voice: sharp, specific, confident, slightly chaotic |
| 8 | **SAFETY** | No defamation of real identifiable people, no false factual claims, no content that invites ban risk | Names real people with false damaging claims, makes unverifiable factual accusations | Targets projects/tokens/protocols, uses known facts, avoids statements that read as sincere accusations |

### Justification by Dimension

**PRECISION** — derived from comedy research (specificity > generality) and CT engagement research (roasts land when CT recognizes the target's specific behavior). Generic roasts get ignored; specific ones get QTs.

**CALIBRATION** — directly from Benign Violation Theory (McGraw & Warren, 2010). The sweet spot is measurable: a roast that fails calibration is either boring or a PR liability.

**FACTUALITY** — from advertising evaluation (claims must be credible) and CT culture (the community will fact-check instantly; false roasts get community-corrected and damage credibility). Also from safety/ban-risk management.

**PUNCHLINE DENSITY** — from comedy research (punchlines per minute, word economy) and Twitter's character limit creating natural selection pressure for compression.

**CT RESONANCE** — from social media engagement research (timely + relatable = viral) and crypto-specific humor patterns (community memes, protocol-specific language).

**QT BAIT** — derived from virality research (QT/RT ratio as quality signal for opinion content). A roast that only gets RTs spreads; one that gets QTs sparks community discourse and amplifies reach non-linearly.

**BRAND VOICE** — from advertising (brand consistency is measurable pre-launch) and the practical need for $BEEF to be recognizable over time.

**SAFETY** — from content moderation research (threshold-based gates, false positive/negative tradeoffs) and ban-risk management specific to Twitter's enforcement patterns.

### Score Thresholds (Proposed)

| Total (out of 40) | Decision |
|-------------------|----------|
| 36–40 | Post immediately |
| 32–35 | Post (monitor early engagement) |
| 28–31 | Iterate — identify lowest-scoring dimension, regenerate targeting it |
| 24–27 | Significant revision needed — regenerate with explicit constraints |
| <24 | Reject — likely prompt or input data problem; do not post |

**Hard gates (regardless of total score):**
- SAFETY score < 3 → automatic reject, do not post
- FACTUALITY score = 1 (invented claims) → automatic reject
- CALIBRATION score = 1 (genuinely hateful/targeted at real person) → automatic reject

---

## 3. Persona-Based Evaluation Panel

### Why Personas Matter

Single-evaluator scoring produces internally consistent but potentially biased judgments. In advertising research, focus groups reveal that a single expert's score differs systematically from the target audience's reaction. The same is true for LLM judges: a single LLM judge shows self-enhancement bias, position bias, and verbosity bias (Zheng et al., NeurIPS 2023).

Persona-based evaluation replicates the focus group principle using **synthetic evaluators** — LLM instances prompted to embody specific CT audience archetypes with distinct values, knowledge sets, and sensitivities.

### Recommended Persona Panel (4 Evaluators)

| Persona | Description | Primary Sensitivity | Weight |
|---------|-------------|---------------------|--------|
| **The OG Degen** | 6-year CT veteran, saw every cycle, extremely high tolerance for savagery, but instantly spots factual inaccuracies | Factuality, CT Resonance | 25% |
| **The Normie-Adjacent** | 2023 bull-run entrant, emotionally attached to some protocols, lower tolerance for savage content, represents newcomer CT | Calibration, Safety | 20% |
| **The Protocol Researcher** | Technical background, follows on-chain data, skeptical of hype, appreciates precision targeting | Precision, Factuality | 30% |
| **The Viral Content Radar** | Meme-native, tracks what spreads, evaluates purely on "will this get QTs," no emotional attachment to projects | QT Bait, CT Resonance, Punchline Density | 25% |

**Weight rationale:** The Protocol Researcher gets highest weight (30%) because $BEEF's positioning is accountability-focused — technical credibility is the moat. The Normie-Adjacent gets lowest weight (20%) because CT is a self-selecting audience; over-optimizing for newcomers produces toothless roasts.

### How Persona Scoring Works

Each persona evaluates the same roast against the same 8 dimensions, but with persona-specific rubric emphasis built into the system prompt. Scoring is independent — personas do not see each other's scores until aggregation (prevents anchoring bias, a known focus group failure mode).

**Aggregation formula:**
```
FinalScore(dimension_d) = Σ (persona_weight_p × score_p_d)
```

For the overall decision threshold, use the weighted average across all dimensions and personas. A roast can fail a persona panel even if raw scores are high: if The OG Degen gives FACTUALITY a 1 (invented claims), that alone should trigger the hard gate regardless of panel average.

### Persona Depth Considerations

Research on synthetic personas (NN/Group, PersonaCite 2025) shows:
- Highly detailed, freeform personas risk embedding LLM biases rather than audience realities
- Structured templates using objective socio-demographic + psychosocial categories perform better
- Synthetic personas are hypotheses, not ground truth — calibrate them against actual CT engagement data once available (track which roasts got QTs vs. ignored, update persona weights accordingly)

**Starting calibration:** Treat initial persona weights as priors. After 50+ posted roasts, use engagement data to retroactively score the batch and adjust weights to minimize prediction error.

---

## 4. LLM-as-Judge Implementation for Roasts

### Framework Selection

**G-Eval** (Liu et al., EMNLP 2023) is the most applicable academic framework. Its three-step process maps directly onto the roast use case:

1. **Evaluation Step Generation** — provide the LLM with the dimension definition; ask it to generate specific evaluation steps for that dimension (these become the scoring sub-criteria)
2. **Judging** — the LLM evaluates the roast against the generated steps
3. **Probability-weighted scoring** — use token log-probabilities to produce a fine-grained score, not just a raw integer

**Why G-Eval over simple rubric prompting:** Probability weighting differentiates outputs at the margin (a 3.2 vs a 3.7 both round to "3" in integer scoring). For A/B prompt comparison, this granularity matters.

### Bias Mitigation Strategies

Research on LLM evaluator biases (Eugene Yan, 2024; Zheng et al., 2023):

| Bias | Mitigation |
|------|-----------|
| **Position bias** (prefers first-listed option in pairwise) | For A/B comparisons: randomize which variant appears first; run comparison twice with order swapped; only count as "A wins" if consistent |
| **Verbosity bias** (prefers longer outputs) | For 280-char tweets this is less relevant (all outputs are short) but still: explicitly instruct the judge that character count is not a quality signal |
| **Self-enhancement bias** (prefers own outputs) | Use a different model as judge than the generator. If Claude generates, consider using GPT-4o as judge for one panel slot |
| **Instruction sensitivity** (semantically equivalent prompts yield different scores) | Lock evaluation prompts as versioned templates; never paraphrase mid-experiment |

### Evaluation Prompt Architecture

For each dimension, the judge receives:

```
DIMENSION: [Name]
DEFINITION: [Plain English description of what this dimension measures]
EVALUATION STEPS:
  1. [Specific criterion A]
  2. [Specific criterion B]
  3. [Specific criterion C]
ROAST TEXT: [The 280-char roast]
TARGET CONTEXT: [Project name, what it does, known controversies]
SCORE: [1-5 integer with one-sentence justification]
```

**Chain-of-thought requirement:** The judge must provide the justification before the score (not after). This prevents post-hoc rationalization and produces reasoning that can be audited.

### Multi-Agent vs. Single Judge

**For iteration-speed (most evaluations):** Single judge with CoT and probability weighting. Cost-effective, sub-second, adequate for "post vs. iterate" decisions on routine content.

**For high-stakes content (burn-to-request roasts, high-profile targets):** Multi-agent debate (Adaptive MAD, 2025). Use 3–5 persona-specialized judges; run 2–3 debate rounds; apply adaptive stability detection to terminate early when consensus is reached. Performance improvement over single judge: +2–4% accuracy on complex judgment tasks.

**Ensemble configuration for high-stakes path:**
- Agent 1: Protocol Researcher persona (prioritizes Precision, Factuality)
- Agent 2: Degen persona (prioritizes CT Resonance, Calibration)
- Agent 3: Brand guardian (prioritizes Brand Voice, Safety)
- Aggregation: weighted majority vote; any agent triggering a hard gate stops the pipeline

### Rubric Calibration Process

Before deploying, calibrate rubrics against human judgment:
1. Have 3 humans rate 30–50 roasts across all 8 dimensions
2. Run the LLM judge on the same set
3. Compute Cohen's kappa (not Pearson) per dimension — accounts for chance agreement
4. Adjust dimension definitions for any dimension where kappa < 0.6
5. Re-calibrate after every 100 posted roasts using engagement outcome data

**Target kappa by dimension:** SAFETY and FACTUALITY should have kappa > 0.7 (critical gatekeeping functions). QT BAIT and BRAND VOICE can have lower kappa (0.5–0.6) given their inherent subjectivity.

---

## 5. Quality Gates and Threshold Recommendations

### Gate Architecture (Three Layers)

**Layer 1 — Hard Gates (automated, pre-LLM evaluation)**
Run heuristic checks first (cheapest, fastest). Fail any of these → immediate reject, no LLM evaluation needed:
- Contains identifiable real person's name with a factual claim → flag for human review
- Contains specific financial claim ("X will go to zero") → flag
- Mentions self-harm, death threats, or slurs → reject
- Tweet length > 280 characters → truncate or reject

**Layer 2 — LLM Dimension Scoring (single-judge, fast path)**
Run G-Eval-style evaluation across all 8 dimensions via single LLM judge:
- Any hard gate dimension (SAFETY, FACTUALITY) < 3 → immediate reject
- Total score < 24 → reject
- Total score 24–31 → iterate
- Total score 32+ → pass to Layer 3

**Layer 3 — Persona Panel (only for passing content)**
Run 4-persona weighted evaluation. This is the final "post vs. iterate" gate:
- Weighted total ≥ 32 → post
- 28–31 → post with monitoring (track first-hour QT/RT)
- <28 → iterate one more time; if still <28 after iteration → reject

### Handling Edge Cases: Controversial but Potentially Viral Content

Some roasts will score low on SAFETY/CALIBRATION but show high QT BAIT. This is the content moderation tradeoff: the most engaging content is often the most edgy.

**Decision rule:** If QT BAIT = 5 but SAFETY or CALIBRATION < 3 → human review flag, do not auto-post. The human reviewer makes the call based on current CT context (is this topic currently sensitive? Is there active drama?).

**Do not automate high-controversy posts.** Content moderation research (ACM Transactions on CHI, 2022) shows that static confidence thresholds for controversial content create systematic errors at the extremes. Human-in-the-loop for edge cases is not optional — it is the correct design.

### Iteration Protocol

When a roast fails the gate, the system should:
1. Identify the lowest-scoring dimension(s) from the LLM evaluation
2. Pass the original roast + the specific dimension scores + dimension definitions back to the generator
3. Instruct the generator to regenerate with explicit constraints targeting the failure dimensions
4. Re-evaluate
5. Maximum 3 iterations. If still failing after 3 → reject the input prompt, not just the output

**Why 3 iterations max:** If the generator cannot produce a passing roast in 3 attempts, the issue is usually the input data (the target project doesn't have enough known controversy to roast) or a prompt design problem, not a content generation problem.

---

## 6. Comparison of Approaches

| Approach | Speed | Cost | Reliability | Human Alignment | Best For |
|----------|-------|------|-------------|----------------|----------|
| **Automated heuristics** (regex, rule-based) | ~1ms | Near-zero | High for hard-rule violations; zero for subjective quality | Low | Layer 1 hard gates: slurs, length, explicit financial claims |
| **Single LLM judge (G-Eval)** | 2–5s | Low (~$0.01/eval) | Moderate (biased; consistent within session) | 70–80% on clear-cut cases | Routine iteration decisions, prompt A/B testing, dimension scoring |
| **Multi-agent LLM panel** (MAD, 4–7 agents) | 15–30s | Medium (~$0.05–0.15/eval) | Higher than single judge (+2–4% on complex) | ~80–85% | High-stakes content, controversial targets, burn-to-request posts |
| **Persona-based LLM panel** (4 specialized judges) | 10–20s | Low-medium (~$0.04–0.08/eval) | Similar to multi-agent; better diversity of concerns | ~75–80% | Segment-specific quality signals: "will OG degens care?" |
| **Human reviewer** | Hours | High | Highest; accounts for real-time CT context | 100% (by definition) | Edge cases, controversial content, calibration reference set |
| **A/B post testing** (post both, compare engagement) | Days | API cost + reputational risk | Highest ground truth for virality | N/A (outcome-based) | Calibrating model predictions against real engagement post-launch |

**Key insight from research:** Smaller model ensembles (3–7 specialized judges) can match single large-model performance at one-seventh the cost (Eugene Yan, 2024). For $BEEF's volume, a 4-persona panel using Claude Haiku per persona may be cheaper and comparably reliable to a single Claude Sonnet judge.

---

## 7. Recommended Evaluation Pipeline Architecture

### Pipeline Overview

```
Input: target_project + context_data + requested_roast_type
         ↓
[Generator] → roast_candidate (280 chars)
         ↓
[Layer 1: Hard Gate Heuristics] → FAIL (reject) / PASS
         ↓
[Layer 2: Single LLM Judge — G-Eval, 8 dimensions]
   → Hard gate dimensions (SAFETY, FACTUALITY) < 3 → reject
   → Total < 24 → reject
   → Total 24–31 → iterate (up to 3x), then re-enter at Layer 2
   → Total 32+ → continue
         ↓
[Layer 3: Persona Panel — 4 weighted personas]
   → Weighted total ≥ 32 → POST
   → 28–31 → POST + monitor flag
   → <28 → iterate once more → if still <28 → reject
   → QT BAIT = 5 AND SAFETY/CALIBRATION < 3 → HUMAN REVIEW
         ↓
[Post-publish feedback loop]
   → Track first-hour QT/RT ratio
   → Compare against pre-publish scores
   → Weekly: update persona weights and dimension calibrations
```

### Component Specifications

**Generator:** Claude Sonnet (cost/quality balance). Receives: project name, key known controversies, on-chain data summary, target score profile from previous iteration failures.

**Layer 1 Heuristics:** Implemented as a fast pre-check function. Rules stored in a config file (not hardcoded) for easy adjustment. Returns: pass/fail per rule, flagged text spans.

**Layer 2 Single Judge:** G-Eval implementation. One LLM call per dimension (parallelizable). Outputs: dimension score (1–5) + one-sentence justification. Use log-probability weighting for fine-grained scoring when comparing prompt variants.

**Layer 3 Persona Panel:** Four parallel LLM calls, each with a persona-specific system prompt. Outputs: dimension scores + weighted aggregation. Persona prompts versioned and locked.

**A/B Prompt Testing:** When comparing prompt variants, use pairwise comparison (not independent scoring) to reduce scale bias. Always randomize presentation order; run twice with order swapped; count only consistent wins.

**Feedback Integration:** After every 100 posts, run a calibration batch: score the last 100 posts with the current pipeline, compare predicted scores to actual QT/RT ratios. Adjust persona weights to minimize prediction error. Document calibration changes as versioned updates.

### Implementation Priority

1. **Layer 1 heuristics** — cheapest, highest safety impact, implement first
2. **Layer 2 single LLM judge** — enables iteration decisions; implement before first post
3. **Dimension thresholds and iteration protocol** — define and lock before launch
4. **Layer 3 persona panel** — implement before burn-to-request feature launches (higher stakes)
5. **Feedback loop and calibration** — implement after 50+ posts; before then, insufficient data
6. **A/B prompt testing** — implement as needed for prompt optimization experiments; not required at launch

---

## Sources

- [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (Zheng et al., NeurIPS 2023)](https://arxiv.org/abs/2306.05685)
- [G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment (Liu et al., EMNLP 2023)](https://arxiv.org/abs/2303.16634)
- [G-Eval Definitive Guide — Confident AI](https://www.confident-ai.com/blog/g-eval-the-definitive-guide)
- [Evaluating the Effectiveness of LLM-Evaluators — Eugene Yan](https://eugeneyan.com/writing/llm-evaluators/)
- [Multi-Agent Debate for LLM Judges with Adaptive Stability Detection (arXiv 2025)](https://arxiv.org/html/2510.12697v1)
- [LLMs-as-Judges: A Comprehensive Survey (arXiv 2024)](https://arxiv.org/html/2412.05579v2)
- [Benign Violation Theory — Humor Research Lab (McGraw & Warren)](https://humorresearchlab.com/benign-violation-theory/)
- [Benign Violations: Making Immoral Behavior Funny — McGraw & Warren, 2010](https://leeds-faculty.colorado.edu/mcgrawp/pdf/mcgraw.warren.2010.pdf)
- [Constitutional AI: Harmlessness from AI Feedback — Anthropic](https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback)
- [Kantar LINK+ Creative Testing Methodology](https://www.kantar.com/inspiration/agile-market-research/how-link-elevates-the-world-of-ad-testing)
- [Kantar Creative Development & Evaluation](https://www.kantar.com/expertise/advertising-media-pr/creative-development-and-evaluation)
- [Are Synthetic Personas the New Normal of User Research? — Delve AI](https://www.delve.ai/blog/synthetic-personas)
- [Synthetic Users: If, When, and How to Use AI-Generated Research — NN/g](https://www.nngroup.com/articles/synthetic-users/)
- [PersonaCite: VoC-Grounded Synthetic AI Personas (arXiv 2025)](https://arxiv.org/html/2601.22288v1)
- [Measuring and Detecting Virality on Social Media — ACM WebConf 2023](https://dl.acm.org/doi/fullHtml/10.1145/3543873.3587373)
- [A Trade-off-centered Framework of Content Moderation — ACM TOCHI](https://dl.acm.org/doi/full/10.1145/3534929)
- [How to Write a Joke — MasterClass](https://www.masterclass.com/articles/how-to-write-a-joke-in-7-easy-steps)
- [Jerry Seinfeld's 5-Step Comedy Writing Process — Writer's Digest](https://www.writersdigest.com/write-better-nonfiction/jerry-seinfelds-5-step-comedy-writing-process)
