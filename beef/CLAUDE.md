# $BEEF — AI Crypto Roast Bot

Autonomous AI agent that finds crypto projects, researches them live, and roasts them on Twitter as [@0xBeefer](https://twitter.com/0xBeefer). Node orchestrator + Claude Code agent subprocess, gated by a 5-judge LLM evaluation panel.

**Status: paused (June 2026).** It ran ~March–June 2026; its own engagement telemetry showed more posting made performance worse, so it was stopped rather than scaled. The code is maintained as a portfolio artifact — see the [root README](../README.md).

**No token was ever launched and there is no financial mechanism.** Earlier design docs in `docs/` describe burn-to-request and challenge-staking mechanics that were never built; they are kept as historical planning records, not as descriptions of the system. If a doc contradicts this file or the root README, this file wins.

## How It Works

```
1. Trigger: scheduler, mention poll, timeline monitor, or an admin Telegram command
2. Enrich: fetch target profile / parent tweet / on-chain + market context
3. Research + generate: Claude Code agent subprocess (Perplexity MCP, WebSearch, curl)
4. Filter: regex content filter + prompt-injection sanitizer (no LLM call)
5. Evaluate: 5-judge panel scores 8 dimensions → weighted composite + vetoes
6. Post: reply or original tweet — or hold for human approval in Telegram
7. Learn: engagement metrics + human feedback reshape the prompt
```

The gate **fails closed**: if every variant is vetoed, nothing is posted. If fewer than `MIN_JUDGE_QUORUM` (3) judges respond, the evaluator refuses to score rather than ruling by one surviving judge.

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | Custom TypeScript | ElizaOS Twitter plugin had active bugs (#5172, #4921). Custom = stable, debuggable |
| **LLM** | Claude Code CLI subprocess (primary) | Max subscription instead of metered API. Agent has MCP tools + multi-turn reasoning |
| **LLM fallback** | Codex CLI → Anthropic SDK | 3-tier chain behind a circuit breaker (`agent/provider-manager.ts`) |
| **Twitter** | `twitter-api-v2` (reads/writes) + Playwright (writes the API rejects) | Runtime-selected via `TWITTER_CLIENT_MODE`; hybrid mode needs a residential proxy |
| **Research** | Perplexity MCP + WebSearch (via the agent) | Controversies, team history, live data |
| **Retrieval** | SQLite FTS5 (lexical) + [`retrieval-service`](../retrieval-service/) (semantic) | Optional Python service; dedup degrades to FTS5 when it is down |
| **Storage** | `better-sqlite3` (WAL), 28 tables + 3 FTS5 virtual tables | Hand-rolled migration runner in `storage/database.ts` |
| **Chain data** | `viem` (Base) + CoinGecko / DexScreener / DefiLlama via agent `curl` | Base is the ecosystem the bot targets |
| **Admin** | `grammy` Telegram bot — 34 commands | Approval gate, farm/meme/news pipelines, feedback collection |
| **Process** | PM2 + `cron` | Auto-restart, log aggregation |
| **Alerts** | Telegram | Provider degradation, posting circuit breaker, health |

## Project Structure

```
beef/
├── CLAUDE.md              # This file — project instructions
├── characters/            # Bot personality definition (beef-bot.json)
├── docs/                  # Research, strategy, audits, metrics reports (many are historical)
├── scripts/               # Deploy, sync, backfill, one-off probes
└── src/
    ├── agent/             # ★ LLM providers + ProviderManager (3-tier fallback, circuit breaker)
    ├── roast/             # Prompt builder, roast engine, creative memory
    ├── evaluation/        # 5-judge panel, weighted composite, vetoes, pre-filter
    ├── farm/              # Offline batch generation + blind human review
    ├── twitter/           # API / scraper / Playwright / hybrid clients + mention handler
    ├── reply-guy/         # Proactive reply pipeline
    ├── monitor/ news/     # Timeline monitor + news-thread pipelines
    ├── meme/              # Meme generation (Imgflip + vision eval)
    ├── retrieval/         # Client for the optional semantic retrieval service
    ├── content/           # Regex content filter + prompt-injection sanitizer
    ├── queue/             # Priority queue (SQLite) + processing orchestration
    ├── scheduler/         # Human-like jitter, quiet hours
    ├── storage/           # SQLite + migrations + repositories
    ├── learning/          # Engagement tracking + feedback loop
    ├── metrics/           # Performance tracking, shadowban detection, API budget
    ├── admin/             # Telegram admin bot
    ├── activity/ api/     # Activity feed (web app diary) + local HTTP API
    ├── health/            # Health monitor
    └── index.ts           # Composition root + graceful shutdown
```

## Architecture

Node orchestrator stays a thin, boring, testable layer (scheduling, persistence, rate limits, Twitter I/O); all intelligence lives in the Claude Code agent subprocess it shells out to. That boundary is the design principle — it lets the "brain" be swapped without touching the machinery. See `docs/architecture.md`.

## Development Workflow

```bash
pnpm install
pnpm dev                  # watch mode
DRY_RUN=true pnpm dev     # full pipeline, nothing posted
pnpm test                 # vitest
pnpm typecheck            # tsc --noEmit
pnpm lint                 # eslint --fix
pnpm farm                 # offline batch generation
pnpm metrics              # pull & analyze Twitter performance
```

The optional retrieval service lives in [`../retrieval-service`](../retrieval-service/) and has its own toolchain (`uv`, `ruff`, `mypy --strict`, `pytest`).

## TypeScript Conventions

**Strict mode is non-negotiable.** `tsconfig.json` has `strict: true` + `noUncheckedIndexedAccess` + `noImplicitReturns` + `noUnusedLocals` + `noUnusedParameters`. Do not loosen.

**ESLint critical rules:**
- `no-floating-promises: error` — every promise must be awaited or explicitly voided
- `require-await: error` — don't mark functions async if they don't await
- `consistent-type-imports: error` — use `import type { Foo }` for type-only imports
- `no-explicit-any: warn` — prefer `unknown` + type guards over `any`

**Error handling:**
- Use `getErrorMessage(error: unknown)` from `@common/utils/error.util.ts` — never inline `instanceof Error` checks
- Use `retryWithBackoff()` for API calls — exponential backoff with jitter
- Every try/catch must log with context (`logger.error({ err, context }, 'message')`)
- Never swallow errors in catch blocks

**Environment:**
- All env vars validated at startup via Zod (`src/common/config/env.validation.ts`)
- Cross-field validation via `superRefine` (production requires the Telegram token; hybrid mode requires proxy + Chrome profile)
- Access config through the validated `AppConfig` type, never raw `process.env`
- New env vars must be added to `.env.example` **and** both `.env.test` / `.env.production` on the server

**Imports:**
- Use path aliases: `@common/*`, `@twitter/*`, `@roast/*`, `@agent/*`, `@storage/*`, `@evaluation/*`, `@farm/*`
- ESM: use the `.js` extension in relative imports (`import { foo } from './bar.js'`)

**Logging:**
- Use the `pino` logger from `@common/utils/logger.ts` — never `console.log` in production code (CLI entry points excepted)
- Structured logging: `logger.info({ key: value }, 'message')` — object first, message second

**Testing:**
- Vitest (not Jest) — ESM-native, faster
- Test files: `*.spec.ts` next to source
- `clearMocks: true` — auto-reset between tests
- For every `mockResolvedValue`, add a sibling `mockRejectedValue` test
- Use `it.each()` for parameterized tests

**Pre-commit checklist:**
1. `pnpm typecheck` — zero errors
2. `pnpm lint:check` — zero errors
3. `pnpm test` — all pass
4. No `console.log` in production code
5. No hardcoded secrets, real IPs, hostnames, or personal identifiers (this repo is public)
6. No `any` without an explicit justification comment
7. Tweet length ≤ 280 chars enforced in generation

## Twitter Constraints

**Critical rules — violating any risks the account:**
- **Reply-only** for interactions with other accounts. Never initiate threads tagging others
- **Bot label** in profile — mandatory for automated accounts
- **2-5 proactive posts/day** (original roasts, NOT replies). Volume hurts: +142% posting measured −62% engagement rate
- **Randomized timing** — fixed intervals trigger spam detection (`scheduler/scheduler.ts`)
- **No ticker spam** — repeated `$BEEF $BEEF` patterns get flagged
- **X Premium** — posts get near-zero reach without it

**Browser automation rules:**
- **Cookie reuse** — log in once, save cookies, never re-login (repeated logins trigger security alerts)
- **Verify cookie ownership** — the `twid` field encodes the user ID; always confirm it matches the target account before importing
- **No datacenter IPs** — residential/ISP proxy required; datacenter ASNs are blocked before reaching Twitter
- **One account = one IP** — never rotate proxies within a logged-in session
- **Error 226** = anti-automation block: reads work, writes don't. Trips the posting circuit breaker immediately

## Bot Personality

**$BEEF** — a forensic-accountant AI turned crypto roaster. Savage, factual, meme-fluent.

**Core traits:**
- Savage but factual — every roast references real data (revenue, TVL, price action, team history)
- Degen voice — lowercase, CT slang, no corporate tone
- Self-aware — knows it's an AI, jokes about it, never pretends to be human
- Equal opportunity — roasts blue chips and shitcoins alike
- Short and lethal — ≤280 chars, single tweet, no threads. 80–150 chars measured best (~4.3% ER vs 0.35% for 200+)

**Anti-patterns:**
- No generic insults ("you're dumb") — always specific ("your TVL dropped 94% and you're tweeting about partnerships")
- Roast KOLs, founders, VCs — people with power and a platform. **Never punch down** at retail who got rekt
- No doxxing, slurs, threats, brigading
- No financial advice, even sarcastically

Roast quality patterns are calibrated against real human review data — see `docs/feedback-analysis-2026-03-26.md` and `docs/human-review-analysis-s1.md`. Weights and pre-filter categories in `evaluation/evaluator.ts` carry inline comments citing the human score that justified each one; don't change them without new data.

## Commit Discipline

- Start with a lowercase verb: `add`, `fix`, `implement`, `update`, `remove`, `refactor`
- Single concise line, no bullet lists
- No AI attribution or co-authorship lines
- Never use `--no-verify` — let the pre-commit hook run
- The repo is public: never commit secrets, real IPs, server hostnames, or personal identifiers
