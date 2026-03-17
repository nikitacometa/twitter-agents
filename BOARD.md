# Twitter Agents — Task Board

> Last updated: 2026-03-17 (v5.2: launch March 18, token day 3-5, BOT launches token, cookie auth + API backup, ERC-8004 utility)

## Conventions
- **ID format**: `TA-NNN` (sequential, never reuse)
- **Statuses**: `todo` | `in_progress` | `blocked` | `done`
- **Priorities**: `critical` | `high` | `medium` | `low`
- Next available ID: **TA-082**

---

## Phase 0: Content Validation (GO/NO-GO gate)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-015 | Define bot personality — mferGPT-inspired data-backed roaster | todo | critical | Voice: casual lowercase, data-driven, unexpected comparisons, self-aware AI. See strategy-v5 Part 4 |
| TA-056 | Blind test 20 roasts with real crypto people | in_progress | critical | 5 sent to Telegram. Need 5/20 = 🔥 for GO |

## Phase 1: Build + First Tweets (March 18-20)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-017 | Choose Twitter handle for the bot | todo | critical | Check: @BeefRoastBot, @BeefRoasts, @beef_agent, @0xBEEF |
| TA-061 | Create bot accounts + credentials (Twitter) | todo | critical | Twitter account + X Premium ($8) + 2FA, avatar/logo |
| TA-063 | Setup Twitter auth: cookie auth primary + API from friend backup | todo | critical | Day 0. agent-twitter-client (cookie), API от друга как fallback |
| TA-016 | Create character config (system prompt + examples) | todo | critical | Depends on TA-015. JSON with Zod validation. mferGPT-inspired voice |
| TA-048 | Agent prompt template — craft-roast only | todo | critical | `agent/prompts/craft-roast.ts` — generate 10 variants → pick best |
| TA-020 | Roast engine (orchestrates agent) | todo | critical | prompt → agent → parse → rank → return best draft |
| TA-023 | Content filter (regex, no LLM) | todo | critical | TOS, banned words, length ≤280 — blocks first tweet |
| TA-019 | Twitter client + rate limiter | todo | critical | agent-twitter-client (cookie auth) primary + twitter-api-v2 fallback. postTweet + getMentions |
| TA-071 | Telegram admin bot with fine-tuning loop | todo | critical | Target → 3 variants → pick best → post → bot learns. RLHF-style |
| TA-064 | Roast scorecard HTML template + Puppeteer generator | todo | high | Dark theme, fire accents, dynamic data. Image per roast for virality |
| TA-072 | GIF generation for roasts | todo | high | "Кивки — это имба." Giphy API or custom ffmpeg. Animated roast cards |
| TA-035 | Character loader + validator | todo | high | `roast/character.loader.ts` — JSON with Zod validation |
| TA-036 | Bootstrap + wiring | todo | high | `bootstrap.ts` + `index.ts` — setInterval with jitter |
| TA-059 | Fix 3 CRITICAL code bugs | todo | high | extractJsonFromOutput regex, tweet length, target dedup |
| TA-029 | Deploy bot to Hostinger VPS with PM2 | todo | high | pnpm, .env, Sentry, DRY_RUN first |
| TA-021 | Test roast quality — 10-15 generated roasts via agent | todo | high | DRY_RUN mode, prompt tuning before go-live |
| TA-065 | OpenAI Roast Campaign — day 1 content | todo | high | First 5 roasts targeting OpenAI token/airdrop narrative |
| TA-073 | OpenSea Roast Campaign — launch day content | todo | high | "#1 мета для хейта" — sustained OpenSea roasts for launch week |
| TA-066 | "Reply with a ticker" interactive thread | todo | high | Free roast scorecards for engagement. Community = content engine |
| TA-074 | Find Jesse Pollak "roast me" tweet | todo | high | Jesse publicly invited criticism — reply with roast → potential RT |
| TA-075 | Collect reference roast tweets (Voronin) | todo | high | Voronin собирает рефы хороших роаст-твитов и мета-иронии |
| TA-076 | Register domain for bot | todo | medium | Нужен домен для бренда. Решить: .xyz, .ai, .bot |
| TA-077 | Dynamic avatar system | todo | medium | Менять аватарку раз в неделю — самый зароащенный за неделю |

## Phase 2: Token Launch (March 20-22)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-025 | Token launch via Bankr | todo | critical | Day 3-5 (March 20-22). BOT launches (not co-founder). Bot must have 5-10 live posts |
| TA-062 | Prepare token launch assets (thread, cast, KOL coordination) | todo | critical | Day 2-3. Pre-write launch content |
| TA-078 | Coordinate pump advertisers ($30/repost) | todo | high | Cheap promotion via crypto Twitter reposters |
| TA-070 | First burn-to-roast demo (own funds) | todo | high | Immediately after token launch |
| TA-030 | Seed roasts with friends/KOLs | todo | high | Co-founder RTs best roasts |

## Phase 3: Growth + Narrative (March 22 — April 1)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-067 | Register $BEEF in ERC-8004 Identity Registry | todo | critical | On-chain tx on Base. "First AI roast agent with verifiable on-chain identity" |
| TA-068 | ERC-8004 announcement tweet thread | todo | critical | Explain what ERC-8004 is + why $BEEF uses it |
| TA-060 | Reach viral metric: 1 roast >300 RT or QT from >10K account | todo | high | Growth KPI |
| TA-069 | Apply to Bankr tokenized-agents registry | todo | medium | GitHub PR to BankrBot/tokenized-agents |
| TA-037 | Unit tests for critical path | todo | medium | extractJsonFromOutput, roast engine, content filter |

## Phase 4: Scale (April 1+)

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-026 | Implement burn-to-roast request flow | todo | high | On-chain burn → bot queues target |
| TA-038 | Human-like jitter module | todo | high | `scheduler/jitter.ts` — quiet hours, bursts, distraction delays |
| TA-049 | Scheduler with all job types | todo | high | `scheduler/scheduler.ts` — replace setInterval |
| TA-039 | Mention polling + parser | todo | high | `twitter/mention.parser.ts` — detect roast requests |
| TA-040 | Queue manager | todo | high | `queue/queue.manager.ts` — priority queue with SQLite |
| TA-050 | Reply prompt template | todo | high | `agent/prompts/craft-reply.ts` — mention replies + reply-guy |
| TA-051 | Target discovery prompt + selector | todo | high | `agent/prompts/discover-targets.ts` + `roast/target.selector.ts` |
| TA-022 | News monitor — RSS + DexScreener | todo | medium | `news/sources/` — autonomous target discovery |
| TA-042 | Graceful shutdown (with agent kill) | todo | medium | SIGTERM/SIGINT + kill Claude Code subprocesses |
| TA-043 | Integration tests | todo | medium | Pipeline tests with in-memory SQLite, mocked agent |

## Backlog

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-024 | Set up Snapshot.org space for challenge voting | todo | medium | Off-chain, gasless, token-weighted. ERC-8004 Validation Registry integration |
| TA-028 | Set up DexScreener + CoinGecko token monitoring | todo | low | Price/volume alerts after token launch |
| TA-031 | Implement challenge/accountability flow | todo | low | ERC-8004 Validation Registry + Snapshot vote + treasury reward |
| TA-044 | Telegram admin bot (extended commands) | todo | medium | /status, /pause, /resume, /queue, /stats, /approve. Core fine-tuning loop in TA-071 |
| TA-045 | Health monitor + alerting | todo | low | Periodic checks + Claude Code CLI health check |
| TA-046 | Metrics collector | todo | low | In-memory counters for daily stats |
| TA-052 | Reply-guy scheduler job | todo | medium | Every 2.5h ±50% jitter, agent researches + replies |
| TA-053 | Engagement tracker | todo | medium | `learning/engagement.tracker.ts` — time-series snapshots |
| TA-054 | Learning module | todo | medium | `learning/learning.module.ts` — analyze what works |
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
