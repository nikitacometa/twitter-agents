# $BEEF Bot — Architecture & Implementation Plan

**Date:** 2026-03-15 (rev. 2: 2026-03-15 — Claude Code Agent integration)
**Status:** Design document — approved architecture for implementation
**Scope:** Full bot architecture, data model, testing strategy, milestones

---

## Executive Summary

$BEEF — AI-бот, который роастит крипто-проекты в Twitter. Один бот, один токен, три режима: автономные роасты, burn-to-roast, community challenges.

**Ключевое архитектурное решение rev.2:** Claude Code Agent (Claude Max, безлимитные токены) — primary brain бота. Node.js orchestrator управляет scheduling, Twitter API, SQLite, Telegram. Claude Code Agent через subprocess выполняет все research, generation, fact-checking с полным доступом к Perplexity MCP, web search и локальной knowledge base.

Архитектура оптимизирована под:

- **Качество контента** — Claude Code Agent с Perplexity MCP для deep research + multi-stage pipeline
- **Надёжность** — бот работает 24/7, переживает рестарты, rate limits, API outages
- **Управляемость** — Telegram admin bot для мониторинга и контроля без SSH
- **Human-like поведение** — jitter scheduling, variable delays, quiet hours, burst patterns
- **Тестируемость** — dry-run mode, deterministic mocks, content quality assertions
- **Масштаб** — 50-80 writes/day (5-8 originals + 40-60 replies), не 25/day как в rev.1

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Node.js Orchestrator (PM2)                         │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              Scheduler (human-like jitter)                      │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │  │
│  │  │ Mention  │ │ Roast    │ │ Reply-   │ │ Research │         │  │
│  │  │ Poller   │ │ Timer    │ │ Guy      │ │ Cron     │         │  │
│  │  │ (10min)  │ │ (±40%)   │ │ (±50%)   │ │ (±60%)   │         │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │  │
│  │       │            │            │             │                │  │
│  │  ┌────┴────┐ ┌─────┴─────┐ ┌───┴─────┐ ┌────┴──────┐        │  │
│  │  │ Quality │ │ Content   │ │Character│ │ Engagement│        │  │
│  │  │ Audit   │ │ Strategy  │ │ Tuning  │ │ Tracker   │        │  │
│  │  │ (daily) │ │ (daily)   │ │(weekly) │ │ (hourly)  │        │  │
│  │  └─────────┘ └───────────┘ └─────────┘ └───────────┘        │  │
│  └────────────────────────┬───────────────────────────────────────┘  │
│                           │                                          │
│                           ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              Queue Manager (SQLite, priority)                   │  │
│  │  burn(10) | mention(5) | reply_guy(3) | autonomous(1)          │  │
│  └────────────────────────┬───────────────────────────────────────┘  │
│                           │                                          │
│                           ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │           ★ Claude Code Agent (subprocess) ★                    │  │
│  │                                                                 │  │
│  │  claude -p "..." --model sonnet --output-format json            │  │
│  │                                                                 │  │
│  │  Tools:                                                         │  │
│  │  ├── Perplexity MCP ──→ deep crypto research                   │  │
│  │  ├── WebSearch ────────→ fact verification, live data           │  │
│  │  ├── Read / Grep ──────→ local knowledge base, past roasts     │  │
│  │  └── Bash(curl) ──────→ CoinGecko, DexScreener, DefiLlama     │  │
│  │                                                                 │  │
│  │  Does: research ∘ enrich ∘ generate ∘ fact-check ∘ reply       │  │
│  └────────────────────────┬───────────────────────────────────────┘  │
│                           │                                          │
│                           ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              Post-Processing (Node.js, no LLM)                  │  │
│  │  Content filter (regex) → length ≤280 → rate limit check        │  │
│  └────────────────────────┬───────────────────────────────────────┘  │
│                           │                                          │
│                           ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              Twitter Client (twitter-api-v2)                    │  │
│  │  post() | reply() | pollMentions() | searchRecent()             │  │
│  └────────────────────────┬───────────────────────────────────────┘  │
│                           │                                          │
│  ┌───────────┐  ┌────────┴────────┐  ┌──────────────────┐          │
│  │ Telegram  │  │ Storage (SQLite) │  │ Health Monitor   │          │
│  │ Admin Bot │  │ 10 tables + FTS5 │  │ metrics + alerts │          │
│  └───────────┘  └─────────────────┘  └──────────────────┘          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Module Structure

```
beef/src/
├── index.ts                          # Entry point + graceful shutdown
├── bootstrap.ts                      # Dependency wiring (was bot.ts)
│
├── common/
│   ├── config/
│   │   └── env.validation.ts         # Zod env validation (exists)
│   ├── utils/
│   │   ├── error.util.ts             # getErrorMessage + retryWithBackoff (exists)
│   │   └── logger.ts                 # Pino logger (exists)
│   └── types/
│       └── index.ts                  # Shared types: RoastTarget, RoastResult, QueueItem
│
├── agent/                            # ★ Claude Code Agent layer (NEW)
│   ├── agent.types.ts                # LLMProvider, AgentTask, AgentResult, ProviderCapabilities
│   ├── claude-code.provider.ts       # Primary: spawn claude CLI subprocess, parse JSON
│   ├── anthropic-sdk.provider.ts     # Fallback: @anthropic-ai/sdk direct API calls
│   ├── provider-manager.ts           # Strategy: health check, auto-switch, recovery
│   └── prompts/                      # Task-specific prompt templates
│       ├── research-target.ts        # Deep target research (Perplexity)
│       ├── generate-roast.ts         # Roast generation with context
│       ├── verify-facts.ts           # Fact-check with web search
│       ├── craft-reply.ts            # Mention reply / reply-guy
│       ├── discover-targets.ts       # Trending topics + roast-worthy events
│       ├── audit-quality.ts          # Daily quality review
│       ├── tune-character.ts         # Weekly character optimization
│       └── plan-content.ts           # Daily content strategy
│
├── twitter/
│   ├── twitter.client.ts             # Twitter API wrapper (post, reply, poll, search)
│   ├── rate-limiter.ts               # Token bucket rate limiter (separate class)
│   └── mention.parser.ts             # Parse mentions → detect roast requests
│
├── roast/
│   ├── roast.engine.ts               # Orchestrates agent calls for roast generation
│   ├── prompt.builder.ts             # Build system+user prompt from character+context
│   ├── target.selector.ts            # Score and select best target from candidates
│   ├── context.enricher.ts           # Fast API enricher (CoinGecko, DexScreener fallback)
│   └── character.loader.ts           # Load + validate character config
│
├── content/
│   ├── content.filter.ts             # TOS compliance, banned words, length check (no LLM)
│   └── content.types.ts              # FilterResult
│
├── news/
│   ├── news.monitor.ts               # Orchestrator for all news sources
│   └── sources/
│       ├── rss.source.ts             # RSS feed parser
│       ├── dexscreener.source.ts     # DexScreener API — new pairs, trending
│       └── twitter.source.ts         # Twitter search for trending topics
│
├── queue/
│   ├── queue.manager.ts              # Priority queue with persistence
│   └── queue.types.ts                # QueueItem, QueuePriority
│
├── scheduler/
│   ├── scheduler.ts                  # Job scheduler with human-like jitter
│   └── jitter.ts                     # Randomized timing: base ± jitter + quiet hours + bursts
│
├── storage/
│   ├── database.ts                   # SQLite connection + migrations
│   ├── repositories/
│   │   ├── roast.repository.ts       # CRUD for posted roasts
│   │   ├── mention.repository.ts     # Track processed mentions
│   │   ├── queue.repository.ts       # Persistent queue storage
│   │   ├── tweet.repository.ts       # All observed tweets (NEW)
│   │   ├── target.repository.ts      # Accumulated target knowledge (NEW)
│   │   ├── llm-log.repository.ts     # LLM call log for quality analysis (NEW)
│   │   └── user.repository.ts        # People who interact with us (NEW)
│   └── migrations/
│       ├── 001-initial.sql           # Core schema (roasts, mentions, queue, config)
│       └── 002-extended.sql          # Extended schema (tweets, targets, llm_log, users, FTS)
│
├── learning/                         # ★ Feedback loop (NEW)
│   ├── engagement.tracker.ts         # Track engagement over time
│   └── learning.module.ts            # Analyze what works, adjust scoring weights
│
├── admin/
│   ├── telegram.bot.ts               # Telegram bot for admin commands
│   ├── telegram.commands.ts          # Command handlers (/status, /roast, /pause...)
│   └── telegram.types.ts             # AdminCommand, BotState
│
└── health/
    ├── health.monitor.ts             # Periodic health checks + alerting
    └── metrics.ts                    # In-memory counters for stats
```

### Module Dependencies

```
index.ts
  └── bot.ts (orchestrator)
        ├── scheduler/scheduler.ts
        │     ├── news/news.monitor.ts
        │     │     └── news/sources/*.ts
        │     ├── twitter/twitter.client.ts (pollMentions)
        │     └── queue/queue.manager.ts
        ├── queue/queue.manager.ts
        │     └── storage/repositories/queue.repository.ts
        ├── roast/roast.engine.ts
        │     ├── roast/context.enricher.ts
        │     └── roast/character.loader.ts
        ├── content/fact.checker.ts
        ├── content/content.filter.ts
        ├── twitter/twitter.client.ts (post/reply)
        ├── admin/telegram.bot.ts
        ├── health/health.monitor.ts
        └── storage/database.ts
```

---

## Architectural Decisions

### ADR-1: SQLite for State Persistence

**Decision:** SQLite via `better-sqlite3` (synchronous, zero-config) для всего persistent state.

**Why:**
- Бот работает в единственном процессе — конкурентный доступ не нужен
- Переживает рестарты PM2 без потери данных
- Нулевая инфраструктура (файл на диске, backup через `cp`)
- `better-sqlite3` — синхронный API, проще чем async ORM, 10x быстрее чем `sqlite3`

**What persists:**
- `roasts` — история всех роастов (target, text, tweet_id, engagement)
- `mentions` — обработанные mentions (since_id для polling)
- `queue` — очередь роастов (autonomous, mention-triggered, burn-requests)
- `config` — runtime-adjustable config (paused state, daily limits)
- `rate_limits` — Twitter API rate limit tracking

**What does NOT persist (in-memory only):**
- Текущий контекст новостей (перезагружается при старте)
- Временные LLM-промпты
- Health metrics (reset при рестарте — это нормально)

**Alternative considered:** JSON files — отвергнуто. Не atomic writes, race conditions при краше, нет query capabilities.

### ADR-2: Priority Queue с Persistence

**Decision:** Собственная priority queue в SQLite, не внешний message broker.

**Why:**
- Throughput = 5-30 messages/day — Redis/RabbitMQ = overkill
- Persistence через SQLite transactions = crash-safe
- Priority levels: `burn-request (10)` > `mention-reply (5)` > `autonomous (1)`

**Queue lifecycle:**
```
PENDING → PROCESSING → COMPLETED | FAILED | REJECTED
```

### ADR-3: Constructor Injection (no DI container)

**Decision:** Простой constructor injection. Никаких DI-фреймворков.

**Why:**
- 10 модулей — не enterprise app. DI-контейнер добавляет indirection без пользы
- Explicit wiring в `bot.ts` — видно весь граф зависимостей в одном файле
- Отлично тестируется: передаём моки через конструктор

```typescript
// bot.ts — explicit wiring
const db = new Database(config.DB_PATH);
const twitterClient = new TwitterClient(config, logger);
const roastEngine = new RoastEngine(config, logger);
const factChecker = new FactChecker(config, logger);
const contentFilter = new ContentFilter(logger);
const queueManager = new QueueManager(db, logger);
const newsMonitor = new NewsMonitor(config, logger);
const telegramBot = new TelegramBot(config, logger);
const healthMonitor = new HealthMonitor(config, logger, telegramBot);
const scheduler = new Scheduler(config, logger, {
  twitterClient,
  roastEngine,
  factChecker,
  contentFilter,
  queueManager,
  newsMonitor,
  healthMonitor,
});
```

### ADR-4: Dry-Run Mode

**Decision:** Глобальный `DRY_RUN=true` env var. В dry-run всё работает кроме `twitter.post()` и `twitter.reply()` — они логируют текст, но не отправляют.

**Why:**
- Тестирование полного pipeline без риска случайного поста
- Первые дни работы — проверка качества роастов перед реальным постингом
- E2E тесты используют dry-run

### ADR-5: Event-Driven Communication (Limited)

**Decision:** Гибрид: прямые вызовы для основного pipeline + EventEmitter для cross-cutting concerns (health, metrics, alerts).

**Why:**
- Основной pipeline (target → roast → post) — линейный, events добавляют сложность без пользы
- Но: health monitor, Telegram alerts, metrics — должны реагировать на события в любом модуле, не нарушая основной flow

```typescript
// Events emitted by modules:
'roast:generated'   → health monitor records count
'roast:posted'      → metrics increment, Telegram notification
'roast:rejected'    → alert, log reason
'mention:received'  → queue item created
'rate:limited'      → pause scheduler, alert
'error:critical'    → Telegram alert, Sentry
```

### ADR-6: Graceful Shutdown

**Decision:** `SIGTERM`/`SIGINT` handlers в `index.ts`. Shutdown sequence:

1. Stop scheduler (no new jobs)
2. Wait for in-flight Claude Code agent to complete (max 60s timeout) or kill subprocess
3. Flush Telegram bot pending messages
4. Close SQLite connection
5. Flush pino logs
6. Exit 0

```typescript
// index.ts
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully...');
  await scheduler.stop();
  await agentRunner.killAll();  // terminate any running Claude Code subprocesses
  await telegramBot.stop();
  db.close();
  logger.flush();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
```

### ADR-7: Claude Code Agent as Primary Brain

**Decision:** Все research, generation, fact-checking выполняются через Claude Code CLI subprocess. Node.js — thin orchestrator (scheduling, DB, Twitter API). Claude Code — brain (intelligence, research, creativity).

**Why:**
- **Claude Max** — безлимитные токены. Cost per invocation = $0. Нет причины экономить на quality
- Claude Code Agent имеет доступ к tools: Perplexity MCP (deep research), WebSearch, WebFetch, Read/Grep (local knowledge base), Bash(curl) для API calls
- Один Claude Code invocation заменяет: context enricher (4 API calls) + roast generator (Claude API) + fact checker (Claude API) — всё в одном agentic loop с multi-step reasoning
- **Perplexity MCP** для research — значительно глубже чем простые API calls к CoinGecko/DexScreener. Находит controversies, team history, broken promises, community sentiment
- Agent может читать SQLite данные о прошлых роастах для novelty check прямо в ходе генерации

**Invocation pattern:**
```bash
claude -p "{prompt}" \
  --model sonnet \
  --output-format json \
  --max-turns 25 \
  --allowedTools "mcp__perplexity-ask__perplexity_ask,WebSearch,WebFetch,Read,Grep,Glob,Bash(curl *)"
```

**What moves to Claude Code Agent:**

| Task | Before (rev.1) | After (rev.2) |
|------|----------------|----------------|
| Target discovery | RSS + DexScreener API | Claude Code + Perplexity |
| Context enrichment | 4 parallel API calls | Claude Code + Perplexity + APIs |
| Roast generation | Single Claude API call | Claude Code with full context |
| Fact checking | Claude Haiku API call | Claude Code + WebSearch verification |
| Reply crafting | Claude API call | Claude Code + target account research |
| Reply-guy | Claude API call | Claude Code + tweet context research |
| Quality audit | Not implemented | Claude Code daily review |
| Character tuning | Not implemented | Claude Code weekly analysis |
| Content strategy | Not implemented | Claude Code daily planning |

**What stays in Node.js (no LLM):**

| Task | Why |
|------|-----|
| Scheduling + jitter | Pure timer logic, no intelligence needed |
| Twitter API calls | Direct REST API, rate limiting |
| Queue management | SQLite CRUD operations |
| Content filter | Regex patterns, length check — deterministic |
| Health monitoring | API ping, counter logic |
| Telegram admin | Command routing, notifications |
| Engagement tracking | Twitter API → SQLite updates |

**Latency:** Claude Code invocation = 30-120s. Это acceptable и даже желательно — мгновенные ответы выглядят как бот. Задержка 1-2 min выглядит как человек, который думает над ответом.

**Concurrency:** VPS (2 vCPU, 8GB RAM) может запустить 2-3 concurrent Claude Code processes. Node.js orchestrator ставит tasks в очередь если все slots заняты.

### ADR-8: Human-Like Invocation Patterns

**Decision:** Все scheduled Claude Code invocations имеют high jitter, quiet hours, и occasional burst patterns. Цель — выглядеть как человек, который проверяет Twitter нерегулярно.

**Why:**
- Механические cron jobs в фиксированное время = bot fingerprint
- Twitter и Anthropic API видят timing patterns
- Человек проверяет Twitter рывками: иногда 3 поста за час, потом тишина на 5 часов

**Implementation:**

```typescript
// scheduler/jitter.ts

export interface JitterConfig {
  baseMinutes: number;
  jitterPercent: number;  // ±X% от base
  quietHoursMultiplier: number;  // 3x delay в quiet hours (5-10 AM UTC)
  distractionChance: number;  // 15% chance добавить 10-30 min "отвлёкся"
  burstChance: number;  // 10% chance выполнить задачу повторно через 5-15 min
}

export function humanLikeDelay(config: JitterConfig): number {
  const { baseMinutes, jitterPercent, quietHoursMultiplier, distractionChance } = config;

  // Base jitter: ±X%
  const jitter = baseMinutes * (jitterPercent / 100);
  let delay = baseMinutes + (Math.random() * 2 - 1) * jitter;

  // "Distraction" — человек отвлёкся
  if (Math.random() < distractionChance) {
    delay += 10 + Math.random() * 20;
  }

  // Quiet hours (5-10 AM UTC) — CT dead zone: US sleeps, EU commutes
  const hour = new Date().getUTCHours();
  if (hour >= 5 && hour < 10) {
    delay *= quietHoursMultiplier;
  }

  // Weekend modifier — чуть реже
  const day = new Date().getUTCDay();
  if (day === 0 || day === 6) {
    delay *= 1.3;
  }

  return Math.max(5, delay) * 60 * 1000; // min 5 min, convert to ms
}

// After completing a task, 10% chance to "burst" — do another within 5-15 min
export function shouldBurst(config: JitterConfig): { burst: boolean; delayMs: number } {
  if (Math.random() < config.burstChance) {
    return { burst: true, delayMs: (5 + Math.random() * 10) * 60 * 1000 };
  }
  return { burst: false, delayMs: 0 };
}
```

**Timing profiles per job type:**

| Job | Base interval | Jitter | Quiet hours | Burst | Effective range |
|-----|---------------|--------|-------------|-------|-----------------|
| Autonomous roast | 180 min (3h) | ±40% | 3x | 10% | 1.8h – 11h |
| Reply-guy | 150 min (2.5h) | ±50% | 3x | 15% | 1.25h – 9h |
| Target discovery | 240 min (4h) | ±60% | skip | no | 1.6h – 6.4h |
| Content strategy | 1440 min (24h) | ±120min | skip | no | 22h – 26h |
| Quality audit | 1440 min (24h) | ±180min | skip | no | 21h – 27h |
| Character tuning | 10080 min (7d) | ±1440min | skip | no | 5.5d – 8.5d |
| Mention reply | event-driven | +30-90s | no delay | no | 30s – 90s after poll |
| Engagement track | 60 min | ±10% | no change | no | 54min – 66min |

**Mention replies** — event-driven, no jitter needed. Бот обнаруживает mention через poller (every 10 min), затем отвечает через 30-90 секунд. Это выглядит как человек, который увидел notification.

### ADR-9: Anthropic SDK Fallback (Graceful Degradation)

**Decision:** `@anthropic-ai/sdk` используется как fallback при недоступности Claude Code CLI. Не как равноценная замена, а как degraded mode для задач, не требующих research tools.

**Why:**
- Claude Code CLI может быть недоступен: обновление сломало бинарник, Claude Max rate limited, процесс завис
- Полная остановка бота на часы — хуже, чем ответы в degraded mode
- Простые ответы на mentions и engagement analysis НЕ требуют Perplexity/WebSearch
- SDK уже в dependencies (`@anthropic-ai/sdk`), добавляет ~250 строк кода

**Что CLI даёт, а SDK нет:**

| Возможность | CLI | SDK |
|-------------|-----|-----|
| Безлимитные токены (Claude Max) | Да | Нет — pay-per-token |
| Perplexity MCP | Да | Нет |
| WebSearch/WebFetch | Да | Нет |
| Multi-turn agent (25 шагов) | Да | Вручную через conversation loop |
| Read/Grep по файлам | Да | Нет — контекст передаётся в промпте |
| $0 за вызов | Да | ~$0.01-0.05 за вызов (Sonnet) |

**Поведение по режимам:**

| Task type | `requiresResearch` | CLI mode | SDK fallback |
|-----------|--------------------|----------|--------------|
| Autonomous roast | true | Full pipeline | **Пауза** — research обязателен |
| Reply на mention | false | Full pipeline | **Работает** — простой ответ |
| Reply-guy | true | Full pipeline | **Пауза** — нужен research аккаунта |
| Fact-check | true | Full pipeline | **Пауза** — WebSearch обязателен |
| Target discovery | true | Full pipeline | **Пауза** — Perplexity обязателен |
| Quality audit | false | Full pipeline | **Работает** — данные в контексте |
| Simple mention ack | false | Full pipeline | **Работает** — "noted, ser" |

**Switching logic:**

```
CLI health check (startup) → OK → primary mode
CLI fails 3x consecutive → switch to degraded mode
  → Telegram alert: "⚠️ Claude Code CLI unavailable. Degraded mode: only simple replies."
  → Research tasks queued, not dropped
  → Retry CLI every 15 min
CLI recovers → switch back to primary
  → Telegram alert: "✅ Claude Code CLI recovered. Full mode restored."
  → Process queued research tasks
```

**Implementation — Strategy pattern:**

```typescript
// agent/agent.types.ts
export interface LLMProvider {
  run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>>;
  healthCheck(): Promise<boolean>;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
}

export interface ProviderCapabilities {
  hasPerplexity: boolean;
  hasWebSearch: boolean;
  hasFileAccess: boolean;
  maxTurns: number;
}

// agent/provider-manager.ts
export class ProviderManager implements LLMProvider {
  private mode: 'primary' | 'degraded' | 'paused' = 'primary';
  private consecutiveFailures = 0;
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RECOVERY_INTERVAL_MS = 15 * 60 * 1000;

  constructor(
    private readonly primary: ClaudeCodeProvider,
    private readonly fallback: AnthropicSDKProvider,
    private readonly alerter: Alerter,
  ) {}

  async run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>> {
    if (task.requiresResearch && this.mode === 'degraded') {
      throw new TaskRequiresResearchError(taskId);
    }

    if (this.mode !== 'paused') {
      try {
        const result = await this.primary.run<T>(taskId, task);
        this.handleRecovery();
        return result;
      } catch {
        this.consecutiveFailures++;
      }
    }

    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD && !task.requiresResearch) {
      this.enterDegradedMode();
      return this.fallback.run<T>(taskId, task);
    }

    this.enterPausedMode();
    throw new ProviderUnavailableError(taskId);
  }
}
```

**Cost:** SDK fallback используется только в degraded mode (несколько часов раз в месяц). Расход ~$1-5/мес. Spending limit в Anthropic console = $20/мес как safety cap.

---

## Claude Code Agent Layer — Deep Dive

Центральный компонент rev.2. Node.js orchestrator вызывает Claude Code CLI как subprocess для всех задач, требующих intelligence.

### Runner Implementation

```typescript
// agent/claude-code.runner.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// --- Shared types (agent/agent.types.ts) ---

export interface AgentTask {
  prompt: string;
  maxTurns?: number;          // default 25 (CLI) / 1 (SDK)
  timeoutMs?: number;         // default 5 min
  allowedTools?: string[];    // restrict tool access per task (CLI only)
  requiresResearch: boolean;  // if true, only CLI can handle (Perplexity/WebSearch)
}

export interface AgentResult<T = unknown> {
  data: T;
  durationMs: number;
  provider: 'claude-code' | 'anthropic-sdk';
}

export interface ProviderCapabilities {
  hasPerplexity: boolean;
  hasWebSearch: boolean;
  hasFileAccess: boolean;
  maxTurns: number;
}

export interface LLMProvider {
  run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>>;
  healthCheck(): Promise<boolean>;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
}

// --- Primary provider (agent/claude-code.provider.ts) ---

export class ClaudeCodeProvider implements LLMProvider {
  readonly name = 'claude-code';
  readonly capabilities: ProviderCapabilities = {
    hasPerplexity: true,
    hasWebSearch: true,
    hasFileAccess: true,
    maxTurns: 25,
  };

  private runningCount = 0;
  private readonly maxConcurrent = 2;  // VPS has 2 vCPU

  constructor(
    private readonly logger: Logger,
    private readonly logRepo: LlmLogRepository,
  ) {}

  async run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>> {
    await this.waitForSlot();
    this.runningCount++;

    const start = Date.now();
    const tools = task.allowedTools?.join(',') ??
      'mcp__perplexity-ask__perplexity_ask,WebSearch,WebFetch,Read,Grep,Glob,Bash(curl *)';

    const args = [
      '-p', task.prompt,
      '--model', 'sonnet',
      '--output-format', 'json',
      '--max-turns', String(task.maxTurns ?? 25),
      '--allowedTools', tools,
    ];

    try {
      const { stdout } = await execFileAsync('claude', args, {
        timeout: task.timeoutMs ?? 5 * 60 * 1000,
      });

      const data = JSON.parse(stdout) as T;
      const durationMs = Date.now() - start;

      await this.logRepo.insert(taskId, 'claude-code', task.prompt, stdout, durationMs);
      return { data, durationMs, provider: 'claude-code' };
    } catch (error) {
      this.logger.error({ err: error, taskId }, 'Claude Code provider failed');
      throw error;
    } finally {
      this.runningCount--;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('claude', ['--version'], { timeout: 10_000 });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async waitForSlot(): Promise<void> {
    while (this.runningCount >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  killAll(): void {
    // SIGTERM to all tracked child processes on graceful shutdown
  }
}

// --- Fallback provider (agent/anthropic-sdk.provider.ts) ---

export class AnthropicSDKProvider implements LLMProvider {
  readonly name = 'anthropic-sdk';
  readonly capabilities: ProviderCapabilities = {
    hasPerplexity: false,
    hasWebSearch: false,
    hasFileAccess: false,
    maxTurns: 1,
  };

  constructor(
    private readonly client: Anthropic,
    private readonly logger: Logger,
    private readonly logRepo: LlmLogRepository,
  ) {}

  async run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>> {
    const start = Date.now();

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: task.prompt }],
    });

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('');

    const data = JSON.parse(text) as T;
    const durationMs = Date.now() - start;

    await this.logRepo.insert(taskId, 'anthropic-sdk', task.prompt, text, durationMs);
    return { data, durationMs, provider: 'anthropic-sdk' };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Reply with exactly: {"status":"ok"}' }],
      });
      return response.content.length > 0;
    } catch {
      return false;
    }
  }
}

// --- Provider manager (agent/provider-manager.ts) ---
// See ADR-9 for full switching logic
```

### Task Prompts

Каждый тип задачи имеет отдельный prompt template. Промпты содержат: character config, recent roasts, engagement data, target profiles.

**Target Discovery** (`agent/prompts/discover-targets.ts`):

```typescript
export function discoverTargetsPrompt(recentRoasts: string[], newsItems: string[]): string {
  return `You are a crypto Twitter research agent. Find 5 roast-worthy targets.

CONSTRAINTS:
- Currently relevant (trending, newsworthy, controversial)
- NOT already roasted: ${recentRoasts.join(', ')}
- Must have verifiable data points (price, TVL, team actions, promises)
- Priority: broken promises > price crashes > hyped launches > controversial takes

USE TOOLS:
1. Perplexity: "trending crypto controversies today" and "crypto project failures this week"
2. curl: DexScreener trending (curl -s "https://api.dexscreener.com/token-boosts/top/v1")
3. curl: CoinGecko trending (curl -s "https://api.coingecko.com/api/v3/search/trending")

OUTPUT (JSON):
{
  "targets": [{
    "name": "string",
    "type": "project | token | trend | person",
    "reason": "why roast-worthy",
    "dataPoints": ["specific facts"],
    "roastAngle": "suggested angle",
    "urgency": 1-10
  }]
}`;
}
```

**Roast Generation** (`agent/prompts/generate-roast.ts`):

```typescript
export function generateRoastPrompt(
  target: RoastTarget, context: EnrichedContext,
  character: CharacterConfig, recentRoasts: string[],
): string {
  return `Write a roast tweet as $BEEF.

CHARACTER: ${character.systemPrompt}
TARGET: ${target.name} (${target.type})
CONTEXT: ${JSON.stringify(context, null, 2)}
RECENT ROASTS (avoid repetition): ${recentRoasts.slice(0, 5).join('\\n')}

STEPS:
1. Use Perplexity: "${target.name} crypto latest news controversy" for fresh angles
2. Generate exactly 5 variants, each ≤ 280 chars
3. Each MUST reference specific data, match degen voice, no financial advice/slurs
4. Score each 1-10 on: factual specificity, humor, novelty, safety
5. Select the best

OUTPUT (JSON):
{
  "variants": [{ "text": "...", "scores": { "factual": 8, "humor": 7, "novelty": 9, "safety": 10 } }],
  "selected": 0,
  "reasoning": "why"
}`;
}
```

**Fact Verification** (`agent/prompts/verify-facts.ts`):

```typescript
export function verifyFactsPrompt(roastText: string, contextData: string): string {
  return `Fact-check this crypto roast tweet.

ROAST: "${roastText}"
CONTEXT DATA: ${contextData}

STEPS:
1. Extract every factual claim (numbers, dates, events)
2. WebSearch to verify each claim against current data
3. curl CoinGecko for live prices if price claims are made
4. Mark each: VERIFIED | OUTDATED | FALSE

OUTPUT (JSON):
{
  "claims": [{ "text": "...", "status": "VERIFIED", "evidence": "source" }],
  "overallSafe": true,
  "suggestedFix": "corrected text if false claims, null otherwise"
}`;
}
```

**Reply Crafting** (`agent/prompts/craft-reply.ts`):

```typescript
export function craftReplyPrompt(
  mention: { authorName: string; text: string },
  character: CharacterConfig, authorHistory: string[],
): string {
  return `Reply to a mention as $BEEF.

CHARACTER: ${character.systemPrompt}
FROM @${mention.authorName}: "${mention.text}"
HISTORY: ${authorHistory.length > 0 ? authorHistory.join('\\n') : 'First interaction'}

STEPS:
1. Perplexity: who is @${mention.authorName}? (crypto context)
2. If roast request → research target briefly
3. Generate reply ≤ 280 chars, in character, contextually relevant
4. If banter → match energy. If roast request → roast the target.

OUTPUT (JSON):
{
  "replyText": "...",
  "isRoastRequest": true/false,
  "targetResearched": "name or null",
  "authorContext": "note for future reference"
}`;
}
```

**Quality Audit** (`agent/prompts/audit-quality.ts`):

```typescript
export function auditQualityPrompt(
  todayRoasts: Array<{ text: string; engagement: object; target: string }>,
  weeklyTrends: object,
): string {
  return `Audit roast quality for $BEEF bot.

TODAY'S ROASTS: ${JSON.stringify(todayRoasts, null, 2)}
WEEKLY TRENDS: ${JSON.stringify(weeklyTrends, null, 2)}

ANALYZE:
1. Rate each: humor, factual depth, originality, character consistency (1-10)
2. What types get more engagement?
3. Flag weak roasts, explain why
4. Suggest 3 specific improvements for tomorrow

OUTPUT (JSON):
{
  "ratings": [{ "target": "...", "humor": 7, "factual": 8, "originality": 6, "character": 9 }],
  "topPerformer": { "target": "...", "whyItWorked": "..." },
  "patterns": ["..."],
  "improvements": ["..."],
  "characterNotes": "any drift?"
}`;
}
```

### Claude Code Agent in Each Pipeline Stage

| Stage | What Claude Code does | Tools used | Duration |
|-------|----------------------|------------|----------|
| Target discovery | Search trending, find roast-worthy events | Perplexity, curl (APIs) | 60-120s |
| Deep research | Background, controversies, data points | Perplexity, WebSearch | 60-180s |
| Roast generation | 5 variants + scoring + selection | Perplexity, Read (past roasts) | 30-60s |
| Fact verification | Extract claims, verify via web | WebSearch, curl (live prices) | 30-90s |
| Reply crafting | Research author, craft reply | Perplexity, WebSearch | 20-45s |
| Reply-guy | Research tweet context, write reply | Perplexity, WebSearch | 20-45s |
| Quality audit | Analyze engagement patterns | Read (data exports) | 60-120s |
| Character tuning | Analyze what works, suggest edits | Read (engagement, prompts) | 120-300s |
| Content strategy | Plan targets for next 24h | Perplexity, Read | 60-120s |

---

## Data Flow: Autonomous Roast (rev.2)

Полный flow от обнаружения цели до публикации:

```
1. Scheduler triggers autonomous-roast job (with human-like jitter)

2. Node.js: Check queue for pending items
   └── If empty → trigger target discovery first

3. ★ Claude Code Agent: Target Discovery (if needed)
   ├── Perplexity: "trending crypto controversies today"
   ├── curl: DexScreener trending, CoinGecko trending
   ├── Read: past roasts from SQLite export (avoid repeats)
   └── Return: 5 ranked targets as JSON

4. Node.js: TargetSelector picks best target
   ├── Check target_profiles table (already roasted recently?)
   ├── Enqueue top target with priority 'autonomous'
   └── Save others as candidates for future

5. ★ Claude Code Agent: Research + Generate + Verify (single invocation)
   ├── Perplexity: deep research on target
   ├── curl: live price/TVL data from APIs
   ├── Read: character config + past roasts for novelty
   ├── Generate 5 roast variants, score each
   ├── WebSearch: verify factual claims in top variant
   └── Return: { selectedRoast, factCheck, researchNotes }

6. Node.js: Post-processing (no LLM)
   ├── ContentFilter.check(roast) — regex, banned words, length ≤280
   ├── Rate limit check
   └── If filter fails → take next variant from agent output

7. Node.js: TwitterClient.post(finalText)
   ├── If DRY_RUN → log and return mock tweet_id
   └── Post tweet via twitter-api-v2

8. Node.js: Persist to SQLite
   ├── roasts: save roast + tweet_id
   ├── target_profiles: update last_roasted
   ├── llm_log: save agent prompt + response
   └── news_items: save research notes

9. Node.js: Events + notifications
   ├── emit('roast:posted')
   └── Telegram notify

10. Node.js: Burst check
    └── 10% chance → schedule another roast in 5-15 min
```

### Data Flow: Mention Reply (rev.2)

```
1. MentionPoller (every 10 min, ±20% jitter) finds new mentions
2. Node.js: MentionParser categorizes (roast_request | banter | other)
3. Node.js: Queue with priority 5, wait 30-90s (human-like)
4. ★ Claude Code Agent: Craft Reply
   ├── Perplexity: who is @author?
   ├── If roast request → research target
   ├── Read: past interactions with this user
   └── Return: { replyText, authorContext }
5. Node.js: ContentFilter → TwitterClient.reply()
6. Node.js: Persist (mentions, users, llm_log)
```

### Data Flow: Reply-Guy (rev.2)

```
1. Scheduler triggers (every 2.5h, ±50% jitter)
2. Node.js: Fetch recent tweets from 10-15 target accounts (< 6h old)
3. Node.js: Select most interesting tweet
4. ★ Claude Code Agent: Craft Ecosystem Reply
   ├── Perplexity: context about this topic?
   ├── Generate reply that adds value
   └── Return: { replyText }
5. Node.js: ContentFilter → TwitterClient.reply()
6. Node.js: Persist (tweets_observed, llm_log)
```

---

## Data Flow: Autonomous Roast (rev.1 — deprecated, kept for reference)

```
1. NewsMonitor.poll()
   ├── rss.source.fetch()        → NewsItem[]
   ├── dexscreener.source.fetch() → NewsItem[]
   └── twitter.source.fetch()    → NewsItem[]

2. NewsMonitor.selectTarget(items)
   ├── Deduplicate (уже роастили?)    → check roast.repository
   ├── Score by roast-worthiness       → freshness + controversy + data availability
   └── Return top target               → RoastTarget

3. QueueManager.enqueue({ target, priority: 'autonomous', source: 'news' })
   └── Persist to SQLite

4. Scheduler processes queue item:

5. ContextEnricher.enrich(target)
   ├── CoinGecko API   → price, volume, market cap, 24h change
   ├── DexScreener API → liquidity, pair age, holders
   ├── Twitter search   → recent tweets about target
   └── Return           → EnrichedContext

6. RoastEngine.generate(target, context, character)
   ├── Build prompt: character system prompt + target data + context
   ├── Claude Sonnet API call
   ├── Parse response → RoastDraft
   └── Validate length ≤ 280 chars (retry if over, max 3 attempts)

7. FactChecker.verify(draft)
   ├── Extract claims from roast text
   ├── Claude Haiku: "Are these claims factually accurate?"
   ├── If false claims found → modify or regenerate
   └── Return FactCheckResult { passed: boolean, modified?: string }

8. ContentFilter.check(draft)
   ├── Banned words/patterns (slurs, threats, doxxing)
   ├── Financial advice detection
   ├── TOS compliance
   └── Return FilterResult { passed: boolean, reason?: string }

9. TwitterClient.post(finalText)
   ├── If DRY_RUN → log and return mock tweet_id
   ├── Rate limit check → if limited, re-queue with delay
   ├── Post tweet via twitter-api-v2
   └── Return tweet_id

10. Storage: roast.repository.save({ target, text, tweet_id, timestamp })

11. Events:
    ├── emit('roast:posted', { target, tweet_id })
    ├── Health monitor: increment daily counter
    └── Telegram: "🔥 New roast posted: {text preview}"
```

---

## Data Model (SQLite) — rev.2

10 таблиц + 2 FTS5 virtual tables. Бот накапливает знания — каждый enrichment, каждый tweet, каждый LLM call записывается.

```sql
-- 001-initial.sql (core tables)

CREATE TABLE roasts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    target_name   TEXT NOT NULL,
    target_type   TEXT NOT NULL CHECK (target_type IN ('project', 'token', 'trend', 'person')),
    tweet_text    TEXT NOT NULL,
    tweet_id      TEXT,                             -- NULL if dry-run or failed
    source        TEXT NOT NULL CHECK (source IN ('autonomous', 'mention', 'burn_request', 'reply_guy')),
    status        TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'failed', 'dry_run', 'pending_approval')),
    fact_checked  INTEGER NOT NULL DEFAULT 0,
    context_data  TEXT,                             -- JSON: enriched context
    agent_output  TEXT,                             -- JSON: full Claude Code agent output (all variants)
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    likes         INTEGER DEFAULT 0,
    retweets      INTEGER DEFAULT 0,
    replies       INTEGER DEFAULT 0,
    impressions   INTEGER DEFAULT 0
);

CREATE TABLE mentions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id      TEXT NOT NULL UNIQUE,
    author_id     TEXT NOT NULL,
    author_name   TEXT NOT NULL,
    text          TEXT NOT NULL,
    request_type  TEXT CHECK (request_type IN ('roast_request', 'challenge', 'reply', 'other')),
    processed     INTEGER NOT NULL DEFAULT 0,
    response_id   TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE queue (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    target_name   TEXT NOT NULL,
    target_type   TEXT NOT NULL,
    source        TEXT NOT NULL,
    priority      INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rejected')),
    context       TEXT,
    error_message TEXT,
    attempts      INTEGER NOT NULL DEFAULT 0,
    max_attempts  INTEGER NOT NULL DEFAULT 3,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE config (
    key           TEXT PRIMARY KEY,
    value         TEXT NOT NULL,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Runtime config: 'paused', 'daily_limit', 'mention_since_id', 'moderation_mode'
```

```sql
-- 002-extended.sql (knowledge + learning tables)

-- All tweets we observe (mentions, search, reply-guy targets, engagement tracking)
CREATE TABLE tweets_observed (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id      TEXT NOT NULL UNIQUE,
    author_id     TEXT NOT NULL,
    author_name   TEXT NOT NULL,
    text          TEXT NOT NULL,
    source        TEXT NOT NULL CHECK (source IN ('mention_poll', 'search', 'reply_guy', 'engagement_track')),
    metrics       TEXT,                             -- JSON: { likes, retweets, replies, impressions }
    created_at    TEXT NOT NULL,                    -- tweet creation time
    observed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Accumulated knowledge about each target (learning loop)
CREATE TABLE target_profiles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE,
    type          TEXT NOT NULL,
    data          TEXT NOT NULL,                    -- JSON: price history, controversies, team, etc.
    roast_count   INTEGER NOT NULL DEFAULT 0,
    last_roasted  TEXT,
    last_enriched TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- LLM call log — every Claude Code Agent invocation
CREATE TABLE llm_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id       TEXT NOT NULL,                    -- e.g. 'roast_gen_1234', 'reply_5678'
    task_type     TEXT NOT NULL,                    -- 'discover', 'roast', 'verify', 'reply', 'audit', 'tune'
    prompt_hash   TEXT NOT NULL,                    -- SHA256 for dedup analysis
    response_text TEXT NOT NULL,
    duration_ms   INTEGER NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Engagement time series (hourly snapshots)
CREATE TABLE engagement_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    roast_id      INTEGER NOT NULL REFERENCES roasts(id),
    likes         INTEGER NOT NULL,
    retweets      INTEGER NOT NULL,
    replies       INTEGER NOT NULL,
    impressions   INTEGER NOT NULL,
    captured_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- All news items processed (dedup + historical context)
CREATE TABLE news_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source        TEXT NOT NULL,                    -- 'rss', 'dexscreener', 'perplexity', 'claude_research'
    title         TEXT,
    content       TEXT NOT NULL,
    url           TEXT,
    relevance     REAL,
    used_for_roast INTEGER,                        -- FK to roasts.id if used
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- People who interact with us (relationship tracking)
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    twitter_id    TEXT NOT NULL UNIQUE,
    username      TEXT NOT NULL,
    display_name  TEXT,
    follower_count INTEGER,
    bio_summary   TEXT,                            -- agent research about this person
    interaction_count INTEGER NOT NULL DEFAULT 0,
    first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
    notes         TEXT                             -- JSON: tags, burn history, sentiment
);

-- Full-text search indexes
CREATE VIRTUAL TABLE tweets_fts USING fts5(text, content=tweets_observed, content_rowid=id);
CREATE VIRTUAL TABLE roasts_fts USING fts5(tweet_text, content=roasts, content_rowid=id);

-- Regular indexes
CREATE INDEX idx_roasts_target ON roasts(target_name);
CREATE INDEX idx_roasts_created ON roasts(created_at);
CREATE INDEX idx_roasts_source ON roasts(source);
CREATE INDEX idx_mentions_processed ON mentions(processed);
CREATE INDEX idx_queue_status ON queue(status, priority DESC);
CREATE INDEX idx_tweets_author ON tweets_observed(author_id);
CREATE INDEX idx_tweets_created ON tweets_observed(created_at);
CREATE INDEX idx_target_name ON target_profiles(name);
CREATE INDEX idx_llm_type ON llm_log(task_type, created_at);
CREATE INDEX idx_engagement_roast ON engagement_snapshots(roast_id);
CREATE INDEX idx_news_source ON news_items(source, created_at);
CREATE INDEX idx_users_twitter ON users(twitter_id);
```

### What Each Table Enables

| Table | Purpose | Who writes | Who reads |
|-------|---------|-----------|-----------|
| roasts | Roast history + engagement | Node.js after post | Agent (novelty check), Learning, Admin |
| mentions | Processed mentions tracking | MentionPoller | Agent (reply context), Admin |
| queue | Task queue | All schedulers | Queue processor, Admin |
| config | Runtime settings | Telegram Admin | All modules |
| tweets_observed | All seen tweets | Poller, Search, Reply-guy | Agent (context), Learning |
| target_profiles | Accumulated target knowledge | Agent (after research) | Agent (next research), TargetSelector |
| llm_log | Agent invocation history | ClaudeCodeRunner | Quality audit agent, Metrics |
| engagement_snapshots | Engagement over time | EngagementTracker | Learning module, Quality audit |
| news_items | All processed news | NewsMonitor, Agent | Agent (dedup), TargetSelector |
| users | People who interact | Agent (after research) | Agent (reply context), Admin |
| tweets_fts | Full-text search on tweets | Auto (FTS5 triggers) | Agent, Learning |
| roasts_fts | Full-text search on roasts | Auto (FTS5 triggers) | Agent (novelty check) |

---

## Telegram Admin Bot

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/status` | Bot state: running/paused, queue size, today's roast count, rate limits | — |
| `/pause` | Pause all posting (queue accumulates) | — |
| `/resume` | Resume posting | — |
| `/roast <target>` | Add manual roast to queue (priority 8) | `/roast Solana` |
| `/queue` | Show current queue (top 10) | — |
| `/last [n]` | Show last N roasts (default 5) | `/last 3` |
| `/stats [period]` | Posting stats: total, by source, engagement avg | `/stats 7d` |
| `/config <key> <value>` | Update runtime config | `/config daily_limit 3` |
| `/dryrun on\|off` | Toggle dry-run mode | `/dryrun on` |
| `/health` | Full health check: APIs, DB, rate limits | — |
| `/approve <queue_id>` | Manually approve queued roast (for moderation mode) | `/approve 42` |

### Notification Types

| Event | When | Format |
|-------|------|--------|
| Roast posted | After every tweet | `🔥 [target]: "roast text..." (tweet link)` |
| Rate limited | Twitter returns 429 | `⚠️ Rate limited. Pausing {N}min. Remaining: {X} requests` |
| Error | Unhandled exception | `🚨 Error in {module}: {message}` |
| Daily summary | 23:00 UTC | `📊 Today: {N} roasts, {M} mentions, avg {E} engagement` |
| Queue alert | Queue > 20 items | `📬 Queue growing: {N} items. Oldest: {age}` |

### Implementation

```typescript
// admin/telegram.bot.ts
import TelegramBot from 'node-telegram-bot-api';

export class AdminBot {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly deps: {
      queueManager: QueueManager;
      roastRepository: RoastRepository;
      healthMonitor: HealthMonitor;
      scheduler: Scheduler;
    },
  ) {}

  async start(): Promise<void> { /* register handlers, start polling */ }
  async stop(): Promise<void> { /* stop polling, flush pending */ }
  async notify(message: string): Promise<void> { /* send to admin chat */ }
}
```

**Package:** `node-telegram-bot-api` ($5M downloads/month, well-maintained, TypeScript types available via `@types/node-telegram-bot-api`).

---

## Content Pipeline — Deep Dive (rev.2)

### rev.2 vs rev.1

В rev.1 pipeline был: 4 API calls (enrichment) → Claude Sonnet API (generate) → Claude Haiku (fact-check) → regex (filter). **6 отдельных шагов, 6 потенциальных точек отказа.**

В rev.2: Claude Code Agent делает research + generate + verify **в одном agentic session**. Agent имеет доступ к Perplexity MCP, WebSearch, curl, и локальной knowledge base. Один invocation заменяет 5 API calls. Content filter остаётся в Node.js (deterministic, no LLM).

### Roast Engine (rev.2)

```typescript
// roast/roast.engine.ts — orchestrates Claude Code Agent for roast generation
export class RoastEngine {
  constructor(
    private readonly agentRunner: ClaudeCodeRunner,
    private readonly characterLoader: CharacterLoader,
    private readonly targetRepo: TargetRepository,
    private readonly roastRepo: RoastRepository,
    private readonly logger: Logger,
  ) {}

  async generateRoast(target: RoastTarget): Promise<AgentRoastOutput> {
    const character = await this.characterLoader.load();
    const recentRoasts = await this.roastRepo.getRecent(10);
    const targetProfile = await this.targetRepo.getByName(target.name);

    const prompt = generateRoastPrompt(target, character, recentRoasts, targetProfile);

    // Single Claude Code invocation: research + generate 5 variants + fact-check best
    const result = await this.agentRunner.run<AgentRoastOutput>('roast', {
      prompt,
      maxTurns: 25,
      timeoutMs: 3 * 60 * 1000,  // 3 min
    });

    // Update target profile with research findings
    if (result.data.researchNotes) {
      await this.targetRepo.upsert(target.name, result.data.researchNotes);
    }

    return result.data;
  }
}

// Types
export interface AgentRoastOutput {
  variants: Array<{ text: string; scores: { factual: number; humor: number; novelty: number; safety: number } }>;
  selected: number;
  reasoning: string;
  factCheck: { claims: Array<{ text: string; status: string }>; overallSafe: boolean; suggestedFix?: string };
  researchNotes?: string;  // saved to target_profiles for future enrichment
}
```

**5 variants instead of 3.** Claude Max = unlimited tokens. Нет причины экономить. Больше вариантов = выше вероятность золотого роаста.

**Agent scores variants internally.** В rev.1 scoring был в Node.js с regex-based heuristics (`hasDataPoint`, `estimateHumor`). В rev.2 Claude Code Agent оценивает каждый вариант по factual specificity, humor, novelty, safety — используя реальное понимание текста, а не regex patterns.

### Content Filter (stays in Node.js — deterministic, no LLM)

```typescript
// content/content.filter.ts — identical to rev.1
const BANNED_PATTERNS = [
  /\b(kill|die|death threat)\b/i,
  /\b(n-word|slur patterns)\b/i,
  /\b(buy|sell|invest|financial advice)\b/i,
  /\b(doxx|address|phone|ssn)\b/i,
];

const MAX_TWEET_LENGTH = 280;
const MAX_TICKER_MENTIONS = 2;

export class ContentFilter {
  check(text: string): FilterResult {
    if (text.length > MAX_TWEET_LENGTH) return { passed: false, reason: 'Too long' };
    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(text)) return { passed: false, reason: `Banned pattern: ${pattern}` };
    }
    const tickerCount = (text.match(/\$[A-Z]{2,10}/g) || []).length;
    if (tickerCount > MAX_TICKER_MENTIONS) {
      return { passed: false, reason: `Ticker spam: ${tickerCount} tickers` };
    }
    return { passed: true };
  }
}
```

**Content filter is the last safety net.** Even if Claude Code Agent generates something that passes its own safety check, Node.js regex filter catches anything that slipped through. Defense in depth.

### Why Not Just Use Claude API Directly?

| | Claude API call | Claude Code Agent |
|---|---|---|
| Can search the web | No | Yes (Perplexity, WebSearch) |
| Can check live prices | No (need separate API call) | Yes (curl to CoinGecko) |
| Can read past roasts | No (need to include in prompt) | Yes (Read local files/DB) |
| Can verify its own claims | No | Yes (WebSearch after generating) |
| Multi-step reasoning | Single turn | 25+ turns, self-correcting |
| Cost with Claude Max | $0 (included) | $0 (included) |
| Latency | 2-5s | 30-120s |

**Latency is a feature, not a bug.** A 1-2 minute response time looks MORE human than instant replies.

---

## Scheduler Design (rev.2 — human-like)

### Job Types

Все jobs с Claude Code invocations имеют aggressive jitter + quiet hours. Mechanistic jobs (health, engagement) имеют minimal jitter.

| Job | Base | Jitter | Quiet hrs | Burst | Uses Agent | Description |
|-----|------|--------|-----------|-------|------------|-------------|
| `autonomous-roast` | 3h | ±40% | 3x slow | 10% | Yes | Research + generate + verify + post |
| `poll-mentions` | 10 min | ±20% | no change | — | No | Twitter API poll, queue new mentions |
| `process-queue` | 2 min | none | no change | — | Triggers | Process next queue item → spawns agent |
| `reply-guy` | 2.5h | ±50% | 3x slow | 15% | Yes | Find tweet, research, reply |
| `target-discovery` | 4h | ±60% | skip | — | Yes | Perplexity research, find candidates |
| `content-strategy` | 24h | ±2h | skip | — | Yes | Plan next day's targets |
| `quality-audit` | 24h | ±3h | skip | — | Yes | Review today's roasts, patterns |
| `character-tune` | 7d | ±24h | skip | — | Yes | Weekly prompt optimization |
| `engagement-track` | 1h | ±10% | no change | — | No | Update engagement metrics |
| `daily-summary` | 24h | fixed 23:00 UTC | — | — | No | Telegram stats |
| `health-check` | 5 min | none | — | — | No | API pings, DB check |

### Estimated Daily Activity

| Time block (UTC) | Originals | Replies | Agent calls | Notes |
|---|---|---|---|---|
| 00:00-02:00 | 0-1 | 3-5 | 2-4 | Late evening activity |
| 02:00-06:00 | 0 | 0-2 | 0-1 | Quiet hours (3x delay) |
| 06:00-10:00 | 1-2 | 5-10 | 4-8 | Morning ramp-up |
| 10:00-16:00 | 2-3 | 10-20 | 8-15 | Peak hours (US morning + EU afternoon) |
| 16:00-20:00 | 1-2 | 8-12 | 5-10 | Afternoon/evening |
| 20:00-00:00 | 1-2 | 5-8 | 3-6 | Evening wind-down |
| **Daily total** | **5-10** | **31-57** | **22-44** | **~50-67 writes/day** |

### Rate-Limit-Aware Scheduling (rev.2)

Twitter Basic tier limits:

| Operation | Limit | Window |
|-----------|-------|--------|
| POST tweet (user-level) | **3,000/month** ≈ 100/day | rolling |
| GET search/recent | 450 req | 15 min (app) |
| GET mentions timeline | 75 req | 15 min (user) |
| Monthly read budget | ~15,000 tweets | month |

**Rev.2 budget:**
- Writes: 50-67/day = **1,500-2,010/month** (50-67% utilization). Safe margin.
- Reads: polls + search + engagement = ~6,000/month (40% utilization). Safe.

**When rate limited (429):**
1. Parse `x-rate-limit-reset` header
2. Pause specific job type (not all jobs)
3. Send Telegram alert
4. Resume after reset time + 60s buffer

---

## Reply-Guy Strategy (Algorithm Boost)

Бот ведёт себя как активный участник CT. replies:originals ratio > 3:1. Replies weighted 13.5x vs like.

### How It Works (rev.2)

```
1. Maintain list of 10-15 target accounts (ecosystem projects, KOLs, competitors)
2. Every 2.5h (±50% jitter): fetch recent tweets from targets (< 6h old)
3. Node.js selects most interesting tweet (highest engagement, most controversial)
4. ★ Claude Code Agent: research context + craft reply
   ├── Perplexity: what's this tweet about? Recent context?
   ├── Generate reply that adds value (data, counter-argument, roast commentary)
   └── Return reply text
5. Node.js: ContentFilter → TwitterClient.reply()
6. Track: which accounts replied to, frequency per account (max 2/day per account)
```

### Why This Matters

- **Account survival:** Bot that only broadcasts = instant bot flag
- **Growth:** Replies to high-follower accounts expose bot to their audience
- **Algorithm:** Reply creates engagement loop → 150x weight if target replies back
- **Content variety:** Breaks the "only posts roasts" pattern that Grok flags

---

## Health Monitoring

### Health Check Endpoints

```typescript
// health/health.monitor.ts
export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'down';
  checks: {
    twitter: { status: 'ok' | 'error'; latencyMs: number; rateLimitRemaining: number };
    claude: { status: 'ok' | 'error'; latencyMs: number };
    database: { status: 'ok' | 'error'; sizeBytes: number };
    queue: { pending: number; failed: number; oldestMinutes: number };
  };
  stats: {
    roastsToday: number;
    mentionsToday: number;
    errorsToday: number;
    uptimeSeconds: number;
  };
}
```

### Alerting Rules

| Condition | Action |
|-----------|--------|
| Twitter API returns 401/403 | 🚨 CRITICAL: auth failure → Telegram alert → pause posting |
| Claude API error 3x in row | ⚠️ Pause roast generation, continue other jobs |
| SQLite write fails | 🚨 CRITICAL: DB corruption → stop bot, alert |
| Queue > 50 items | ⚠️ Queue backing up → alert, check rate limits |
| 0 roasts posted in 24h | ⚠️ Silent failure → investigate |
| Process memory > 500MB | ⚠️ Memory leak → alert, auto-restart via PM2 |

---

## Security

### API Key Management

| Secret | Storage | Rotation |
|--------|---------|----------|
| Twitter API keys | `.env` file, 600 permissions | Manual, monthly recommended |
| Claude API key | `.env` file | Manual |
| Telegram bot token | `.env` file | On compromise |
| Base RPC URL | `.env` file (public endpoint OK for reads) | N/A |

### Anti-Gaming (Phase 2)

- **Burn request spam:** Minimum burn amount + cooldown per wallet (1 request/hour)
- **Challenge spam:** Minimum stake + 24h cooldown per address
- **Rate limiting roast targets:** Same target max 1x/week

### IP Management

- **Residential proxy** for Twitter API ($10-20/mo) — Hetzner datacenter IPs get flagged
- Rotate proxy per session, not per request
- Fallback to direct connection if proxy fails (with monitoring)

---

## Testing Strategy

### Test Pyramid

```
           ┌──────────┐
           │   E2E    │  5-10 tests: full pipeline in dry-run
          ┌┴──────────┴┐
          │ Integration │  20-30 tests: module combinations
         ┌┴────────────┴┐
         │  Unit Tests   │  100+ tests: individual functions
         └──────────────┘
```

### Unit Tests

**What to test directly (no mocks):**
- `content.filter.ts` — pure function, deterministic
- `jitter.ts` — pure math (test statistical distribution)
- `mention.parser.ts` — pure parsing logic
- `env.validation.ts` — Zod schema (pass/fail cases)
- `error.util.ts` — getErrorMessage, retryWithBackoff timing

**What to test with mocks:**
- `twitter.client.ts` — mock `twitter-api-v2` responses
- `roast.engine.ts` — mock Claude API responses
- `fact.checker.ts` — mock Claude Haiku responses
- `news.monitor.ts` — mock RSS/DexScreener responses
- `queue.manager.ts` — mock SQLite (or use in-memory SQLite)
- `telegram.bot.ts` — mock Telegram API

### Testing LLM Output (Non-Deterministic)

Нельзя assert на конкретный текст. Вместо этого:

```typescript
// roast/roast.engine.spec.ts
describe('RoastEngine', () => {
  it('generates roast under 280 chars', async () => {
    const engine = new RoastEngine(mockConfig, mockLogger);
    // Mock Claude to return realistic response
    mockClaude.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: 'ser your TVL dropped 94% and youre tweeting about partnerships ngmi 💀' }],
    });

    const draft = await engine.generate(target, context);
    expect(draft.text.length).toBeLessThanOrEqual(280);
  });

  it('retries when response exceeds 280 chars', async () => {
    mockClaude.messages.create
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'A'.repeat(300) }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Short roast' }] });

    const draft = await engine.generate(target, context);
    expect(mockClaude.messages.create).toHaveBeenCalledTimes(2);
    expect(draft.text.length).toBeLessThanOrEqual(280);
  });

  it('throws after max retries exceeded', async () => {
    mockClaude.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: 'A'.repeat(300) }],
    });

    await expect(engine.generate(target, context)).rejects.toThrow('Failed to generate');
    expect(mockClaude.messages.create).toHaveBeenCalledTimes(3);
  });
});
```

### Content Quality Tests (Golden Set)

```typescript
// content/content-quality.spec.ts
const GOLDEN_ROASTS = [
  {
    target: 'Solana',
    context: { price: { change24h: -15 }, market: { mcap: 50_000_000_000 } },
    expectations: {
      maxLength: 280,
      mustNotContain: ['financial advice', 'buy', 'sell', 'invest'],
      shouldContain: ['$SOL', 'data-specific-reference'],
      mustNotMatchPatterns: [/\$\w+ \$\w+ \$\w+/], // no ticker spam
    },
  },
  // ... 50+ cases
];

describe.each(GOLDEN_ROASTS)('Golden roast: $target', ({ target, context, expectations }) => {
  it('passes content filter', () => {
    const filter = new ContentFilter(mockLogger);
    const mockRoast = generateMockRoast(target, context);
    expect(filter.check(mockRoast).passed).toBe(true);
  });
});
```

### Integration Tests

```typescript
// integration/pipeline.spec.ts
describe('Content Pipeline', () => {
  let pipeline: ContentPipeline;

  beforeEach(() => {
    const db = new Database(':memory:');  // in-memory SQLite
    // ... setup with mocked external APIs
  });

  it('autonomous roast: news → queue → generate → check → filter → save', async () => {
    // Mock news source returns a target
    mockRss.fetch.mockResolvedValue([newsItem]);
    // Mock Claude returns valid roast
    mockClaude.messages.create.mockResolvedValue(validRoastResponse);

    await pipeline.processAutonomousRoast();

    // Verify full pipeline executed
    expect(mockRss.fetch).toHaveBeenCalled();
    expect(mockClaude.messages.create).toHaveBeenCalledTimes(2);  // generate + fact-check
    expect(db.prepare('SELECT * FROM roasts').all()).toHaveLength(1);
  });

  it('mention reply: poll → parse → enrich → generate → post reply', async () => {
    mockTwitter.pollMentions.mockResolvedValue([mentionFixture]);
    mockClaude.messages.create.mockResolvedValue(validRoastResponse);

    await pipeline.processMentions();

    expect(mockTwitter.reply).toHaveBeenCalledWith(
      mentionFixture.id,
      expect.stringMatching(/.{1,280}/),
    );
  });
});
```

### E2E Tests (Dry-Run)

```typescript
// e2e/bot.e2e.spec.ts
describe('Bot E2E (dry-run)', () => {
  it('completes full autonomous cycle without errors', async () => {
    process.env.DRY_RUN = 'true';
    // Use real Claude API but mock Twitter
    const bot = await createBot(testConfig);
    await bot.runAutonomousCycle();

    // Verify no errors logged
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error' }),
    );
  });
});
```

### Test Commands

```bash
pnpm test                    # Unit tests (fast, no external deps)
pnpm test:integration        # Integration tests (in-memory SQLite)
pnpm test:e2e                # E2E dry-run (needs ANTHROPIC_API_KEY)
pnpm test:cov                # Coverage report
pnpm test:quality            # Content quality golden set
```

**vitest.config.ts update:**

```typescript
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],              // unit
    // Named configs for different test types:
  },
});

// vitest.config.integration.ts
export default defineConfig({
  test: {
    include: ['src/**/*.integration.spec.ts'],
    testTimeout: 30_000,
  },
});
```

---

## Implementation Milestones (rev.2)

### Milestone 1: Core + Agent Pipeline (MVP) — 4-5 days

**Goal:** Bot generates roasts via Claude Code Agent and posts in dry-run mode.

| Task | File(s) | Est. |
|------|---------|------|
| Shared types + interfaces | `common/types/index.ts` | 2h |
| SQLite setup + migrations (001 + 002) | `storage/database.ts`, `migrations/*` | 4h |
| Repositories (roast, mention, queue, target, llm_log, user, tweet) | `storage/repositories/*` | 5h |
| Claude Code Runner | `agent/claude-code.runner.ts` | 3h |
| Prompt templates (roast, verify, discover) | `agent/prompts/*` | 3h |
| Character config + loader | `characters/beef.json`, `roast/character.loader.ts` | 2h |
| Roast engine (orchestrates agent) | `roast/roast.engine.ts` | 3h |
| Content filter (regex, no LLM) | `content/content.filter.ts` | 2h |
| Twitter client (post + reply + poll) | `twitter/twitter.client.ts`, `rate-limiter.ts` | 4h |
| Bootstrap + wiring | `bootstrap.ts` | 2h |
| Unit tests for all above | `*.spec.ts` | 6h |

**Test gate:** `pnpm test` — all pass. Generate 50 roasts in dry-run via Claude Code Agent, review quality. Agent invocation works reliably.

### Milestone 2: Scheduling + Mentions — 3-4 days

**Goal:** Bot runs autonomously with human-like jitter. Polls mentions, replies via agent.

| Task | File(s) | Est. |
|------|---------|------|
| Human-like jitter module | `scheduler/jitter.ts` | 3h |
| Scheduler with all job types | `scheduler/scheduler.ts` | 4h |
| Mention polling + parser | `twitter/mention.parser.ts`, mention.repository | 3h |
| Queue manager | `queue/queue.manager.ts`, queue.repository | 3h |
| Reply prompt template | `agent/prompts/craft-reply.ts` | 2h |
| Target discovery prompt | `agent/prompts/discover-targets.ts` | 2h |
| Target selector | `roast/target.selector.ts` | 2h |
| News monitor (RSS + DexScreener) | `news/sources/*` | 4h |
| Graceful shutdown (with agent kill) | `index.ts` | 2h |
| Integration tests | `*.integration.spec.ts` | 5h |

**Test gate:** Bot runs 2h in dry-run. Agent invocations succeed with jitter. Mentions detected and queued. Queue processing works. No crashes.

### Milestone 3: Telegram Admin + Health — 2 days

**Goal:** Full admin control via Telegram. Health monitoring with alerts.

| Task | File(s) | Est. |
|------|---------|------|
| Telegram bot setup | `admin/telegram.bot.ts` | 3h |
| Command handlers (11 commands) | `admin/telegram.commands.ts` | 4h |
| Health monitor | `health/health.monitor.ts` | 2h |
| Metrics collector | `health/metrics.ts` | 2h |
| Alert routing (events → Telegram) | Wire events in bootstrap.ts | 2h |

**Test gate:** `/status`, `/roast`, `/pause`/`resume`, `/queue` work. Alerts fire on simulated errors.

### Milestone 4: Reply-Guy + Learning — 2-3 days

**Goal:** Bot engages with ecosystem. Learning module analyzes what works.

| Task | File(s) | Est. |
|------|---------|------|
| Reply-guy scheduler job | New scheduler job + prompt | 3h |
| Engagement tracker | `learning/engagement.tracker.ts` | 3h |
| Learning module | `learning/learning.module.ts` | 3h |
| Quality audit prompt | `agent/prompts/audit-quality.ts` | 2h |
| Character tuning prompt | `agent/prompts/tune-character.ts` | 2h |
| Content strategy prompt | `agent/prompts/plan-content.ts` | 2h |
| Daily summary job | Telegram notification | 1h |
| E2E tests (dry-run full cycle) | `e2e/*.spec.ts` | 4h |

**Test gate:** Bot runs 24h on VPS in dry-run. All jobs execute with jitter. Quality audit agent runs. Learning module records engagement.

### Milestone 5: Deploy + Go Live — 1-2 days

| Task | Description |
|------|-------------|
| Server setup | pnpm, MCP config, .env, migrations on Hostinger |
| PM2 ecosystem config | `ecosystem.config.js` with memory limits |
| Sentry integration | `common/utils/sentry.ts` |
| Create Twitter account | Handle, profile, bot label, X Premium |
| Configure residential proxy | For Twitter API calls from Hostinger |
| SQLite backup cron | Daily backup to separate directory |
| First 3 days: moderation mode | All roasts require `/approve` via Telegram |
| First 5 real roasts | Monitor quality, engagement, no bans |
| Announce in CT | Co-founder Nikita Voronin promotes via his network |

### Milestone 6: Token + Phase 2 — after 200+ followers

| Task | Description |
|------|-------------|
| Launch $BEEF via Bankr | ERC-20 + Uniswap V3 pool on Base |
| Token monitor module | `token/token.monitor.ts` — price, volume, burns |
| Burn-to-roast flow | Smart contract listener → queue item |
| Farcaster integration | Secondary channel via Neynar SDK |
| Challenge/voting system | Snapshot.org integration |

---

## Dependencies (rev.2)

### Production

| Package | Purpose | Why |
|---------|---------|-----|
| `twitter-api-v2` | Twitter API client | Typed, v1.1+v2 support, actively maintained |
| `viem` | Base chain interaction | Type-safe, tree-shakable, standard for Base |
| `zod` | Validation | Already used for env, extend to all inputs |
| `pino` + `pino-pretty` | Logging | Structured JSON in prod, pretty in dev |
| `better-sqlite3` | Database | Synchronous, fast, zero-config |
| `cron` | Job scheduling | Lightweight cron parser |
| `node-telegram-bot-api` | Telegram admin | Mature, polling-based |
| `rss-parser` | RSS feeds | Standard RSS/Atom parser |
| `dotenv` | Env loading | Already used |
| `@sentry/node` | Error tracking | Crash reporting |

**Removed:** `@anthropic-ai/sdk` — no longer needed. All LLM calls go through Claude Code CLI subprocess, not direct API.

### Development

| Package | Purpose |
|---------|---------|
| `vitest` + `@vitest/coverage-v8` | Testing |
| `typescript` + `tsx` | Type checking + dev runner |
| `eslint` + `typescript-eslint` | Linting |
| `prettier` | Formatting |
| `husky` + `lint-staged` | Pre-commit hooks |
| `@types/better-sqlite3` | SQLite types |
| `@types/node-telegram-bot-api` | Telegram types |

### System Dependencies (on VPS)

| Tool | Purpose | Install |
|------|---------|---------|
| `claude` CLI | Claude Code Agent subprocess | Already installed (v2.1.72) |
| Perplexity MCP | Deep research via agent | Configure in `~/.claude/mcp.json` |
| `pnpm` | Package manager | `npm install -g pnpm` |
| `pm2` | Process manager | Already installed |
| `sqlite3` | Database CLI (debug) | Already installed (3.45.1) |

### New Dependencies to Add

```bash
pnpm add better-sqlite3 node-telegram-bot-api rss-parser
pnpm add -D @types/better-sqlite3 @types/node-telegram-bot-api
# Note: @anthropic-ai/sdk removed — agent uses claude CLI, not direct API
```

---

## VPS: Hostinger

Verified 2026-03-15.

| Parameter | Value |
|-----------|-------|
| IP | <redacted> |
| OS | Ubuntu 24.04 LTS, kernel 6.8.0 |
| CPU | 2 vCPU |
| RAM | 7.8 GB total, 5.4 GB available |
| Swap | 2 GB |
| Disk | 96 GB total, 59 GB free |
| Node.js | v22.22.1 |
| Claude Code CLI | v2.1.72 (`~/.local/bin/claude`) |
| PM2 | installed (`~/.npm-global/bin/`) |
| SQLite3 | 3.45.1 |
| Docker | 29.3.0 |
| pnpm | **not installed** — `npm install -g pnpm` needed |

### Server Setup Checklist

```bash
# 1. Install pnpm
npm install -g pnpm

# 2. Add npm-global to PATH (for PM2, pnpm)
echo 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# 3. Configure Claude Code MCP (Perplexity)
# Edit ~/.claude/mcp.json on server — must have perplexity-ask MCP server

# 4. Clone repo and install
git clone https://github.com/nikitacometa/twitter-agents.git
cd twitter-agents/beef
pnpm install

# 5. Create .env from template
cp .env.example .env
# Fill in: TWITTER_*, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, etc.

# 6. Run migrations
pnpm tsx src/storage/migrations/run.ts

# 7. Start with PM2
pm2 start ecosystem.config.js
pm2 save
```

### Resource Budget

| Process | RAM | CPU | Notes |
|---------|-----|-----|-------|
| Node.js bot (PM2) | 100-200 MB | ~0% idle, 5% active | Always running |
| Claude Code invocation (peak) | 200-400 MB | 30-50% | 22-44 invocations/day, each 20-180s |
| Claude Code concurrent max | 2 processes | — | Queue if both slots busy |
| SQLite | negligible | negligible | Single file on disk |
| **Total peak** | **700 MB – 1 GB** | **50-100%** | Peaks are brief (during agent runs) |
| **Available headroom** | **4.4 GB free** | 1 vCPU free | Plenty of margin |

### Existing Processes on Server

| PM2 ID | Name | Status | Notes |
|--------|------|--------|-------|
| 0 | `auto-claude-team` | errored (520 restarts) | Should be stopped/removed |
| 1 | `review-autopilot` | online 43h | Check if still needed |

Before deploying: `pm2 delete auto-claude-team` to free resources.

---

## Performance Budget (rev.2)

| Metric | Target | Alarm | Notes |
|--------|--------|-------|-------|
| Node.js memory | < 200 MB | > 400 MB | Persistent process |
| Peak memory (with agent) | < 800 MB | > 1.2 GB | During Claude Code runs |
| SQLite DB size | < 500 MB/year | > 1 GB | More tables than rev.1 |
| Claude API cost | **$0** (Claude Max) | — | Unlimited tokens |
| Twitter API writes | < 70% of 3K/mo | > 85% | ~2,000/month target |
| Twitter API reads | < 50% of 15K/mo | > 75% | ~6,000/month target |
| Agent invocation time | < 3 min | > 5 min | Per single invocation |
| Reply latency (mention → post) | 30s – 3 min | > 5 min | Includes poll interval + agent time |
| Bot startup time | < 10s | > 30s | Includes migration check |
| Uptime | > 99.5% | < 99% | PM2 auto-restart |
| Monthly recurring cost | **$208/mo** | > $300/mo | See budget breakdown below |

### Monthly Budget (rev.2)

| Item | Cost | Notes |
|------|------|-------|
| Twitter API Basic | $200/mo | 3,000 writes, 15K reads |
| X Premium | $8/mo | 4x reach boost |
| Claude API | **$0** | Claude Max subscription |
| Perplexity MCP | **$0** | Included in existing subscription |
| VPS (Hostinger) | **$0** | Existing server, shared |
| **Total** | **$208/mo** | Down from $304-336 in rev.1.5 |

**Claude Max changes everything.** Rev.1 budget was dominated by Claude API costs ($80-100/mo projected). With Claude Max, LLM costs are zero. This enables:
- 5 variants per roast instead of 3
- Claude Code Agent for every task (research, generation, verification, replies)
- Daily quality audits + weekly character tuning — free
- No incentive to use cheaper/weaker models for any task

---

## Startup Sequence (Fail-Fast) — rev.2

```typescript
// index.ts
const config = validateEnv();                           // 1. Env validation
const db = new Database(config.DB_PATH);                // 2. SQLite connection
await db.migrate();                                     // 3. Run migrations (001 + 002)
await twitterClient.verifyCredentials();                // 4. Twitter auth check

// 5. Claude Code CLI check — verify it's installed and can run
const { stdout } = await execFileAsync('claude', ['--version']);
logger.info({ version: stdout.trim() }, 'Claude Code CLI verified');

// 6. Quick agent test — verify MCP access
const testResult = await agentRunner.run('startup_check', {
  prompt: 'Reply with exactly: {"status":"ok"}',
  maxTurns: 1,
  timeoutMs: 30_000,
});
logger.info('Claude Code Agent verified');

logger.info('All systems verified. Starting bot...');   // 7. Start scheduler
```

**Added in rev.2:** Steps 5-6 verify Claude Code CLI is available and can spawn agents. Without this, the bot would start but fail silently on every agent invocation.

---

## CI/CD

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: beef
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm', cache-dependency-path: beef/pnpm-lock.yaml }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint:check
      - run: pnpm test -- --reporter=verbose
        env:
          NODE_ENV: test
          ANTHROPIC_API_KEY: sk-ant-test-placeholder
          TWITTER_USERNAME: test_user
          TWITTER_PASSWORD: test_pass
          TWITTER_EMAIL: test@example.com
      - run: pnpm test:cov
        env:
          NODE_ENV: test
          ANTHROPIC_API_KEY: sk-ant-test-placeholder
          TWITTER_USERNAME: test_user
          TWITTER_PASSWORD: test_pass
          TWITTER_EMAIL: test@example.com
```

### Coverage Thresholds

| Metric | Target | Rationale |
|--------|--------|-----------|
| Lines | 70% | Reasonable for a bot with many external integration points |
| Functions | 75% | All public functions tested |
| Branches | 65% | Error paths may be hard to cover without real API failures |

---

## Open Questions

1. **Character config format** — JSON или TypeScript object? **Recommendation:** JSON with Zod validation at load time. Agent reads it via `Read` tool.

2. **Image generation** — Twitter playbook says images get 2.8x engagement. **Recommendation:** Phase 1.5 — agent can be extended to generate image descriptions for DALL-E/Midjourney.

3. **Thread support** — **Decision: No.** Single tweets. Threads dilute the "short and lethal" brand.

4. **Character mood variation** — Agent can vary style per roast based on context. Prompt includes mood instruction. Weekly tuning agent adjusts moods based on engagement data.

5. **Moderation mode** — First 3 days: `/approve` required via Telegram. Solved.

6. **Claude Code CLI stability on long-running VPS** — Claude Code CLI may need periodic re-auth. Monitor for auth failures and alert via Telegram. Add `claude --version` to health check.

7. **Concurrent agent limit** — Set to 2 (VPS has 2 vCPU). Monitor if queue backs up under load. Increase if VPS is upgraded.

8. **Perplexity MCP rate limits** — Unknown. Monitor for 429s from Perplexity and implement backoff in agent prompts.

9. **Agent output parsing robustness** — Claude Code `--output-format json` sometimes includes non-JSON preamble. Need robust JSON extraction from stdout (find first `{`, parse from there).

---

## Expert Panel Findings

Три специализированных агента проанализировали архитектуру параллельно. Ключевые выводы:

### Крипто/Twitter эксперт

1. **AIXBT паттерн:** RAG-пайплайн (400+ KOL мониторинг → NLP агрегация → LLM синтез). Для $BEEF аналог — мониторинг 10-15 целевых аккаунтов для reply-guy стратегии.

2. **Truth Terminal паттерн:** Human-in-the-loop. Andy Ayrey генерирует 8-10 вариантов, выбирает лучший вручную. **Вывод:** в первые 3 дня бот работает в moderation mode (Telegram `/approve`), потом переходит в автономный режим.

3. **DefiLlama** — бесплатный источник TVL данных (без ключа, без лимитов). Agent может вызвать через curl.

4. **User-level write limit = 3,000/month** (не 50K app-level). При 50-67 writes/day = 1,500-2,010/month — safe margin.

### Архитектор

1. **`bootstrap.ts`** — отдельный файл для wiring зависимостей. ✅ Принято в rev.2.

2. **Rate limiter как отдельный класс** — Token Bucket алгоритм в `twitter/rate-limiter.ts`. ✅ Принято в rev.2.

3. **Target selector** — `roast/target.selector.ts` выбирает лучшую цель. ✅ Принято в rev.2.

4. **Prompt builder** — В rev.2 промпты живут в `agent/prompts/` как template functions. Тестируемо: можно assert промпт без запуска agent.

### Тестировщик

1. **Три правила:** (a) Тест должен мочь упасть (b) Детерминизм через контракты (c) Внешние API изолируются.

2. **Golden roasts** — `roast/golden/roasts.golden.json` с 50+ эталонными роастами.

3. **In-memory SQLite для integration тестов** — `new Database(':memory:')`.

4. **Claude Code Agent mocking** — в тестах mock `execFile` для `claude` CLI. Return предсказуемый JSON output. Не вызывать реальный agent в unit tests.

5. **E2E dry-run** — `DRY_RUN=true` + реальный Claude Code Agent + mock Twitter. Один полный цикл перед каждым deployment.

---

## Rev.2 Summary: What Changed

| Aspect | Rev.1 | Rev.2 |
|--------|-------|-------|
| LLM integration | Direct Claude API calls (Sonnet + Haiku) | Claude Code Agent subprocess |
| Research | 4 API calls (CoinGecko, DexScreener, DefiLlama, Twitter) | Perplexity MCP + WebSearch + APIs (via agent) |
| Fact checking | Claude Haiku API call | Agent with WebSearch verification |
| Roast variants | 3 | 5 |
| Replies per day | ~20 | 40-60 |
| Originals per day | 3-5 | 5-10 |
| SQLite tables | 4 | 10 + 2 FTS5 |
| Learning loop | None | Daily quality audit + weekly character tuning |
| Scheduling | Simple jitter | Human-like (quiet hours, bursts, distraction delays) |
| LLM cost | ~$80-100/month | $0 (Claude Max) |
| Monthly total | ~$304-336 | **$208** |
| VPS | Hetzner (planned) | Hostinger (existing, verified) |
| Dependencies | `@anthropic-ai/sdk` | `claude` CLI (primary) + `@anthropic-ai/sdk` (fallback) |
