# $BEEF Bot — Technical Launch Plan

**Date:** 2026-03-17
**Version:** 1.0
**Sources:** Codebase audit, VPN/anti-detection research, Telegram bot design research, blockchain integration research, strategy-v5-pivot.md

---

## Текущее состояние кодовой базы

### Готово (foundation layer)

| Компонент | Файлы | Описание |
|-----------|-------|----------|
| Domain types | `common/types/index.ts` (180 строк) | RoastTarget, QueueItem, Mention, TargetProfile, EngagementSnapshot, NewsItem, TwitterUser, RuntimeConfig, ObservedTweet |
| SQLite + migrations | `storage/database.ts`, `migrations/001-initial.sql`, `002-extended.sql` | 10 таблиц, 2 FTS5 virtual tables, FTS triggers, 14 indexes, WAL mode |
| Repositories (7) | `storage/repositories/*.ts` | roast, mention, queue, target, llm_log, user, config + tweet — prepared statements, FTS search |
| LLM Provider | `agent/claude-code.provider.ts`, `agent/anthropic-sdk.provider.ts`, `agent/provider-manager.ts` | ClaudeCode subprocess (claude CLI) + Anthropic SDK fallback. ProviderManager: primary → degraded → paused. 31 тест |
| Error utils | `common/utils/error.util.ts` | getErrorMessage() + retryWithBackoff() с exponential backoff + jitter |
| Env validation | `common/config/env.validation.ts` | Zod schema + superRefine (Twitter API OR cookie auth, production requires Sentry + Telegram) |
| Logger | `common/utils/logger.ts` | pino + pino-pretty (dev) |
| Project scaffold | tsconfig (strict), eslint, vitest, husky, lint-staged, prettier | Path aliases: @common, @agent, @twitter, @roast, @news, @content, @storage, @queue, @scheduler |

### Не построено (application layer)

| Компонент | Статус | Критичность |
|-----------|--------|-------------|
| Twitter client + rate limiter | Пусто | **Блокер** — без этого бот не постит |
| Roast engine | Пусто | **Блокер** — без этого нет контента |
| Content filter | Пусто | **Блокер** — без этого риск бана |
| Agent prompts (craft-roast) | Пусто | **Блокер** — без этого LLM не генерирует |
| Character system | Пусто | **Блокер** — без этого нет голоса |
| Bootstrap + wiring | index.ts пустой (5 строк) | **Блокер** — нет запуска |
| Telegram admin bot | Пусто | High — fine-tuning + management |
| Scheduler + jitter | Пусто | High — human-like timing |
| Queue manager | Пусто (repo есть) | High — orchestration |
| Graceful shutdown | Пусто | Medium — production stability |
| Health monitor | Пусто | Medium — observability |
| News monitor | Пусто | Low (Phase 4) — autonomous targets |
| Learning module | Пусто | Low (Phase 4) — feedback loop |

### Зависимости в package.json

**Есть:** twitter-api-v2, @anthropic-ai/sdk, better-sqlite3, viem, cron, pino, zod, dotenv
**Нет (нужно):** agent-twitter-client (cookie auth), grammy (Telegram), puppeteer/playwright (scorecards)

### VPS (Hostinger) — текущее состояние

| Параметр | Значение |
|----------|----------|
| OS | Ubuntu 24.x (kernel 6.8.0) |
| CPU / RAM | 2 vCPU / 8 GB |
| Disk | 96 GB (56 GB free) |
| Node.js | v22.22.1 |
| Docker | v29.3.0 |
| PM2 | 6.0.14 (через npx) |
| **pnpm** | **Не установлен** |
| **Claude Code CLI** | **Не установлен** |
| IP | <redacted> (datacenter) |
| SSH | Port 22, user deploy |

---

## Критическое решение: Anti-Detection

### Проблема

Hostinger IP (<redacted>) — datacenter IP. Twitter/Cloudflare WAF блокирует запросы с datacenter ASN (AWS, DigitalOcean, Hostinger, Hetzner) **до того, как они достигнут Twitter API**.

agent-twitter-client делает HTTP-запросы (не браузерную автоматизацию), поэтому browser fingerprinting не нужен. Нужен **только residential IP** для обхода Cloudflare.

### Варианты

| Вариант | Стоимость | Надёжность | Настройка |
|---------|-----------|------------|-----------|
| **ISP Static Residential Proxy** (Decodo) | $3–5/мес | Высокая (99%+ uptime) | Просто: env var `PROXY_URL` |
| **Tailscale exit node** (домашний ПК) | $0 | Средняя (ПК должен быть включён) | Средне: tailscale на обоих машинах |
| **Bright Data ISP** | $15–30/мес | Очень высокая | Просто |
| **Mobile 4G proxy** | $15–80/мес | Высокая | Просто |
| **Домашний роутер + WireGuard** | $0 | Низкая (CGNAT ломает) | Сложно |

### Рекомендация

**Основной: ISP Static Residential Proxy через Decodo** ($3–5/мес)
- SOCKS5 протокол (быстрее, не модифицирует трафик, нет X-Forwarded-For)
- Один статический IP = одна сессия навсегда (Twitter не видит смену геолокации)
- Premium ASNs (Comcast, Verizon) — Twitter видит обычного пользователя

**Fallback: Tailscale exit node через домашний ПК** ($0)
- Трафик VPS выходит через домашний ISP-IP
- Идеальный residential, но зависит от uptime домашнего ПК
- Если есть Raspberry Pi / старый ноутбук — лучший вариант

### Конфигурация

```env
# .env — proxy для agent-twitter-client
PROXY_URL=socks5://user:password@gate.decodo.com:7777

# Для twitter-api-v2 (Official API) — proxy не нужен, работает с любого IP
```

### Twitter-специфичные правила anti-detection

| Правило | Почему |
|---------|--------|
| Один аккаунт = один IP навсегда | Смена IP = security alert |
| Sticky session (не rotating) | Rotating residential = разные города = флаг |
| Rate limit привязан к аккаунту, не к IP | Proxy не обходит rate limits, только Cloudflare |
| Cookie reuse | Каждый логин = security alert. Логин один раз, потом только cookies |
| 2FA через TOTP | `TWITTER_2FA_SECRET` в env для автоматической генерации OTP |
| Нет mention polling чаще 2 мин | `MENTION_POLL_INTERVAL_MS=120000` минимум |

---

## Критическое решение: Claude Code CLI на VPS

### Проблема

Основной LLM provider (ClaudeCodeProvider) запускает `claude` CLI как subprocess. На VPS нет claude CLI. Два варианта:

### Вариант A: Установить Claude Code CLI + авторизовать Claude Max

```bash
# На VPS:
npm install -g @anthropic-ai/claude-code
claude login  # OAuth через браузер — нужен один раз
```

**Плюсы:** Полный доступ к Perplexity MCP, WebSearch, multi-step reasoning. Unlimited tokens (Claude Max).
**Минусы:** Нужен интерактивный логин (один раз). Claude Max subscription привязана к аккаунту.

### Вариант B: Anthropic SDK как primary provider

Переключить ProviderManager: SDK = primary, Claude Code = optional.

**Плюсы:** Проще деплой, нет зависимости от claude CLI.
**Минусы:** Нет Perplexity MCP, нет WebSearch, нет multi-step reasoning. Roast quality значительно ниже. Стоит деньги ($API tokens).

### Рекомендация

**Вариант A** — установить Claude Code CLI. Однократный `claude login` через SSH tunnel:

```bash
# С локальной машины:
ssh -L 8080:localhost:8080 beef-vps
# На VPS: claude login → откроет localhost:8080 → туннелируется на локальную машину
```

Это даёт полный доступ к research capabilities (Perplexity, WebSearch), что критично для качества roasts.

---

## Milestones

### Milestone 1: Bot Core Engine (MVP — бот генерирует roasts)

**Цель:** бот принимает target → генерирует roast → возвращает текст ≤280 символов.
**Зависимости:** Foundation layer (готово).
**Оценка:** ~20 файлов.

#### Задачи

| # | Задача | Файлы | Описание |
|---|--------|-------|----------|
| 1.1 | Character config + loader | `characters/beef-bot.json`, `roast/character.loader.ts` | JSON с Zod validation. Voice: lowercase, data-backed, unexpected comparisons, self-aware AI. Примеры из strategy-v5 Part 4 |
| 1.2 | Craft-roast prompt template | `agent/prompts/craft-roast.ts` | System prompt + user prompt. Генерирует 10 вариантов → парсит JSON → AgentRoastOutput. Включает character voice, data requirements, length constraint |
| 1.3 | Content filter | `content/content-filter.ts` | Regex-based: TOS violations (slurs, threats, doxxing), banned words list, tweet length ≤280 chars, no ticker spam ($BEEF $BEEF $BEEF), no financial advice. Exportable allowTweet(text) → {allowed, reason} |
| 1.4 | Roast engine | `roast/roast-engine.ts` | Orchestrator: loadCharacter → buildPrompt → providerManager.run() → parseOutput → contentFilter → rankVariants → returnBest. Handles retries, logs to SQLite |
| 1.5 | Fix extractJsonFromOutput | `agent/claude-code.provider.ts` | Bug: greedy regex `\{[\s\S]*\}` grabs from first `{` to last `}`, fails with multiple JSON objects. Fix: use non-greedy or proper brace-depth parsing |

#### Тесты (Milestone 1)

| Тест | Тип | Что проверяет |
|------|-----|---------------|
| content-filter.spec.ts | Unit | TOS words blocked, valid tweet passes, >280 chars rejected, ticker spam detected |
| roast-engine.spec.ts | Unit | Mocked provider → engine returns best variant, handles provider failure, respects daily limit |
| craft-roast.spec.ts | Unit | Prompt includes character voice, target context, length constraint |
| character.loader.spec.ts | Unit | Valid JSON loads, invalid JSON throws, Zod validation errors |
| extractJsonFromOutput.spec.ts | Unit | Array of blocks, raw JSON, nested JSON, no JSON → error |

---

### Milestone 2: Twitter Integration (бот постит в Twitter)

**Цель:** бот может постить tweets и читать mentions.
**Зависимости:** Milestone 1 (roast engine).
**Критическая dependency:** ISP proxy ($3–5/мес) для cookie auth.

#### Задачи

| # | Задача | Файлы | Описание |
|---|--------|-------|----------|
| 2.1 | Добавить agent-twitter-client в deps | package.json | `pnpm add agent-twitter-client` — cookie auth library. Проверить совместимость с Node 22 |
| 2.2 | Twitter client (dual-mode) | `twitter/twitter-client.ts` | Interface: postTweet(text), getMentions(sinceId), replyToTweet(tweetId, text). Две реализации: CookieAuthClient (agent-twitter-client + PROXY_URL) и ApiClient (twitter-api-v2). Автопереключение при ошибках |
| 2.3 | Rate limiter | `twitter/rate-limiter.ts` | Token bucket: max N tweets/hour, cooldown after errors. Separate limits for posts vs reads. Tracks daily count |
| 2.4 | Cookie session manager | `twitter/cookie-manager.ts` | Login один раз → сохранить cookies в файл → reuse при перезапусках. TOTP generation из TWITTER_2FA_SECRET |
| 2.5 | Обновить env.validation.ts | `common/config/env.validation.ts` | Добавить: PROXY_URL (optional), TWITTER_2FA_SECRET (optional), TWITTER_COOKIES_PATH (default ./data/twitter-cookies.json) |

#### Тесты (Milestone 2)

| Тест | Тип | Что проверяет |
|------|-----|---------------|
| rate-limiter.spec.ts | Unit | Token bucket depletes, refills, blocks when empty, tracks daily count |
| twitter-client.spec.ts | Unit | Mocked HTTP → postTweet returns tweet ID, getMentions returns array, fallback to API on cookie auth failure |
| cookie-manager.spec.ts | Unit | Cookies loaded from file, saved after login, TOTP generated correctly |

#### E2E тест (manual)

```bash
# DRY_RUN mode: generate roast → log it → don't post
DRY_RUN=true pnpm dev

# Real post (после настройки аккаунта + proxy):
# 1. Один tweet в тестовый аккаунт
# 2. Проверить что tweet появился
# 3. Проверить что cookies сохранены
# 4. Перезапустить бота → проверить что cookies reused (нет нового логина)
```

---

### Milestone 3: Telegram Command Center

**Цель:** админ-бот для управления ботом и fine-tuning контента.
**Зависимости:** Milestone 1 (roast engine), частично Milestone 2 (для постинга).

#### Выбор фреймворка

**grammY** (не Telegraf). Причины:
- TypeScript-native (типы работают "из коробки", в отличие от Telegraf v4 где типы сломаны)
- Плагин `@grammyjs/conversations` — replay engine для multi-step flows (RLHF)
- Session adapters: SQLite (интеграция с нашей existing DB)
- Активная поддержка, исчерпывающая документация

```bash
pnpm add grammy @grammyjs/conversations @grammyjs/storage-file
```

#### Архитектура

```
src/admin/
├── bot.ts                    # Инициализация, middleware pipeline
├── guards.ts                 # isAdmin middleware (whitelist по chatId)
├── session.ts                # SessionData тип + инициализация
├── commands/
│   ├── status.ts             # /status — health, last post, queue size, daily count
│   ├── pause.ts              # /pause, /resume — toggle runtime config
│   ├── queue.ts              # /queue — pending items, position, target
│   ├── stats.ts              # /stats — engagement за 24h/7d
│   ├── roast.ts              # /roast <target> — trigger RLHF flow
│   ├── config.ts             # /config — view/edit runtime config
│   └── emergency.ts          # /emergency — kill pending, pause bot
├── conversations/
│   └── roast-flow.ts         # RLHF: target → 3 variants → pick → post
├── notifications.ts          # Alerts: errors, engagement, digest
└── index.ts                  # Export + запуск
```

#### RLHF Flow (core interaction)

```
Admin: /roast OpenSea
Bot: 🎯 Researching OpenSea...
Bot: [Variant 1] "opensea lost 99% of its volume and pivoted to..."
     [Variant 2] "opensea's new pro mode just means..."
     [Variant 3] "remember when opensea was worth..."
     [1️⃣] [2️⃣] [3️⃣] [🔄 Regen] [❌ Cancel]
Admin: taps 2️⃣
Bot: ✅ Posted: [link to tweet]
     📊 Tracking engagement...
```

**Реализация:** grammY conversations plugin. Conversation function = async generator, хранит state между сообщениями. Variants хранятся в session, не в памяти — бот может перезапуститься между шагами.

#### Команды

| Команда | Что делает | Пример вывода |
|---------|-----------|---------------|
| /status | Bot health snapshot | `🟢 Running \| Last post: 3m ago \| Queue: 2 \| Today: 4/10` |
| /pause | Остановить постинг | `⏸ Bot paused. Use /resume to continue.` |
| /resume | Возобновить | `▶️ Bot resumed. Next post in ~15m.` |
| /queue | Показать очередь | Numbered list: `1. OpenSea (p:8) 2. AIXBT (p:5)` |
| /stats | Engagement stats | `24h: 47❤️ 12🔄 890👁️ \| 7d: 312❤️ 89🔄 6.2K👁️ \| Best: "opensea..." (23❤️)` |
| /roast \<target\> | Запустить RLHF flow | Triggers conversation (see above) |
| /config | Посмотреть/изменить конфиг | `Daily limit: 10 \| Moderation: ON \| Mention poll: 120s` |
| /emergency | Аварийная остановка | Kills queue, pauses bot, notifies all admins |

#### Notifications (push)

| Событие | Сообщение | Триггер |
|---------|-----------|---------|
| Twitter API error | `🔴 Twitter API failed: {error}. Retrying in {n}s...` | 3 consecutive failures |
| Rate limit hit | `⚠️ Rate limit hit. Cooling down {n} min.` | 429 response |
| High engagement | `🔥 Roast going viral: {text} — {likes}❤️ {rts}🔄` | >50 likes OR >10 RTs |
| Challenge/mention | `📩 New mention from @{user}: {text}` | New unprocessed mention |
| Daily digest | `📊 Daily: {n} roasts, {total_likes}❤️, best: "{text}"` | 08:00 UTC cron |
| Provider degraded | `⚠️ Claude Code CLI unavailable. Degraded mode.` | ProviderManager mode change |
| Bot error | `🚨 Unhandled error: {message}` | Uncaught exception |

#### Multi-admin

Два админа (основатели): whitelist по Telegram chat ID в env.

```env
TELEGRAM_ADMIN_IDS=123456789,987654321  # Comma-separated
```

Guard middleware фильтрует **все** сообщения до обработки команд.

#### Тесты (Milestone 3)

| Тест | Тип | Что проверяет |
|------|-----|---------------|
| guards.spec.ts | Unit | Admin allowed, non-admin blocked, empty whitelist blocks all |
| roast-flow.spec.ts | Unit | Mocked bot context → variants generated → selection works → post triggered |
| notifications.spec.ts | Unit | Alert formatting, digest aggregation, dedup (no spam) |
| commands/*.spec.ts | Unit | Each command returns expected format, handles empty data |

---

### Milestone 4: Scheduler + Queue + Wiring

**Цель:** бот работает автономно — постит по расписанию, обрабатывает очередь.
**Зависимости:** Milestones 1–3.

#### Задачи

| # | Задача | Файлы | Описание |
|---|--------|-------|----------|
| 4.1 | Human-like jitter module | `scheduler/jitter.ts` | Quiet hours (5–10 UTC), burst patterns (2–3 posts close together), distraction delays (random 5–45 min gaps). Mimics human: не постит ровно каждые 2 часа |
| 4.2 | Scheduler | `scheduler/scheduler.ts` | Uses `cron` package (already in deps). Jobs: autonomous-roast (3–5/day), mention-poll (every 2–3 min), engagement-track (every 1h), daily-digest (08:00 UTC). All with jitter |
| 4.3 | Queue manager | `queue/queue.manager.ts` | Dequeue by priority → process (roast engine → twitter client) → update status. Max 3 attempts, exponential backoff between retries. Uses existing QueueRepository |
| 4.4 | Bootstrap + wiring | `bootstrap.ts`, `index.ts` | DI container (manual, no framework): create DB → repos → providers → engine → twitter client → scheduler → telegram bot. Start all services. Graceful shutdown on SIGTERM/SIGINT |
| 4.5 | Graceful shutdown | В `bootstrap.ts` | SIGTERM → stop scheduler → drain queue → kill claude subprocesses → close DB → close telegram bot → exit |

#### Тесты (Milestone 4)

| Тест | Тип | Что проверяет |
|------|-----|---------------|
| jitter.spec.ts | Unit | Quiet hours respected, jitter within bounds, burst pattern generates clusters |
| scheduler.spec.ts | Unit | Jobs fire at expected intervals (mocked timers), respects paused state |
| queue-manager.spec.ts | Unit | Dequeue by priority, retry on failure, max attempts exceeded → rejected |
| bootstrap.spec.ts | Integration | Full wiring with in-memory SQLite, mocked twitter client, mocked provider. Verify end-to-end: queue item → roast → "post" |

---

### Milestone 5: Deploy to VPS

**Цель:** бот работает на Hostinger VPS 24/7.
**Зависимости:** Milestones 1–4 + proxy + credentials.

#### Подготовка VPS

```bash
# 1. Установить pnpm
ssh beef-vps "npm install -g pnpm"

# 2. Установить PM2 глобально
ssh beef-vps "npm install -g pm2"

# 3. Установить Claude Code CLI
ssh beef-vps "npm install -g @anthropic-ai/claude-code"

# 4. Авторизовать Claude Code (через SSH tunnel)
# Локально:
ssh -L 8080:localhost:8080 beef-vps
# На VPS:
claude login
# Браузер откроется через туннель → OAuth → done

# 5. Клонировать репо
ssh beef-vps "cd /home/deploy && git clone https://github.com/nikitacometa/twitter-agents.git"

# 6. Установить зависимости
ssh beef-vps "cd /home/deploy/twitter-agents/beef && pnpm install --frozen-lockfile"

# 7. Создать .env
ssh beef-vps "nano /home/deploy/twitter-agents/beef/.env"
```

#### PM2 Ecosystem

```javascript
// beef/ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'beef-bot',
    script: 'dist/index.js',
    cwd: '/home/deploy/twitter-agents/beef',
    env: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '500M',
    restart_delay: 5000,
    max_restarts: 10,
    exp_backoff_restart_delay: 100,
    // Logs
    error_file: '/home/deploy/logs/beef-error.log',
    out_file: '/home/deploy/logs/beef-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  }]
};
```

#### Deploy Script

```bash
#!/bin/bash
# scripts/deploy.sh — run from local machine
set -e

HOST="beef-vps"
DIR="/home/deploy/twitter-agents"

echo "🔨 Building locally..."
cd beef && pnpm build

echo "📦 Pushing to git..."
git push origin main

echo "🚀 Deploying to VPS..."
ssh $HOST "cd $DIR && git pull && cd beef && pnpm install --frozen-lockfile && pnpm build"

echo "♻️ Restarting PM2..."
ssh $HOST "cd $DIR/beef && pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs"

echo "✅ Checking health..."
sleep 5
ssh $HOST "pm2 status beef-bot"
```

#### Checklist перед deploy

- [ ] `.env` на VPS с валидными credentials
- [ ] ISP proxy оплачен и работает (curl через SOCKS5 → проверить IP)
- [ ] Claude Code CLI авторизован (`claude --version` на VPS)
- [ ] Twitter аккаунт создан + X Premium ($8) + 2FA
- [ ] Twitter cookies получены (первый логин через agent-twitter-client)
- [ ] Telegram bot создан через @BotFather, token в .env
- [ ] Sentry project создан, DSN в .env
- [ ] `DRY_RUN=true` первые 24 часа
- [ ] PM2 ecosystem file в репо
- [ ] Logs directory создан: `/home/deploy/logs/`

#### Мониторинг в production

| Инструмент | Что мониторит | Цена |
|------------|---------------|------|
| PM2 | Process alive, restarts, memory | Free |
| Sentry | Uncaught exceptions, breadcrumbs | Free tier (5K events/mo) |
| Telegram bot | All alerts (errors, rate limits, engagement) | Free |
| cron health check | `curl localhost:PORT/health` every 5 min | Free (VPS cron) |

---

### Milestone 6: Testing Strategy

#### Уровни тестирования

| Уровень | Инструмент | Что тестирует | Когда запускать |
|---------|------------|---------------|-----------------|
| **Unit** | vitest | Каждый модуль изолированно (mocked deps) | `pnpm test` — каждый коммит |
| **Integration** | vitest + in-memory SQLite | Full pipeline: queue → engine → filter → "post" | `pnpm test:integration` — перед deploy |
| **DRY_RUN** | Сам бот | Real LLM calls, real prompts, fake Twitter posting | Manual — перед go-live |
| **Manual QA** | Telegram RLHF | Human reviews generated roasts, picks best | Continuous — первая неделя |
| **Smoke test** | PM2 + health endpoint | Bot starts, connects, runs first cycle | After every deploy |

#### Unit тесты — критический путь

Минимум до запуска:

```
src/
├── agent/
│   ├── provider-manager.spec.ts     ✅ EXISTS (31 tests)
│   └── claude-code.provider.spec.ts  ← NEW: extractJsonFromOutput
├── content/
│   └── content-filter.spec.ts        ← NEW: TOS, length, ticker spam
├── roast/
│   ├── roast-engine.spec.ts          ← NEW: orchestration, retries, daily limit
│   └── character.loader.spec.ts      ← NEW: JSON validation
├── twitter/
│   ├── rate-limiter.spec.ts          ← NEW: token bucket
│   └── twitter-client.spec.ts        ← NEW: dual-mode, fallback
├── scheduler/
│   └── jitter.spec.ts               ← NEW: quiet hours, bounds
├── queue/
│   └── queue-manager.spec.ts         ← NEW: priority dequeue, retries
├── admin/
│   └── guards.spec.ts               ← NEW: admin whitelist
└── storage/
    ├── database.spec.ts             ✅ EXISTS
    ├── roast.repository.spec.ts     ✅ EXISTS
    └── queue.repository.spec.ts     ✅ EXISTS
```

**~10 новых тестовых файлов, ~80–120 новых тестов.**

#### Integration тест

Один файл, end-to-end pipeline:

```typescript
// tests/integration/pipeline.spec.ts
// 1. In-memory SQLite
// 2. Mocked LLM provider (returns canned AgentRoastOutput)
// 3. Mocked Twitter client (captures posted text)
// 4. Real: roast engine, content filter, queue manager
// 5. Assert: queue item → roast generated → filtered → "posted" → DB updated
```

#### DRY_RUN тест

```bash
# Реальные LLM вызовы, реальные промпты, но без постинга в Twitter
DRY_RUN=true NODE_ENV=development pnpm dev

# Проверить:
# 1. Roast генерируется (output в логах)
# 2. Content filter проходит (длина ≤280, нет banned words)
# 3. Telegram бот показывает варианты
# 4. Выбор варианта сохраняется в DB
# 5. Tweet НЕ постится (dry_run status в DB)
```

#### Правила тестирования (из CLAUDE.md)

- Для каждого `mockResolvedValue` — добавить `mockRejectedValue` тест
- `it.each()` для параметризованных тестов
- Mock-to-assertion ratio < 1.5:1
- Specific assertions (`toHaveProperty`, `toEqual`) — не `toBeDefined()`
- Kill the mutant: комментируй строку кода → тест должен упасть

---

### Milestone 7: Blockchain Integration (post-launch)

**Цель:** ERC-8004 registration, burn detection, Snapshot voting.
**Зависимости:** Token launch (manual, через Bankr).

#### 7.1 Base Chain Setup (viem)

```typescript
// src/chain/client.ts
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

export const publicClient = createPublicClient({
  chain: base,
  transport: http(config.BASE_RPC_URL), // default: https://mainnet.base.org
});
```

**RPC провайдеры для Base:**

| Провайдер | Free tier | Paid | Когда использовать |
|----------|-----------|------|-------------------|
| Base public (mainnet.base.org) | Unlimited (low rate limit) | — | Development, low-traffic reads |
| Alchemy | 300M compute units/mo | $49/mo | Production: webhooks, event watching |
| QuickNode | 10M API credits/mo | $49/mo | Alternative to Alchemy |
| Infura | 100K req/day | $50/mo | Fallback |

**Рекомендация:** Alchemy free tier для начала. Upgrade при необходимости.

#### 7.2 ERC-8004 Identity Registry

Регистрация $BEEF как on-chain AI agent:

1. Найти deployed Identity Registry contract на Base (адрес из ERC-8004 docs)
2. Вызвать `register()` с metadata (agent name, capabilities, twitter handle)
3. Получить ERC-721 NFT как proof of identity

```typescript
// src/chain/erc8004.ts
import { publicClient } from './client.js';

// ABI для Identity Registry (minimal — только register)
const identityRegistryAbi = [...] as const;

export async function registerAgent(walletClient, metadata) {
  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: 'register',
    args: [metadata],
  });
  return hash;
}
```

#### 7.3 Burn Detection

Два подхода:

**A. Alchemy Webhooks (рекомендуется):**
- Address Activity webhook на token contract
- Фильтр: Transfer events с `to = 0x000...dead`
- Webhook → Express endpoint → queue roast request
- Free tier: 3 webhooks, покрывает наши потребности

**B. viem watchEvent (fallback):**
```typescript
publicClient.watchEvent({
  address: BEEF_TOKEN_ADDRESS,
  event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
  args: { to: '0x000000000000000000000000000000000000dEaD' },
  onLogs: (logs) => {
    for (const log of logs) {
      queueRoastRequest(log.args.from, log.args.value);
    }
  },
});
```

#### 7.4 Snapshot.org Integration

```typescript
// src/chain/snapshot.ts
// API: https://hub.snapshot.org/graphql

// Создать space: ручная настройка через snapshot.org UI
// Создать proposal: GraphQL mutation
// Проверить результат: GraphQL query

export async function createChallenge(roastId: number, claim: string) {
  // POST to Snapshot Hub API
  // Requires: EIP-712 signature from bot wallet
}

export async function getVoteResult(proposalId: string) {
  // GraphQL query to Snapshot
}
```

---

### Milestone 8: Visual Content (post-launch)

**Цель:** roast scorecards — image-карточки для каждого roaста.
**Зависимости:** Milestone 1.

#### Задачи

| # | Задача | Описание |
|---|--------|----------|
| 8.1 | HTML template для scorecard | Dark theme, fire accents, dynamic data (target, roast text, metrics) |
| 8.2 | Puppeteer image generation | HTML → screenshot → PNG. puppeteer-extra + stealth plugin (на случай если Puppeteer на VPS = headless detection) |
| 8.3 | Twitter media upload | Прикрепить image к tweet (twitter-api-v2 `mediaUpload`) |
| 8.4 | GIF generation (Phase 2) | ffmpeg или canvas — animated roast cards |

**Anti-detection для Puppeteer на VPS:**
- puppeteer-extra-plugin-stealth (evasion modules: webdriver, chrome.runtime, navigator.plugins)
- Но для **нашего** кейса — мы рендерим свой HTML в headless Chrome, не скрейпим чужие сайты. Detection не проблема

---

## Полный список env vars (production)

```env
# === Twitter (cookie auth — primary) ===
TWITTER_USERNAME=BeefThis
TWITTER_PASSWORD=***
TWITTER_EMAIL=beef@example.com
TWITTER_2FA_SECRET=BASE32_TOTP_SECRET
TWITTER_COOKIES_PATH=./data/twitter-cookies.json

# === Twitter (Official API — backup) ===
TWITTER_API_KEY=***
TWITTER_API_SECRET=***
TWITTER_ACCESS_TOKEN=***
TWITTER_ACCESS_SECRET=***

# === Proxy (ISP residential) ===
PROXY_URL=socks5://user:pass@gate.decodo.com:7777

# === LLM ===
ANTHROPIC_API_KEY=***  # fallback only

# === Database ===
DB_PATH=./data/beef.db

# === Base Chain ===
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
BEEF_TOKEN_ADDRESS=0x...
BOT_WALLET_PRIVATE_KEY=***

# === Bot Config ===
BOT_NAME=0xBeef
ROASTS_PER_DAY=10
MENTION_POLL_INTERVAL_MS=120000
DRY_RUN=false
POST_JITTER_PERCENT=50

# === Telegram Admin ===
TELEGRAM_BOT_TOKEN=***
TELEGRAM_CHAT_ID=***
TELEGRAM_ADMIN_IDS=123456789,987654321

# === Monitoring ===
SENTRY_DSN=https://***@sentry.io/***
NODE_ENV=production
LOG_LEVEL=info
```

---

## Порядок реализации и приоритеты

### Что делать первым (Critical Path)

```
Milestone 1 (Bot Core)     ═══▶ Milestone 2 (Twitter)     ═══▶ Milestone 4 (Wiring)
                                                                      │
Milestone 3 (Telegram)     ═══════════════════════════════════════════╝
                                                                      │
                                                              Milestone 5 (Deploy)
                                                                      │
                                                              Milestone 6 (Tests)
                                                                      ║
                                                              ═══ GO LIVE ═══
                                                                      ║
                                                              Milestone 7 (Blockchain)
                                                              Milestone 8 (Visual)
```

### Приоритеты задач (что делать прямо сейчас)

| Приоритет | Задача | Почему |
|-----------|--------|--------|
| 🔴 P0 | **1.1 Character config** | Без personality нет голоса. Блокирует все промпты |
| 🔴 P0 | **1.2 Craft-roast prompt** | Без промпта LLM не генерирует. Блокирует engine |
| 🔴 P0 | **1.3 Content filter** | Без фильтра риск бана. Блокирует первый пост |
| 🔴 P0 | **1.4 Roast engine** | Orchestrator — соединяет всё. Блокирует Telegram flow |
| 🔴 P0 | **2.1–2.4 Twitter client** | Без Twitter-клиента бот не постит. Параллельно с engine |
| 🟠 P1 | **3.* Telegram admin bot** | RLHF flow — quality control. Можно параллельно с 2.* |
| 🟠 P1 | **4.4 Bootstrap + wiring** | Собирает всё вместе. После 1–3 |
| 🟡 P2 | **4.1–4.3 Scheduler + queue** | Autonomous operation. После wiring |
| 🟡 P2 | **5.* Deploy** | После всего кода + тестов |
| 🟢 P3 | **7.* Blockchain** | После token launch (Bankr) |
| 🟢 P3 | **8.* Visual** | Nice-to-have, не блокер для launch |

### Параллелизация

Два разработчика могут работать параллельно:

**Разработчик 1 (код):** M1 → M2 → M4 → M5
**Разработчик 2 (Telegram + content):** M3 → тесты → character tuning → M7/M8

---

## Риски и митигация

| Риск | Вероятность | Импакт | Митигация |
|------|-------------|--------|-----------|
| Twitter бан за автоматизацию | Medium | Critical | ISP proxy + cookie reuse + rate limits + Official API backup |
| Claude Code CLI не работает на VPS | Low | High | Anthropic SDK fallback (ProviderManager уже реализован) |
| ISP proxy нестабилен | Low | Medium | Tailscale exit node как fallback, Official API не требует proxy |
| Roast quality низкий | Medium | High | RLHF через Telegram — human-in-the-loop первую неделю |
| Rate limit Twitter | Medium | Medium | Token bucket + jitter + respect cooldowns |
| VPS downtime | Low | Medium | PM2 auto-restart + Telegram alerts + Sentry |
| Proxy IP забанен Twitter | Low | Medium | Сменить IP у провайдера ($3-5), или переключиться на Tailscale |

---

## Бюджет (monthly recurring)

| Статья | Стоимость | Обязательно? |
|--------|-----------|-------------|
| X Premium | $8/мес | Да (4x reach) |
| ISP Proxy (Decodo) | $3–5/мес | Да (для cookie auth) |
| Alchemy Base RPC | $0 (free tier) | Да |
| Sentry | $0 (free tier) | Да |
| VPS (Hostinger) | $0 (existing) | Да |
| Claude Max | $0 (existing subscription) | Да |
| **Total** | **$11–13/мес** | |

Anthropic SDK API ($0.003/1K input + $0.015/1K output) — только если Claude Code CLI недоступен. При 10 roasts/day ≈ $5–15/мес.
