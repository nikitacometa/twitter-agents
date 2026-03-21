# Refactoring Analysis: Unified Pipeline + Telegram-Only Deploy

**Date:** 2026-03-21
**Revision:** v2 (critical review)
**Status:** Revised plan — evolutionary approach replaces revolutionary rewrite

---

## Executive Summary

Three goals: telegram-only deploy, unified roast generation, enhanced Telegram commands. The v1 plan proposed a new `RoastPipeline` class replacing everything. After code-level review, this is **overengineered and risky**. The real issues are surgical fixes, not a rewrite.

**v2 approach:** Extend existing `RoastEngine`, don't replace it. Fix the bug in `SelfEvaluator`. Merge the two `buildCreativeMemory()` functions. Add mutations as an optional parameter. Wire the evaluation through to Telegram. These are small, testable changes that achieve the same goals with ~1/3 the code churn.

---

## What v1 Got Wrong

### 1. `RoastPipeline` class is redundant

`RoastEngine` already does everything `RoastPipeline` was supposed to do: multi-strategy generation, content filtering, evaluation, variant ranking. Creating a new class above it would mean:
- Two layers of abstraction for the same thing
- `BatchGenerator` would need to be rewritten to use `RoastPipeline` instead of prompt builders directly — but BatchGenerator's entire purpose is batch orchestration (concurrency, farm_attempt storage, target status tracking), which is genuinely different
- `QueueManager` already calls `generateRoasts()` which calls `RoastEngine` — adding `RoastPipeline` between them adds a layer without value

**v2:** Extend `RoastEngine` with mutations + freshness. Keep `generateRoasts()` as the facade. `BatchGenerator` keeps its batch orchestration but delegates single-target generation to a shared method.

### 2. `PipelineConfig` with 15 params is a god-object

v1 proposed 15 config parameters with 5 presets. In practice:
- `strategies` is always all 3 — nobody wants to pick a single strategy
- `useStockpileMemory/useFeedbackMemory/useExternalExamples/usePatterns` are always all-true — more data is always better
- `dedupAgainstStockpile` and `classifyFreshness` are implementation details, not user-facing config

**v2:** Only 4 meaningful parameters: `profile`, `variantCount`, `mutations`, `evaluationMode`. Everything else uses "all available data" or is handled implicitly.

### 3. Farm can't fully share the pipeline

`BatchGenerator` has fundamentally different flow from `RoastEngine`:

| Aspect | RoastEngine | BatchGenerator |
|--------|-------------|----------------|
| Targets | One | Multiple (with concurrency) |
| Mutations | None (v1 wanted to add) | Yes, per-strategy |
| Output parsing | Trusts structured output | Defensive JSON extraction from markdown |
| Storage | Returns in-memory | Writes to `farm_attempt` table |
| Evaluation | Inline (optional) | Separate step, separate CLI command |
| Profile | `roast-research` | `farm-generate` |

**Forcing both into one class would mean:** either the class has two code paths (which is just a merged file, not unification) or the farm loses its defensive parsing and batch-specific features.

**v2:** Share the building blocks (prompt builders, mutations, memory, evaluator), NOT the orchestration. `BatchGenerator` and `RoastEngine` both use `buildCreativeMemory()`, `pickMutations()`, `filterRoast()`, `RoastEvaluator` — but orchestrate them differently.

### 4. CreativeMemory merge isn't needed yet

Current state: `human_feedback` table has **0 rows**. `external_examples` has **0 rows**. `roast_patterns` has **0 rows**. The rich 8-source builder in `roast-generator.ts` currently returns `{ fireExamples: [] }` every time.

The farm builder reads from stockpile (102 entries) and farm_attempts (390). This is the only pipeline that actually HAS creative memory data right now.

**v2:** Merge makes sense architecturally but won't change behavior until human feedback flows in. Do it, but recognize it's a cleanliness fix, not a quality improvement — **yet**.

### 5. `SelfEvaluator` deletion is riskier than a fix

`SelfEvaluator` is used in `farm/index.ts` (lines 334, 673). It takes `FarmAttempt` objects. `RoastEvaluator` takes `EvaluateInput` objects (different shape: `id` vs `attemptId`). Deleting `SelfEvaluator` and switching to `RoastEvaluator` requires:
- Input mapping in `farm/index.ts`
- The `EvaluationOutput` type is different (`attemptId` vs `id`)
- Tests in `self-evaluator.spec.ts` need rewriting

**v2:** Don't delete. Fix the one-line bug (import `checkHardVetoes` from `@evaluation/evaluator.js` instead of the local version). Add `checkFunnyConsensusVeto`. This is a 5-line fix vs a multi-file rewrite.

### 6. Telegram `/farm` command needs reality check

Farm-quality from Telegram means: 3 strategies x 2 variants = 6 LLM calls (generation) + 5 judges x 4 variants = 20 LLM calls (evaluation) = **26 LLM calls**. Via Claude Code Agent subprocess, each call takes 30-120s. Even with parallelism (3 strategies parallel, 5 judges parallel), total time: **5-10 minutes**.

This is fine for background generation, but the Telegram UX needs to handle it gracefully. Progress updates every 15s + timeout handling + result delivery even if user navigates away.

**v2:** Keep `/farm` but design it as a background task from the start. Don't block the Telegram handler — fire generation, send intermediate updates, deliver result when ready.

---

## Current State (unchanged from v1)

### Pipeline Comparison

| Feature | Telegram /roast | QueueManager | Farm Generate | Farm Evaluate |
|---------|----------------|--------------|---------------|---------------|
| **Entry** | `roast-generator.ts` | `queue-manager.ts` | `batch-generator.ts` | `self-evaluator.ts` |
| **Strategies** | 3 parallel | 3 parallel (via roast-generator) | 3 parallel | N/A |
| **Mutations** | None | None | 26 mutations, weighted | N/A |
| **CreativeMemory sources** | 8 (feedbackRepo + 3 optional repos) | Same as Telegram | 2 (stockpile + farmAttempt) | N/A |
| **Profile enrichment** | Param exists, unused | Used (Twitter bio) | None | N/A |
| **Evaluation** | Always `none` (hardcoded) | Configurable | Separate step | 5 judges, per-judge FUNNY veto (bug) |
| **Content filter** | `filterRoast()` inline | `filterRoast()` inline | `filterRoast()` inline | `preFilter()` before LLM |
| **Output parsing** | Trust structured output | Trust structured output | Defensive JSON extraction | Defensive JSON extraction |

### Confirmed Bugs

1. **`SelfEvaluator.checkHardVetoes` FUNNY regression** — per-judge veto instead of majority consensus. Produces false positives on deadpan roasts. Comment in source acknowledges it: "New code should use RoastEvaluator... which has majority-based FUNNY veto"

2. **`evaluationMode` never passed from Telegram** — `handleRoastCommand()` calls `generateRoasts()` without `evaluationMode` param. The param exists and works — it's just not wired through.

3. **`confirmKeyboard` dead code** — defined in `keyboards.ts`, no handler in `bot.ts`. Was intended for "queue for posting" flow.

4. **`guard.middleware.ts` unused** — auth logic duplicated inline in `bot.ts` with group-mode extension. The middleware file is dead code.

---

## Revised Architecture (v2)

### Principle: Share building blocks, not orchestration

```
Shared Building Blocks:
  ├── buildCreativeMemory()          — unified, merged from both sources
  ├── buildRoastPrompt/Persona/Adv  — prompt builders (unchanged)
  ├── pickMutations()                — from farm/mutations.ts (now available to all)
  ├── filterRoast()                  — content filter (unchanged)
  ├── classifyFreshness()            — from farm/freshness.ts (now available to all)
  ├── RoastEvaluator                 — single evaluator (SelfEvaluator fixed to match)
  └── validateOutput/parseOutput     — robust parsing (farm's version shared)

Orchestrators (keep separate, different concerns):
  ├── RoastEngine                    — single target, inline eval, returns RoastResult
  ├── BatchGenerator                 — multi target, batch concurrency, stores farm_attempt
  └── QueueManager                   — dequeue, stockpile check, post to Twitter
```

### What changes in each component

**`RoastEngine` (roast-engine.ts):**
- Add optional `mutationCount` parameter to `generateRoast()`
- When mutations > 0: call `pickMutations()`, append `formatMutationSection()` to prompt
- Add robust `parseOutput()` from BatchGenerator (defensive JSON extraction)
- No other changes — strategies, eval, filtering already work

**`buildCreativeMemory()` (roast-generator.ts → extract to own file):**
- Merge both builders into one function
- Accept all repos as optional params
- If `stockpileRepo` available: add stockpile fire examples (score >= 4.0)
- If `feedbackRepo` available: add feedback fire examples
- If `farmAttemptRepo` available: add reject examples from worst attempts
- Angle weights: merge feedback performance data + inverse-frequency from stockpile
- External examples, patterns, style supplement: same as current
- Result: richer CreativeMemory for ALL callers, no data loss

**`SelfEvaluator` (farm/self-evaluator.ts):**
- Replace local `checkHardVetoes` with import from `@evaluation/evaluator.js`
- Add `checkFunnyConsensusVeto` call (from `@evaluation/evaluator.js`)
- 5-line fix, no interface changes, no type changes

**`BatchGenerator` (farm/batch-generator.ts):**
- Replace local `buildCreativeMemory()` with shared function
- Replace local `validateOutput()` with shared robust parser
- Keep everything else (batch concurrency, farm_attempt storage, mutations)

**`generateRoasts()` (admin/roast-generator.ts):**
- Add `mutationCount` param, pass through to `RoastEngine`
- Delete local `buildCreativeMemory()`, use shared function
- No other changes

**`QueueManager` (queue/queue-manager.ts):**
- Pass stockpileRepo to `buildCreativeMemory()` call (currently not passed)
- No other changes

**`bot.ts` (admin/bot.ts):**
- `/roast` command: parse `--eval` flag, pass `evaluationMode` through
- `/power` command: default `evaluationMode: 'quick'`
- New `/farm` command: background task, serious evaluation, mutations
- "Add to stockpile" button + handler
- Show evaluation scores when available

---

## Telegram-Only Deployment (simplified from v1)

### The system already works telegram-only

With this `.env`, everything works today:
```env
NODE_ENV=production
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_ADMIN_IDS=<admin_id_1>,<admin_id_2>
ANTHROPIC_API_KEY=xxx
ENABLE_AUTONOMOUS_POSTING=false
ENABLE_MENTION_REPLIES=false
DRY_RUN=true
```

Twitter client creates as no-op. MentionHandler/EngagementTracker exit immediately. QueueManager created but never triggers (autonomous posting disabled).

### v2: Minimal changes for clean telegram-only

Instead of v1's `ENABLE_TWITTER` env var (which requires conditional init logic in index.ts):

**Just add clarity — don't add complexity:**

1. Add `ENABLE_TWITTER` to `env.validation.ts` (default: `true`)
2. In `index.ts`: wrap Twitter client + MentionHandler + EngagementTracker + Twitter scheduler jobs in `if (config.ENABLE_TWITTER)` blocks
3. Pass `twitter: undefined` to QueueManager when Twitter disabled — make `twitter` optional in QueueManager (it's only used for posting, and stockpile/generation work without it)
4. Health monitor: show "twitter: disabled" instead of "twitter: unconfigured"

**Key insight from v1 review:** QueueManager receives `twitter` as non-optional `ITwitterClient`. But `processNextForce()` (used by Telegram `/trigger`) tries to post to Twitter. In telegram-only mode, `/trigger` should generate but NOT post — save to stockpile instead. This is a behavior change worth making.

### Data to sync

| What | Size | How |
|------|------|-----|
| `beef.db` (after cleanup) | ~500 KB | `rsync` (WAL checkpoint first) |
| `characters/beef-bot.json` | 20 KB | Part of code deploy |
| `.env.production` | 500 B | Manual, secrets via `scp` |

Cleanup before sync:
```bash
sqlite3 data/beef.db "DELETE FROM llm_log; DELETE FROM farm_attempts WHERE promoted = 0; VACUUM;"
```

---

## Enhanced Telegram Commands (v2)

### `/roast` — add evaluation passthrough

Current: `evaluationMode` hardcoded to `'none'`. Fix: parse flag from command.

```
/roast hyperliquid              → 3 variants, no eval (same as now)
/roast hyperliquid --eval       → 3 variants, quick eval (1 judge ranks them)
/power hyperliquid              → 5 variants, quick eval (new default for /power)
```

Implementation: parse `--eval` from command text, pass `evaluationMode: 'quick'` to `generateRoasts()`. The plumbing already exists — just never called.

### `/roast` — add mutations

```
/roast hyperliquid --mutate     → 3 variants with 1 mutation each (diversity boost)
```

Implementation: pass `mutationCount: 1` to `generateRoasts()` → `RoastEngine`.

### `/farm` — farm-quality from Telegram (background task)

```
/farm hyperliquid               → 3 strategies x 2 variants, 1 mutation, serious eval
```

**UX flow:**
1. Bot sends "Starting farm-quality generation..." message
2. Fire-and-forget Promise (don't block grammy event loop)
3. Progress updates every 20s via `editMessageText`
4. On completion: show top-ranked variant with evaluation scores
5. Buttons: `[Add to stockpile]` `[GOLD | GOOD | BAD]`
6. Timeout: 10 minutes max (kill provider if exceeded)

**Key difference from v1:** No "Post to Twitter" button in telegram-only mode. Stockpile + rating only. Post button appears when Twitter is enabled.

### "Add to stockpile" button

When user approves a roast from `/roast` or `/farm`:
1. Insert into `roast_stockpile` with `freshnessType: 'evergreen'`, `qualityScore` from eval or manual
2. Mark as `available`
3. Confirm to user: "Added to stockpile (63 available)"

This is the `confirmKeyboard` flow that was started but never finished.

---

## Risk Assessment (revised)

### Actual risks (not just theoretical)

| Risk | Severity | Why it's real | Mitigation |
|------|----------|---------------|------------|
| `SelfEvaluator` fix changes farm promotion rate | Medium | Per-judge FUNNY veto is stricter than majority. Fixing it means fewer vetoes → more promotions. But some of those were legitimate catches | Run farm evaluate on 20 existing attempts before/after. Compare promotion counts. If diff > 20%, investigate |
| Shared `buildCreativeMemory` changes prompt content | Low | Currently: feedback repo returns empty (0 rows). Stockpile has data. Merging means RoastEngine gets stockpile data it didn't have before. Farm gets feedback data it didn't have. But feedback is empty, so only RoastEngine changes | RoastEngine gains stockpile fire examples in prompt. This is an improvement (more context). Verify prompt quality on 3 test generations |
| `/farm` via Telegram takes too long | Medium | 26 LLM calls through Claude Code Agent. Even parallel, 5-10 min is real. User might close chat | Background task design. Result delivered as new message, not edit. Timeout with cleanup |
| Mutations in RoastEngine change default behavior | Zero | mutations=0 by default. Only activated when explicitly requested. No change to existing flow |
| `parseOutput` robustness change in RoastEngine | Low | Adding defensive JSON extraction. If provider already returns structured data, new parser handles it identically. Only different for malformed output (which currently throws) | Run existing tests. Add test for malformed output handling |

### What WON'T regress

- Default `/roast` behavior: same params, same flow, same speed
- Farm pipeline: same BatchGenerator, same orchestration, just fixed FUNNY veto
- QueueManager: same flow, stockpile check still works
- Content filter: unchanged
- Twitter client: unchanged
- Database schema: unchanged

---

## Task Plan (v2)

### Phase 1: Foundation fixes (small, safe, testable)

| # | Task | Lines changed | Risk |
|---|------|--------------|------|
| 1.1 | Fix `SelfEvaluator` FUNNY veto — import `checkHardVetoes` + `checkFunnyConsensusVeto` from `@evaluation/evaluator.js` | ~10 | Low |
| 1.2 | Extract `buildCreativeMemory()` to `roast/creative-memory.ts` — unified builder accepting all optional repos | ~150 (move + merge) | Low |
| 1.3 | Add `mutationCount` param to `RoastEngine.generateRoast()` — optional, default 0 | ~30 | Zero |
| 1.4 | Add robust `parseOutput()` to `RoastEngine` (port from BatchGenerator) | ~25 | Low |
| 1.5 | Wire `BatchGenerator` to use shared `buildCreativeMemory()` | ~20 (delete local, import shared) | Low |
| 1.6 | Wire `generateRoasts()` to use shared `buildCreativeMemory()` + pass `mutationCount` through | ~20 | Low |

### Phase 2: Telegram-only deploy

| # | Task | Lines changed | Risk |
|---|------|--------------|------|
| 2.1 | Add `ENABLE_TWITTER` env var, default `true` | ~5 | Zero |
| 2.2 | Conditional init in `index.ts` — skip Twitter/Mention/Engagement/scheduler jobs when `ENABLE_TWITTER=false` | ~40 | Low |
| 2.3 | Make `twitter` optional in `QueueManager` — if absent, `/trigger` saves to stockpile instead of posting | ~15 | Low |
| 2.4 | Health monitor: report disabled features correctly | ~10 | Zero |
| 2.5 | Create `.env.production.telegram-only` example file | ~15 | Zero |
| 2.6 | DB cleanup + deploy to VPS + verify startup | ops | Medium |

### Phase 3: Enhanced Telegram commands

| # | Task | Lines changed | Risk |
|---|------|--------------|------|
| 3.1 | Parse `--eval` / `--mutate` flags from `/roast` command text | ~20 | Zero |
| 3.2 | Pass `evaluationMode` through to `generateRoasts()` in Telegram handler | ~5 | Zero |
| 3.3 | Default `/power` to `evaluationMode: 'quick'` | ~3 | Zero |
| 3.4 | Show evaluation scores in variant messages when available | ~20 | Zero |
| 3.5 | "Add to stockpile" button + callback handler | ~40 | Low |
| 3.6 | `/farm <target>` command — background generation with progress updates | ~100 | Medium |

### Phase 4: Cleanup (only after phases 1-3 verified)

| # | Task | Lines changed | Risk |
|---|------|--------------|------|
| 4.1 | Delete `guard.middleware.ts` (unused, logic duplicated in bot.ts) | -50 | Zero |
| 4.2 | Delete local `buildCreativeMemory()` from `batch-generator.ts` | -40 | Zero (already replaced in 1.5) |
| 4.3 | Delete local `buildCreativeMemory()` from `roast-generator.ts` | -80 (already replaced in 1.6) | Zero |
| 4.4 | Delete `confirmKeyboard` dead handlers if unused after 3.5 | depends | Low |

### Execution order

```
Phase 1: sequential (1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6)
  Each step: implement → run tests → verify → commit

Phase 2: sequential (2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6)
  2.6 is the actual deploy — gate on manual testing

Phase 3: partial parallel
  3.1 + 3.2 + 3.3 (flag parsing + wiring) → 3.4 + 3.5 (UI changes) → 3.6 (/farm)
  3.6 is the largest single task — scope it carefully

Phase 4: after everything works in production
```

**Total estimate:** ~500 lines changed across ~15 files. Compare to v1's ~1500 lines across ~20 files with a new class hierarchy.

---

## Key Differences: v1 vs v2

| Aspect | v1 (original) | v2 (revised) |
|--------|--------------|--------------|
| Core approach | New `RoastPipeline` class | Extend existing `RoastEngine` |
| Config | `PipelineConfig` (15 params, 5 presets) | 4 params added to existing interfaces |
| `SelfEvaluator` | Delete, use `RoastEvaluator` everywhere | Fix the one-line bug, keep `SelfEvaluator` |
| `BatchGenerator` | Rewrite to use `RoastPipeline` | Keep, share building blocks only |
| CreativeMemory | New `CreativeMemoryBuilder` class | Single function, extracted to own file |
| Lines changed | ~1500 | ~500 |
| Risk of regression | Medium-high (new class, new types, rewired callers) | Low (surgical fixes, same interfaces) |
| Time to deploy | Phase 1 complete (large) → then deploy | Phase 2 can start immediately |
| Quality impact | Same as v2 | Same as v1 (just achieved differently) |

---

## Why v2 achieves the same quality improvements

Every quality improvement from v1 is preserved:

1. **Mutations available everywhere** — `RoastEngine.generateRoast(mutations: 1)` does the same thing as `RoastPipeline.generate({ mutations: 1 })`. Just simpler.

2. **Unified CreativeMemory** — shared function gives all callers access to all data. Same result, no class.

3. **Fixed FUNNY veto** — 5-line fix in `SelfEvaluator` vs deleting it and rewriting farm. Same behavioral fix.

4. **Evaluation in Telegram** — passing `evaluationMode` param through. Same 3-line change in both approaches.

5. **Single codebase to optimize** — building blocks are shared. Improving `buildCreativeMemory()` benefits everyone. Same as v1.

The difference: v2 achieves this through extension, not replacement. Existing tests pass. Existing interfaces preserved. Deploy risk is near-zero.
