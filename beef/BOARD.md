# $BEEF Task Board

## Format

`[STATUS] #ID — Description`

Status: `[ ]` pending, `[~]` in progress, `[x]` done, `[!]` blocked

---

## Current Iteration (I1)

[x] #I1-1 — Set TELEGRAM_ADMIN_IDS (<admin_id_1>, <admin_id_2>)
[ ] #I1-2 — Fix generate command race condition
[ ] #I1-3 — Prompt injection input sanitization
[ ] #I1-4 — Extract shared evaluation module
[ ] #I1-5 — Integrate evaluation into RoastEngine (quick/serious modes)
[ ] #I1-6 — Fix single-judge FUNNY veto (majority-based)
[ ] #I1-7 — Add forced CoT to prompt strategies
[ ] #I1-8 — Differentiate rubric/persona/adversarial strategies
[ ] #I1-9 — Replace 4 few-shot examples with top-rated from DB

---

## Backlog: Pre-Server-Deploy (critical)

[ ] #B-1 — Residential proxy setup (datacenter IP = instant flag)
[ ] #B-2 — DB backup cron on VPS
[ ] #B-3 — Playwright posting auto-reconnect reliability

## Backlog: Infrastructure

[ ] #B-4 — CI/CD pipeline (GitHub Actions: typecheck + lint + test)
[ ] #B-5 — Sentry initialization in production entry point
[ ] #B-6 — MENTION_POLL_INTERVAL_MS not used in scheduler code
[ ] #B-7 — QueueManager test coverage
[ ] #B-8 — Scheduler overlap protection (dedup guard)
[ ] #B-9 — Quiet hours enforcement in scheduler
[ ] #B-10 — Health monitor active checks (not just passive)

## Backlog: Content Quality

[ ] #B-11 — Overused CT phrases pass prefilter (expand banned patterns)
[ ] #B-12 — Missing examples for sentence structures J/K
[ ] #B-13 — No temporal calibration (dates in roasts become stale)
[ ] #B-14 — Max 2 sentences too rigid (allow 3 for audit trail structure I)

## Backlog: Growth

[ ] #B-15 — Farcaster cross-posting backup channel
[ ] #B-16 — Claude Code skills: /pre-launch-checklist, /deploy-verify, /roast-quality-check
