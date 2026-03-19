# Twitter Agents — Task Board

> Last updated: 2026-03-19 (v6: scraper posting, config flags, board audit)

## Conventions
- **ID format**: `TA-NNN` (sequential, never reuse)
- **Statuses**: `todo` | `in_progress` | `blocked` | `done`
- **Priorities**: `critical` | `high` | `medium` | `low`
- Next available ID: **TA-105**

---

## Milestone 1: Bot Core Engine (MVP)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-015 | Define bot personality | done | critical | Character design: origin story, 7 traits, emotional range, self-mythology, 25 examples |
| TA-016 | Create character config (JSON + Zod) | done | critical | `characters/beef-bot.json` v1.0.0 |
| TA-048 | Craft-roast prompt template | done | critical | 3 variants + research/reply/iteration prompts |
| TA-020 | Roast engine (orchestrates agent) | done | critical | loadCharacter → buildPrompt → provider.run() → contentFilter → rank → best |
| TA-023 | Content filter (regex, no LLM) | done | critical | 14 tests |
| TA-059 | Fix extractJsonFromOutput greedy regex | done | high | Balanced brace parser |
| TA-035 | Character loader + validator | done | high | Zod schema, 6 tests |

## Milestone 2: Twitter Integration

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-061 | Create bot accounts + credentials | done | critical | @euphoriaai_ account, X Premium, 2FA |
| TA-019 | Twitter client (dual-mode) | done | critical | `ITwitterClient` interface, `TwitterClient` (API) + `ScraperTwitterClient` (cookie auth) |
| TA-084 | Cookie session manager | done | critical | `cookie-store.ts` — save/load cookies, auto-relogin |
| TA-101 | Scraper GraphQL posting (CreateTweet) | done | critical | `postTweet` + `replyToTweet` via GraphQL mutation, `retryWithBackoff`, DRY_RUN support |
| TA-102 | Autonomous/reply config flags | done | critical | `ENABLE_AUTONOMOUS_POSTING`, `ENABLE_MENTION_REPLIES` env vars, queue-level gating |
| TA-086 | Env validation — all Twitter vars | done | high | Scraper credentials, client mode, posting flags |
| TA-039 | Mention polling + classifier | done | high | `mention-handler.ts` — notifications endpoint, keyword classification, parent tweet enrichment |
| TA-083 | Rate limiter for scraper posting | todo | high | Token bucket, daily reply cap (~50/day), anti-spam jitter |
| TA-085 | ISP residential proxy | todo | medium | SOCKS5 for scraper — currently running without proxy (local IP ok, datacenter risky) |

## Milestone 3: Telegram Command Center

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-087 | grammY setup | done | critical | grammy 1.41.1 |
| TA-071 | Telegram admin bot — core + RLHF flow | done | critical | /roast, /power, /stats, /status + text eval + rating buttons |
| TA-088 | Telegram management commands | done | high | /status, /stats, /queue, /trigger, /poll, /pause, /resume, /example, /analyze, /evolution |
| TA-103 | /poll command for manual mention check | done | high | Bypasses cron — instant mention fetch for testing |
| TA-089 | Telegram notifications system | todo | high | Push alerts: errors, rate limits, high engagement, daily digest |
| TA-044 | Telegram bot extended features | todo | medium | /approve (moderation mode), inline keyboards |

## Milestone 4: Scheduler + Queue + Wiring

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-038 | Human-like jitter module | done | high | `scheduler.ts` — quiet hours (2-7 UTC), jittered delays |
| TA-049 | Scheduler with all job types | done | high | cron jobs: queue-processor (20min), mention-poller (10min), engagement-tracker (1h) |
| TA-040 | Queue manager | done | high | Priority dequeue, posting mode gating, force-process bypasses flags |
| TA-036 | Bootstrap + wiring (index.ts) | done | high | Full DI, all services wired |
| TA-042 | Graceful shutdown | done | medium | SIGTERM/SIGINT → stop scheduler → drain queue → close DB |

## Milestone 5: Deploy to VPS

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-090 | Install pnpm + PM2 on VPS | done | critical | PM2 6.0.14, pnpm via npm-global |
| TA-091 | Install Claude Code CLI on VPS | done | critical | Node 22.22.1 |
| TA-092 | PM2 ecosystem config | done | high | tsx runtime, 2G memory limit |
| TA-029 | Deploy bot to Hostinger VPS | done | high | PM2 + tsx, 59MB RAM |
| TA-093 | Deploy scripts | done | high | `deploy.sh` + `sync.sh` + `setup-vps.sh` |
| TA-094 | Sentry error tracking | todo | medium | Create project on sentry.io |

## Milestone 6: Testing

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-037 | Unit tests for critical path | in_progress | critical | 73 tests passing (content-filter, provider-manager, character-loader, repos). Missing: twitter-client, queue-manager |
| TA-043 | Integration test — full pipeline | todo | high | In-memory SQLite + mocked provider + mocked twitter → queue → roast → post |
| TA-021 | DRY_RUN roast quality test | todo | high | 10-15 roasts with real LLM, review quality |
| TA-095 | Smoke test script for deploy | todo | medium | PM2 status + health endpoint + last log lines |

## Milestone 7: Blockchain Integration (post-token)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-025 | Token launch via Bankr | todo | critical | BOT launches. Bot must have 5-10 live posts first |
| TA-067 | Register $BEEF in ERC-8004 Identity Registry | todo | critical | On-chain tx on Base |
| TA-068 | ERC-8004 announcement tweet thread | todo | critical | |
| TA-096 | Base chain client setup (viem) | todo | high | `src/chain/client.ts` |
| TA-026 | Burn detection + roast request flow | todo | high | Alchemy webhooks watching Transfer(to=0x...dead) |
| TA-024 | Snapshot.org space for challenge voting | todo | medium | Off-chain, gasless, token-weighted |
| TA-069 | Apply to Bankr tokenized-agents registry | todo | medium | |

## Milestone 8: Visual Content + Scale

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-053 | Engagement tracker | done | medium | `learning/engagement-tracker.ts` — hourly cron, tracks metrics for recent roasts |
| TA-064 | Roast scorecard HTML template | todo | high | Dark theme, fire accents, image per roast for virality |
| TA-051 | Target discovery prompt + selector | todo | high | Agent-driven autonomous target finding |
| TA-022 | News monitor — RSS + DexScreener | todo | medium | Autonomous target discovery |
| TA-054 | Learning module | todo | medium | Analyze what works, feedback loop |
| TA-077 | Dynamic avatar system | todo | medium | Change avatar weekly |

## Marketing + Launch Tasks

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-056 | Blind test 20 roasts with real people | in_progress | critical | 20 generated, persona panel: 4 FIRE / 6 POST / 0 REJECT. Need human validation |
| TA-062 | Prepare token launch assets | todo | critical | Pre-write launch thread, KOL coordination |
| TA-065 | OpenAI Roast Campaign — day 1 content | todo | high | First 5 roasts targeting OpenAI narrative |
| TA-066 | "Reply with a ticker" interactive thread | todo | high | Free roast scorecards |
| TA-074 | Find Jesse Pollak "roast me" tweet | todo | high | Reply for RT potential |
| TA-075 | Collect reference roast tweets (Voronin) | todo | high | |
| TA-030 | Seed roasts with friends/KOLs | todo | high | Co-founder RTs best roasts |
| TA-070 | First burn-to-roast demo (own funds) | todo | high | After token launch |
| TA-060 | Reach viral metric: >300 RT or QT from >10K account | todo | high | Growth KPI |

## Backlog

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-104 | Mention reply prioritization by follower count/engagement | todo | medium | When mentions > daily capacity, prioritize high-follower accounts and roast-keyword mentions over bare @mentions |
| TA-052 | Reply-guy scheduler job | todo | medium | Every 2.5h ±50% jitter, agent researches trending tweets + replies |
| TA-055 | Agent prompts: quality audit + character tuning | todo | medium | Daily audit, weekly tuning |
| TA-028 | DexScreener + CoinGecko token monitoring | todo | low | Price/volume alerts after token launch |
| TA-031 | Challenge/accountability flow | todo | low | ERC-8004 Validation Registry + Snapshot vote |
| TA-046 | Metrics collector | todo | low | In-memory counters for daily stats |

## Done (archived)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| TA-001 | Define bot personas | done | Pivoted: single roast bot, not PVP |
| TA-002 | Design character.json files | done | Single bot character config |
| TA-003 | Choose final ticker | done | $BEEF confirmed |
| TA-004 | Choose Twitter handles | done | @euphoriaai_ |
| TA-005 | Technology stack research | done | Custom TypeScript over ElizaOS |
| TA-018 | Initialize TypeScript project | done | tsconfig, eslint, vitest, husky |
| TA-032 | Shared types + interfaces | done | `common/types/index.ts` |
| TA-033 | SQLite setup + migrations | done | 10 tables + 2 FTS5 |
| TA-034 | All repositories | done | 7+ repositories |
| TA-047 | LLM Provider layer | done | ClaudeCode/SDK providers, ProviderManager, 31 tests |
| TA-063 | Technical launch plan | done | `docs/technical-launch-plan.md` |
| TA-098 | Multidimensional Evaluation Framework | done | 3-layer pipeline |
| TA-099 | CT audience personas | done | 6 detailed personas |
| TA-100 | Research: CT roast culture | done | |
