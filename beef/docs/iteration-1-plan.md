# Iteration 1: Meta-Audit Fixes

**Date:** 2026-03-21
**Scope:** Critical fixes from meta-audit + evaluation system unification + prompt quality improvements

## Analysis Summary

Meta-audit by 6 parallel expert agents identified 32 issues across 5 tiers. This iteration tackles the highest-impact items that directly improve roast quality and bot security.

### What We're Fixing Now

| # | Issue | Impact | Milestone |
|---|-------|--------|-----------|
| 1 | TELEGRAM_ADMIN_IDS empty — bot open to anyone | Security | M1 |
| 2 | Generate command race condition (farm/index.ts:292-299) | Data integrity | M1 |
| 3 | Weak prompt injection defense | Security | M1 |
| 4 | LLM self-score used for ranking (magic floats) | Quality | M2 |
| 5 | Single-judge veto kills deadpan roasts | Quality | M2 |
| 6 | No forced CoT before generation | Quality | M3 |
| 7 | Strategies (rubric/persona/adversarial) too similar | Quality | M3 |
| 8 | Few-shot examples not from real top roasts | Quality | M3 |

### What Goes to Board (Future)

- Residential proxy (critical before server deploy)
- DB backup cron (critical before production)
- Playwright auto-reconnect reliability
- CI/CD pipeline
- MENTION_POLL_INTERVAL_MS unused in code
- QueueManager test coverage
- Sentry initialization
- Quiet hours enforcement
- Scheduler overlap protection

## Milestones

### M1: Config & Security (quick wins)

**Tasks:**
1. Set `TELEGRAM_ADMIN_IDS=<admin_id_1>,<admin_id_2>` in .env
2. Fix generate race condition — track IDs from first fetch, use for update
3. Add input sanitization for user content before LLM prompts

**Commit after:** typecheck + lint + test pass

### M2: Evaluation System Unification

**Tasks:**
4. Extract shared evaluation module from farm's self-evaluator
5. Integrate into RoastEngine with configurable modes (quick: 1 judge, serious: 5 judges)
6. Fix single-judge FUNNY veto — require majority (2+ judges) for non-safety dimensions

**Key design:**
- `src/evaluation/` — new shared module
- `EvaluationMode = 'quick' | 'serious'`
- Quick: 1 judge (deflation_hawk — harshest), weighted composite
- Serious: all 5 judges, averaged weighted composite
- Farm continues using serious mode
- RoastEngine defaults to quick mode

**Commit after:** typecheck + lint + test pass

### M3: Prompt Quality

**Tasks:**
7. Add forced CoT step: identify embarrassing fact → choose technique → draft punchline first
8. Differentiate strategies: rubric=full analytical, persona=stripped immersive, adversarial=competitive
9. Replace 4 weakest examples in beef-bot.json with top-rated from DB

**Few-shot analysis:**
- Random selection preserves serendipity (cross-angle inspiration) — keeping this mechanism
- Improvement: swap 4 weakest static examples for proven top performers
- DB candidates (score 4.1-4.2): Lombard, Tether, Dego Finance, DOGE

**Strategy differentiation plan:**
- Rubric: keeps all helper blocks (techniques, banned phrases, emotional range, signature moves, checkpoint)
- Persona: strips helper blocks, relies on character voice + examples + origin story only
- Adversarial: strips helper blocks, keeps slop template + contrastive instruction only

**Commit after:** typecheck + lint + test pass

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Keep random few-shot selection | Serendipity > strict matching. Cross-angle examples inspire creative combinations |
| Quick mode = deflation_hawk only | Harshest single judge gives most signal per token spent |
| FUNNY veto → majority-based | Structure J (deadpan) intentionally scores low on FUNNY but is valid comedy |
| FACTUAL veto stays single-judge | Safety-critical — one judge flagging invented claims is enough to discard |
| Local-first workflow | No server deploy until proxy + DB backup are ready |
