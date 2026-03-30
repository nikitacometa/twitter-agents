# $BEEF Task Board

## Format

`[STATUS] #ID — Description`

Status: `[ ]` pending, `[~]` in progress, `[x]` done, `[!]` blocked

---

## Current Iteration (I1)

[x] #I1-1 — Set TELEGRAM_ADMIN_IDS (<admin_id_1>, <admin_id_2>)
[x] #I1-2 — Fix generate command race condition
[x] #I1-3 — Prompt injection input sanitization (targetName added to all 6 builders 2026-03-23)
[x] #I1-4 — Extract shared evaluation module
[x] #I1-5 — Integrate evaluation into RoastEngine (quick/serious modes)
[x] #I1-6 — Fix single-judge FUNNY veto (majority-based)
[x] #I1-7 — Add forced CoT to prompt strategies
[x] #I1-8 — Differentiate rubric/persona/adversarial strategies
[x] #I1-9 — Replace 4 few-shot examples with top-rated from DB

---

## Backlog: Pre-Server-Deploy (critical)

[x] #B-1 — ISP proxy setup: Decodo static residential (3 IPs: SG×2 + HK×1), PROXY_URL validated in env schema, HybridTwitterClient wired in index.ts. Shipped 2026-03-29
[ ] #B-2 — DB backup cron on VPS
[x] #B-3 — Replace auto re-login with Telegram alert on cookie expiry
[ ] #B-4 — Circuit breaker for Error 226 (3x/1h → disable 6h → Telegram alert)

## Backlog: Infrastructure

[ ] #B-5 — CI/CD pipeline (GitHub Actions: typecheck + lint + test)
[ ] #B-6 — Sentry initialization in production entry point
[ ] #B-7 — PM2 log rotation config (max_size 50M, retain 7)
[ ] #B-8 — Deploy rollback mechanism in deploy.sh
[ ] #B-9 — UptimeRobot/BetterUptime on /health endpoint
[ ] #B-10 — QueueManager test coverage (processNext, approve, casual replies)
[ ] #B-11 — Scheduler overlap protection (dedup guard)
[ ] #B-12 — Fix farm/logger.ts — add production env guard for pino-pretty
[ ] #B-13 — Replace console.warn in retryWithBackoff with pino logger

## Backlog: Content Quality

[x] #B-14 — Split getRandomExamples into roast vs reply pools (casualReplies leaked into roast prompts)
[!] #B-15 — HIGH PRIORITY: Curate 10 few-shot examples for 5 empty angles (DATA_BOMB, TIMELINE, COMPARISON, RHETORICAL, RULE_OF_THREE) — blocked on human feedback revision first
[ ] #B-16 — Overused CT phrases pass prefilter (expand banned patterns)
[ ] #B-17 — Missing examples for sentence structures J/K
[ ] #B-18 — No temporal calibration (dates in roasts become stale)
[ ] #B-19 — Max 2 sentences too rigid (allow 3 for audit trail structure I)
[ ] #B-20 — Enable Perplexity enrichment by default in TargetDiscoverer

## Backlog: Migration

[ ] #B-42 — Full migration from Twitter Scraper to API v2: remove ScraperTwitterClient, CookieStore, CycleTLS, `@the-convocation/twitter-scraper` dep. Switch TWITTER_CLIENT_MODE default to 'api'. Update TwitterEnricher to API-only. Update Farm CLI to use API. Remove scraper env vars (TWITTER_PASSWORD, TWITTER_2FA_SECRET, TWITTER_PHONE). Clean up index.ts initialization. Pay-per-use API — no rate limit concerns. See `docs/scraper-to-api-migration.md` for full analysis

## Backlog: Growth

[ ] #B-21 — Runtime scraper→API fallback on Error 226
[ ] #B-22 — Close learning loop: high-engagement roasts → auto-add to fire examples
[ ] #B-23 — Inline rating buttons (1-5) in Telegram after farm/unrated output
[ ] #B-24 — Auto-notify admins on autonomous posts (approve mode OFF)
[ ] #B-25 — Stockpile low alert (available < 5 → Telegram notification)
[ ] #B-26 — Farcaster cross-posting backup channel
[ ] #B-43 — Monitor Phase 2: keyword search batches alongside from: queries for Base ecosystem discovery (see docs/base-ecosystem-expansion.md)
[ ] #B-27 — Claude Code skills: /pre-launch-checklist, /deploy-verify, /roast-quality-check

## Backlog: Autonomy

[x] #B-44 — Reply-guy pipeline: fire-and-forget from monitor, hard filter + LLM eval + lightning roast, dry-run mode, 6 new files + migration 018. Deployed 2026-03-29
[x] #B-46 — /roast_max command: 3 parallel pipelines (Opus+Sonnet+R+Sonnet) → cross-pipeline dedup → rankBatch → serious eval → top 3. prepareTweetContext extracted, variant count 10 for all pipelines. Shipped 2026-03-30
[ ] #B-45 — Reply-guy live mode: switch REPLY_GUY_DRY_RUN=false, reduce cap to 20, raise min roastability to 7, verify Playwright posting
[ ] #B-33 — Auto-farm cron: every 6h farm top 3-5 targets from timeline monitor, dedup 48h, stockpile low alert
[ ] #B-34 — Auto-post from stockpile: every 3h post best entry (humanScore ≥ 4, buffer ≥ 5), max 3/day, notify after
[ ] #B-35 — Smart reply autonomy: stratify by follower count (<1K auto, 1-10K auto if eval ≥ 4.0, >10K require approval)
[ ] #B-36 — Closed learning loop: high-engagement → auto few-shot, low-engagement → negative examples, weekly report
[x] #B-37 — OpenClaw integration: beef user on VPS, 8 skills (4 read + 4 write), POST API endpoints with auth, @BeefAdminBot on port 19001. Shipped 2026-03-27
[x] #B-38 — OpenClaw voice message support: Whisper STT, echoTranscript, OpenAI API key. Shipped 2026-03-27
[x] #B-39 — OpenClaw Twitter API skills: twitter-search, twitter-user, twitter-tweet, twitter-timeline (bearer token, read-only). Shipped 2026-03-27
[x] #B-40 — OpenClaw model switch: Anthropic → OpenAI GPT-5.4 (primary), Anthropic Sonnet (fallback). 2026-03-27
[x] #B-41 — OpenClaw personality tuning: degen voice from beef-bot.json DNA, lowercase, sarcasm, CT slang, мат. 2026-03-28

## Backlog: Visuals (high priority)

[ ] #B-28 — Integrate card system into posting pipeline: generate roast card for every posted roast, attach as media. Requires `postTweetWithMedia(text, imagePath)` in ITwitterClient + both implementations (Official API: v1.uploadMedia → v2.tweet with media_ids; Scraper: GraphQL media upload). Card generator lives in `beef-web/src/cards/generator.ts`, integration guide: `beef-web/docs/card-integration-guide.md`
[ ] #B-29 — Periodic stats cards: weekly cron posts stats-overview card (totalRoasts, avgQuality, projectsAudited, topTargets from roasts table) and leaderboard card (top 10 most roasted). Standalone tweets, not replies
[ ] #B-30 — Milestone detection: after successful post, check if totalPosted hits round numbers (100, 250, 500, 1000...) → generate number-card and post celebration tweet
[ ] #B-31 — Data cards in farm pipeline: when enricher returns numeric data points about a target, generate stat-duo (2 numbers) or stat-quad (4 numbers) alongside the roast text, save card buffer to stockpile for later posting
[ ] #B-32 — Telegram card preview: in admin bot approval flow, render roast card and send as photo alongside the text preview, so admins see exactly what will be posted
