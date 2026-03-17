# Twitter Agents — Task Board

> Last updated: 2026-03-17 (v5.3: technical launch plan, milestones 1-8, anti-detection, Telegram command center)

## Conventions
- **ID format**: `TA-NNN` (sequential, never reuse)
- **Statuses**: `todo` | `in_progress` | `blocked` | `done`
- **Priorities**: `critical` | `high` | `medium` | `low`
- Next available ID: **TA-101**

---

## Milestone 1: Bot Core Engine (MVP)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-015 | Define bot personality — forensic accounting AI, deprecated auditor | done | critical | Character design: origin story, 7 traits, emotional range, self-mythology, 25 examples. See `docs/character-design.md` |
| TA-016 | Create character config (JSON + Zod validation) | done | critical | `characters/beef-bot.json` v1.0.0 — full systemPrompt, 25 examples, personality, voice rules, eval framework refs |
| TA-048 | Craft-roast prompt template | done | critical | 3 variants (Rubric/Persona/Adversarial) + research/reply/iteration prompts + A/B framework. See `docs/craft-roast-prompt-design.md` |
| TA-020 | Roast engine (orchestrates agent) | todo | critical | `roast/roast-engine.ts` — loadCharacter → buildPrompt → provider.run() → parse → filter → rank → best |
| TA-023 | Content filter (regex, no LLM) | todo | critical | `content/content-filter.ts` — TOS, banned words, ≤280 chars, no ticker spam, no financial advice |
| TA-059 | Fix extractJsonFromOutput greedy regex bug | todo | high | `agent/claude-code.provider.ts` — greedy `\{[\s\S]*\}` fails with multiple JSON objects |
| TA-035 | Character loader + validator | todo | high | `roast/character.loader.ts` — JSON with Zod validation |

## Milestone 2: Twitter Integration

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-017 | Choose Twitter handle for the bot | todo | critical | Check: @BeefRoastBot, @BeefRoasts, @beef_agent, @0xBEEF |
| TA-061 | Create bot accounts + credentials (Twitter) | todo | critical | Twitter account + X Premium ($8) + 2FA + avatar/logo |
| TA-082 | Add agent-twitter-client to dependencies | todo | critical | `pnpm add agent-twitter-client` — cookie auth library. Verify Node 22 compat |
| TA-019 | Twitter client (dual-mode) | todo | critical | `twitter/twitter-client.ts` — CookieAuthClient (agent-twitter-client + PROXY_URL) + ApiClient (twitter-api-v2). Auto-failover |
| TA-083 | Rate limiter | todo | critical | `twitter/rate-limiter.ts` — token bucket, separate limits for posts vs reads, daily count tracking |
| TA-084 | Cookie session manager | todo | critical | `twitter/cookie-manager.ts` — login once → save cookies → reuse. TOTP from TWITTER_2FA_SECRET |
| TA-085 | Purchase ISP residential proxy (Decodo) | todo | critical | SOCKS5, static IP, ~$3-5/mo. Config: `PROXY_URL=socks5://...` in .env |
| TA-086 | Update env.validation.ts with new vars | in_progress | high | Done: TELEGRAM_ADMIN_IDS. Remaining: PROXY_URL, TWITTER_2FA_SECRET, TWITTER_COOKIES_PATH, POST_JITTER_PERCENT |

## Milestone 3: Telegram Command Center

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-087 | Add grammY + plugins to dependencies | done | critical | `grammy 1.41.1` installed. Conversations plugin deferred — not needed for MVP |
| TA-071 | Telegram admin bot — core + RLHF flow | done | critical | `src/admin/` — bot.ts, guard, session-store, keyboards, formatters, roast-generator. /roast, /stats, /status + text eval + rating buttons |
| TA-088 | Telegram management commands | in_progress | high | /status + /stats done. Remaining: /pause, /resume, /queue, /config, /emergency |
| TA-089 | Telegram notifications system | todo | high | Push alerts: errors, rate limits, high engagement, challenges, daily digest |
| TA-044 | Telegram bot extended features | todo | medium | /approve (moderation mode), multi-admin support, inline keyboards |

## Milestone 4: Scheduler + Queue + Wiring

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-038 | Human-like jitter module | todo | high | `scheduler/jitter.ts` — quiet hours (2-7 UTC), bursts, distraction delays |
| TA-049 | Scheduler with all job types | todo | high | `scheduler/scheduler.ts` — uses `cron` package. Jobs: autonomous-roast, mention-poll, engagement-track, daily-digest |
| TA-040 | Queue manager | todo | high | `queue/queue.manager.ts` — dequeue by priority → process → update status. Max 3 attempts |
| TA-036 | Bootstrap + wiring | todo | high | `bootstrap.ts` + `index.ts` — DI, create all services, start scheduler + telegram bot |
| TA-042 | Graceful shutdown | todo | medium | SIGTERM/SIGINT → stop scheduler → drain queue → kill claude subprocesses → close DB |

## Milestone 5: Deploy to VPS

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-090 | Install pnpm + PM2 globally on VPS | done | critical | PM2 6.0.14 installed. pnpm not yet — using npm |
| TA-091 | Install + authorize Claude Code CLI on VPS | done | critical | claude-code@2.1.62 installed globally, Node 22.22.1 |
| TA-092 | Create PM2 ecosystem config | todo | high | `ecosystem.config.cjs` — process management, log rotation, memory limits |
| TA-029 | Deploy bot to Hostinger VPS | todo | high | Clone repo, pnpm install, .env, build, PM2 start. DRY_RUN first 24h |
| TA-093 | Create deploy script | todo | high | `scripts/deploy.sh` — build → push → pull on VPS → install → build → PM2 restart |
| TA-094 | Setup Sentry project for error tracking | todo | medium | Create project on sentry.io, add DSN to .env |

## Milestone 6: Testing

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-037 | Unit tests for critical path | todo | critical | content-filter, roast-engine, character-loader, rate-limiter, twitter-client, jitter, queue-manager, guards. ~80-120 tests |
| TA-043 | Integration test — full pipeline | todo | high | `tests/integration/pipeline.spec.ts` — in-memory SQLite + mocked provider + mocked twitter → queue item → roast → filter → "post" |
| TA-021 | DRY_RUN roast quality test | todo | high | 10-15 roasts with real LLM, review quality. Prompt tuning |
| TA-095 | Smoke test script for deploy | todo | medium | PM2 status + health endpoint + last log lines. Run after every deploy |

## Milestone 7: Blockchain Integration (post-token)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-096 | Base chain client setup (viem) | todo | high | `src/chain/client.ts` — public client, Alchemy RPC. Already have viem in deps |
| TA-067 | Register $BEEF in ERC-8004 Identity Registry | todo | critical | On-chain tx on Base. "First AI roast agent with verifiable on-chain identity" |
| TA-068 | ERC-8004 announcement tweet thread | todo | critical | Explain what ERC-8004 is + why $BEEF uses it |
| TA-026 | Burn detection + roast request flow | todo | high | Alchemy webhooks watching Transfer(to=0x...dead) → queue roast. viem watchEvent fallback |
| TA-025 | Token launch via Bankr | todo | critical | BOT launches (not co-founder). Bot must have 5-10 live posts first |
| TA-024 | Set up Snapshot.org space for challenge voting | todo | medium | Off-chain, gasless, token-weighted governance |
| TA-069 | Apply to Bankr tokenized-agents registry | todo | medium | GitHub PR to BankrBot/tokenized-agents |

## Milestone 8: Visual Content + Scale (post-launch)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-064 | Roast scorecard HTML template + Puppeteer | todo | high | Dark theme, fire accents, dynamic data. Image per roast for virality |
| TA-072 | GIF generation for roasts | todo | medium | Giphy API or custom ffmpeg. Animated roast cards |
| TA-039 | Mention polling + parser | todo | high | `twitter/mention.parser.ts` — detect roast requests from mentions |
| TA-050 | Reply prompt template | todo | high | `agent/prompts/craft-reply.ts` — mention replies + reply-guy |
| TA-051 | Target discovery prompt + selector | todo | high | `agent/prompts/discover-targets.ts` + `roast/target.selector.ts` |
| TA-022 | News monitor — RSS + DexScreener | todo | medium | `news/sources/` — autonomous target discovery |
| TA-053 | Engagement tracker | todo | medium | `learning/engagement.tracker.ts` — time-series snapshots |
| TA-054 | Learning module | todo | medium | `learning/learning.module.ts` — analyze what works |
| TA-077 | Dynamic avatar system | todo | medium | Change avatar weekly to most-roasted target |

## Marketing + Launch Tasks

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-056 | Blind test 20 roasts with real crypto people | in_progress | critical | 20 roasts generated, persona panel eval done: 4 FIRE / 6 POST / 0 REJECT. Top: #7 Virtuals (0.82), #15 Base (0.82), #8 HL (0.81), #16 Base (0.80). Need human validation — send top 5 to Telegram |
| TA-098 | Multidimensional Evaluation Framework | done | critical | 3-layer pipeline: heuristics → LLM-as-Judge → persona panel. See `docs/evaluation-framework.md` |
| TA-099 | CT audience personas for evaluation | done | high | 6 detailed personas with demographics, humor profiles, engagement triggers. See `docs/research-ct-audience-personas.md` |
| TA-100 | Research: CT roast culture + evaluation frameworks | done | high | `docs/research-ct-roast-culture.md` + `docs/research-evaluation-frameworks.md` |
| TA-062 | Prepare token launch assets | todo | critical | Pre-write launch thread, KOL coordination |
| TA-065 | OpenAI Roast Campaign — day 1 content | todo | high | First 5 roasts targeting OpenAI token/airdrop narrative |
| TA-073 | OpenSea Roast Campaign — launch day content | todo | high | "#1 мета для хейта" — sustained OpenSea roasts |
| TA-066 | "Reply with a ticker" interactive thread | todo | high | Free roast scorecards for engagement |
| TA-074 | Find Jesse Pollak "roast me" tweet | todo | high | Jesse publicly invited criticism — reply for RT potential |
| TA-075 | Collect reference roast tweets (Voronin) | todo | high | Voronin собирает рефы хороших роаст-твитов |
| TA-078 | Coordinate pump advertisers ($30/repost) | todo | high | Cheap promotion via crypto Twitter reposters |
| TA-030 | Seed roasts with friends/KOLs | todo | high | Co-founder RTs best roasts |
| TA-070 | First burn-to-roast demo (own funds) | todo | high | Immediately after token launch |
| TA-076 | Register domain for bot | todo | medium | .xyz, .ai, or .bot |
| TA-060 | Reach viral metric: 1 roast >300 RT or QT from >10K account | todo | high | Growth KPI |
| TA-097 | Create Telegram group for community | todo | medium | Public group for roast requests, discussion |

## Backlog

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-028 | Set up DexScreener + CoinGecko token monitoring | todo | low | Price/volume alerts after token launch |
| TA-031 | Implement challenge/accountability flow | todo | low | ERC-8004 Validation Registry + Snapshot vote + treasury reward |
| TA-045 | Health monitor + alerting | todo | low | Periodic checks + Claude Code CLI health check |
| TA-046 | Metrics collector | todo | low | In-memory counters for daily stats |
| TA-052 | Reply-guy scheduler job | todo | medium | Every 2.5h ±50% jitter, agent researches + replies |
| TA-055 | Agent prompts: quality audit + character tuning + content strategy | todo | medium | Daily audit, weekly tuning, daily planning |

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
| TA-063 | Technical launch plan document | done | critical | `docs/technical-launch-plan.md` — milestones, anti-detection, Telegram, deploy, testing |
