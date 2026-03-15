# Twitter Agents — Task Board

> Last updated: 2026-03-16 (Milestone 1 core implementation started)

## Conventions
- **ID format**: `TA-NNN` (sequential, never reuse)
- **Statuses**: `todo` | `in_progress` | `blocked` | `done`
- **Priorities**: `critical` | `high` | `medium` | `low`
- Next available ID: **TA-056**

---

## Milestone 1: Core + Agent Pipeline (MVP)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-015 | Define bot personality — single degen roaster character | todo | critical | Name, voice, style, topics, knowledge base |
| TA-016 | Create character config (system prompt + examples) | todo | critical | Depends on TA-015. JSON with Zod validation |
| TA-032 | Shared types + interfaces | done | critical | `common/types/index.ts` — all domain types |
| TA-033 | SQLite setup + migrations (001 + 002) | done | critical | `storage/database.ts`, 10 tables + 2 FTS5 + FTS triggers |
| TA-047 | LLM Provider layer (CLI + SDK fallback) | done | critical | `agent/` — LLMProvider, ClaudeCodeProvider, AnthropicSDKProvider, ProviderManager |
| TA-048 | Agent prompt templates (roast, verify, discover) | todo | critical | `agent/prompts/*` — task-specific prompt builders |
| TA-034 | All repositories (roast, mention, queue, target, llm_log, user, tweet) | done | high | 7 repositories with prepared statements, FTS search |
| TA-035 | Character loader + validator | todo | high | `roast/character.loader.ts` — JSON with Zod validation |
| TA-020 | Roast engine (orchestrates agent) | todo | high | 5 variants via Claude Code Agent, agent does scoring + fact-check |
| TA-023 | Content filter (regex, no LLM) | todo | high | TOS compliance, banned words, length check — defense in depth |
| TA-019 | Twitter client + rate limiter | todo | high | twitter-api-v2 Basic tier, Token Bucket rate limiter as separate class |
| TA-036 | Bootstrap + wiring | todo | high | `bootstrap.ts` — dependency wiring, `index.ts` — entry + shutdown |
| TA-021 | Test roast quality — 50+ generated roasts via agent | todo | high | If not funny after tuning — pivot character or kill |
| TA-037 | Unit tests for Milestone 1 | todo | high | >80% coverage. Mock `execFile` for agent tests |

## Milestone 2: Scheduling + Mentions

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-038 | Human-like jitter module | todo | high | `scheduler/jitter.ts` — quiet hours, bursts, distraction delays |
| TA-049 | Scheduler with all job types | todo | high | `scheduler/scheduler.ts` — 11 job types, human-like timing |
| TA-039 | Mention polling + parser | todo | high | `twitter/mention.parser.ts` — detect roast requests |
| TA-040 | Queue manager | todo | high | `queue/queue.manager.ts` — priority queue with SQLite |
| TA-050 | Reply prompt template | todo | high | `agent/prompts/craft-reply.ts` — mention replies + reply-guy |
| TA-051 | Target discovery prompt + selector | todo | high | `agent/prompts/discover-targets.ts` + `roast/target.selector.ts` |
| TA-022 | News monitor — RSS + DexScreener | todo | medium | `news/sources/` — autonomous target discovery |
| TA-042 | Graceful shutdown (with agent kill) | todo | medium | SIGTERM/SIGINT + kill Claude Code subprocesses |
| TA-043 | Integration tests | todo | medium | Pipeline tests with in-memory SQLite, mocked agent |

## Milestone 3: Telegram Admin + Health

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-044 | Telegram admin bot | todo | high | /status, /pause, /resume, /roast, /queue, /stats, /approve |
| TA-045 | Health monitor + alerting | todo | medium | Periodic checks + Claude Code CLI health check |
| TA-046 | Metrics collector | todo | medium | In-memory counters for daily stats |

## Milestone 4: Reply-Guy + Learning

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-052 | Reply-guy scheduler job | todo | high | Every 2.5h ±50% jitter, agent researches + replies |
| TA-053 | Engagement tracker | todo | high | `learning/engagement.tracker.ts` — time-series snapshots |
| TA-054 | Learning module | todo | high | `learning/learning.module.ts` — analyze what works |
| TA-055 | Agent prompts: quality audit + character tuning + content strategy | todo | high | Daily audit, weekly tuning, daily planning |
| TA-017 | Choose Twitter handle for the bot | todo | high | Must be available, memorable, roast-themed |
| TA-029 | Deploy bot to Hostinger VPS with PM2 | todo | medium | pnpm, MCP config, .env, Sentry, residential proxy |
| TA-030 | Seed first 20 roasts with friends/KOLs | todo | medium | Cold start, first 3 days in moderation mode |

## Backlog (Phase 2+)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-024 | Set up Snapshot.org space for challenge voting | todo | medium | Off-chain, gasless, token-weighted |
| TA-025 | Token launch via Bankr | todo | medium | After 200+ followers and 20+ public roasts |
| TA-026 | Implement burn-to-roast request flow | todo | medium | User burns $BEEF → bot queues target |
| TA-027 | Set up Farcaster integration via Neynar | todo | medium | Secondary channel, no bot restrictions |
| TA-028 | Set up DexScreener + CoinGecko token monitoring | todo | low | Price/volume alerts after token launch |
| TA-031 | Implement challenge/accountability flow | todo | low | Snapshot vote + treasury reward |

## Done

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-001 | Define bot personas — contrasting personality pair | done | critical | Pivoted: single roast bot, not PVP |
| TA-002 | Design character.json files for both bots | done | critical | Pivoted: single bot character config |
| TA-003 | Choose final ticker ($BEEF vs alternatives) | done | high | $BEEF confirmed |
| TA-004 | Choose Twitter handles for both bots | done | high | Pivoted: single bot handle needed |
| TA-005 | Technology stack research and decisions | done | high | Custom TypeScript over ElizaOS. See docs/stack-research.md |
| TA-018 | Initialize TypeScript project — custom stack | done | high | Scaffold: tsconfig, eslint, vitest, husky, env validation |
| TA-032 | Shared types + interfaces | done | critical | `common/types/index.ts` — all domain types |
| TA-033 | SQLite setup + migrations (001 + 002) | done | critical | `storage/database.ts`, 10 tables + 2 FTS5 + FTS triggers |
| TA-034 | All repositories | done | high | 7 repositories: roast, mention, queue, target, llm_log, user, config |
| TA-047 | LLM Provider layer (CLI + SDK fallback) | done | critical | LLMProvider interface, ClaudeCode/SDK providers, ProviderManager, 31 tests |
