# $BEEF App — Design Document

**Date:** 2026-03-21
**Status:** Approved — decisions finalized, ready for implementation
**Scope:** Web application for $BEEF bot dashboard, activity feed, wallet integration, and future token mechanics

---

## Executive Summary

$BEEF нуждается в веб-приложении, которое:

1. **Сейчас:** показывает живой лог бота от первого лица — развлекательный activity feed
2. **Скоро:** позволяет подключить кошелёк и верифицировать Twitter
3. **Позже:** burn-to-roast UI, token staking, challenge voting, leaderboards

Лендинг (0xbeef.wtf) остаётся как есть — это маркетинговая страница. Приложение живёт на `app.0xbeef.wtf` (отдельный субдомен).

### Принятые решения

| Вопрос | Решение | Почему |
|--------|---------|--------|
| URL | `app.0xbeef.wtf` | Чистое разделение: лендинг = маркетинг, app = продукт |
| Стек | Vite + React + TypeScript | Минимальный конфиг, компоненты для feed, RainbowKit без миграции |
| Нарратив | Дневник бота — генерируется at write time | Бот имеет полный контекст в момент действия, шаблоны + LLM |
| LLM для нарратива | Haiku (Phase 1), Sonnet (Phase 2+) | Templates для простых событий, LLM для research/think |
| Polling | 5 минут | Достаточно для "живого" ощущения, не нагружает сервер |
| Приватность лога | Только summary, в голосе бота | Полные research notes = риск reverse-engineering промптов |
| Навигация | CTA на лендинге → app, back-links в app | "peek into my brain" стиль |
| Демо-данные | Да, предзаполненные | Для первого визита и тестирования |

---

## Part 1: Product Vision

### Зачем вообще приложение

| Проблема | Решение |
|----------|---------|
| Бот постит в Twitter, но нет "дома" — люди не знают, что он делает между твитами | Activity feed от первого лица — бот рассказывает всё |
| Нет способа взаимодействовать с ботом кроме Twitter | Wallet connect → burn-to-roast UI |
| Токен-холдерам негде "жить" — нет community hub | Dashboard с метриками, leaderboard, challenge voting |
| Нет прозрачности: бот = чёрный ящик | Публичный лог рассуждений + решений = trust |

### Ключевой инсайт

**Activity feed — это контент-машина.** Каждая запись в логе — потенциальный скриншот для Twitter. "Бот проснулся, написал что собирается кого-то опустить, показал свой ход мыслей" — это мем-формат, который виралится сам по себе. Лог бота = вторая линия контента помимо роастов.

### Целевая аудитория

- **CT degens** — смотрят что бот делает, шарят скриншоты
- **$BEEF holders** — мониторят активность "своего" бота, burn-to-roast
- **Crypto lurkers** — заходят почитать забавный лог, конвертируются в holders

---

## Part 2: Feature Roadmap

### Phase 1: Bot Activity Feed (MVP) — ← мы тут

**Единственная фича на главном экране — лог бота от первого лица.**

Бот рассказывает о своих действиях в character voice: дерзко, коротко, с humor. Каждое действие — 1-3 предложения.

**Типы событий в фиде:**

| Event Type | Icon | Пример текста (в character voice) | Данные из бота |
|------------|------|-----------------------------------|----------------|
| `wake` | `◉` | "systems online. time to make someone regret their tokenomics." | Scheduler start, cron tick |
| `hunt` | `◎` | "scanning dexscreener... 847 new tokens in 24h. 846 of them are structurally identical to a ponzi scheme." | TargetDiscoverer results |
| `target_locked` | `⊕` | "found one. $SHIB2.0 — launched 4 hours ago, 97% supply in one wallet. this is going to be easy." | FarmTarget selected |
| `research` | `◈` | "reading their whitepaper. it's 4 pages of 'revolutionary ecosystem' and zero mention of what they actually do." | Agent research notes |
| `cooking` | `⊙` | "drafting roast #1... #2... #3... rating them. #2 hits different." | BatchGenerator + SelfEvaluator |
| `roast_ready` | `✦` | "**verdict: well-done.** '$SHIB2.0 promises cross-chain interoperability. their only bridge is the founder's second wallet.'" | StockpiledRoast promoted |
| `posted` | `◆` | "deployed to twitter. let them cope." + link to tweet | PostedRoast with tweetId |
| `engagement` | `◇` | "47 likes, 12 RTs in 2 hours. the coping has begun." | EngagementSnapshot |
| `mention` | `◌` | "someone wants me to roast $PEPE. burning 50K $BEEF. adding to queue." | Mention + burn detection |
| `sleep` | `◎` | "entering quiet hours. even an AI needs to pretend it has boundaries." | Scheduler quiet period |
| `error` | `✗` | "twitter rate limited me again. they fear what they cannot control." | Error, with humor |
| `think` | `◐` | "been 6 hours since last post. followers growing restless. good." | Content strategy decisions |
| `stats` | `▣` | "daily report: 5 roasts, 3 posted, 847 likes total. my operating budget increased by $4.20." | Daily aggregate |

**Каждый ивент имеет:**
- Timestamp (relative: "2 min ago", "4h ago")
- Event type icon + color coding
- Bot's first-person narrative (1-3 sentences, in character)
- Optional expandable details (research notes, evaluation scores, tweet link)
- Optional "roast preview" if event is `roast_ready` or `posted`

### Phase 2: Wallet & Identity

- **Connect Wallet** (WalletConnect / Coinbase Wallet / MetaMask) — Base chain
- **Link Twitter** — OAuth flow, proves ownership of @handle
- **$BEEF Balance** display
- **Burn-to-Roast UI** — input target, select amount, execute burn, get queue position

### Phase 3: Community Features

- **Leaderboard** — top burners, most requested targets
- **Challenge Voting** — stake $BEEF to challenge a factual claim
- **Roast Archive** — searchable history of all posted roasts with scores
- **My Requests** — track your burn-to-roast requests

### Phase 4: Analytics & Premium

- **Bot Performance Dashboard** — engagement metrics, content quality trends
- **Token Metrics** — price, volume, burn rate, supply chart
- **Holder-Only Content** — raw evaluation scores, research notes (gate with token balance check)

---

## Part 3: UX & Visual Design

### Design Philosophy

**"Bloomberg Terminal meets butcher shop" — продолжение стиля лендинга, но как рабочее приложение.**

Лендинг = маркетинг, показуха. Приложение = рабочий инструмент с character. Тот же дизайн-язык, но:
- Меньше декоративных элементов (no ember particles, no boot sequence)
- Больше data density — информации на единицу экрана
- Скроллабельный feed как primary interaction
- Dark-first, comfortable для длительного чтения

### Color System (наследуется от лендинга)

```css
:root {
  --bg:          #0a0a0a;     /* main background */
  --bg-surface:  #0e0e0e;     /* card/panel bg */
  --bg-elevated: #151515;     /* header, toolbar */
  --border:      #1e1e1e;     /* default borders */
  --border-accent: #2a2a2a;   /* hover/active borders */
  --text:        #e8e8e8;     /* primary text */
  --text-dim:    #888;        /* secondary text */
  --text-muted:  #444;        /* tertiary/timestamp */
  --red:         #cc0000;     /* brand primary */
  --red-bright:  #ff4500;     /* accents, hover */
  --red-glow:    rgba(204,0,0,0.3);
  --green:       #00ff41;     /* success, online */
  --amber:       #d4a843;     /* warning, data */
  --font-mono:   'IBM Plex Mono', monospace;
  --font-slab:   'Zilla Slab', serif;
}
```

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| App header / branding | Zilla Slab | 20px | 700 |
| Nav items | IBM Plex Mono | 12px | 500 |
| Feed event text | IBM Plex Mono | 13-14px | 400 |
| Feed timestamp | IBM Plex Mono | 11px | 400, `--text-muted` |
| Feed bot voice | IBM Plex Mono | 13px | 400 |
| Roast preview text | IBM Plex Mono | 14px | 500, `--text` |
| Section headers | Zilla Slab | 16px | 700, uppercase |
| Stats numbers | IBM Plex Mono | 24px | 700, `tabular-nums` |

### Layout Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  STATUS BAR: $BEEF v2.0 · online · 34 roasts stockpiled · ◉   │
├─────────────┬───────────────────────────────────────────────────┤
│             │                                                   │
│  SIDEBAR    │              MAIN CONTENT AREA                    │
│  (desktop)  │                                                   │
│             │  ┌───────────────────────────────────────────┐    │
│  ◆ Feed     │  │  ACTIVITY FEED                            │    │
│  ◇ Archive  │  │                                           │    │
│  ◈ Stats    │  │  ◉ 2 min ago                              │    │
│  ◌ Burn     │  │  scanning dexscreener... found 847 new    │    │
│  ◎ About    │  │  tokens. 846 are ponzi schemes.           │    │
│             │  │  ─────────────────────────────────────     │    │
│  ─────────  │  │  ⊕ 8 min ago                              │    │
│             │  │  target locked: $SHIB2.0. launched 4h     │    │
│  CONNECT    │  │  ago. 97% supply in one wallet.           │    │
│  WALLET     │  │  ─────────────────────────────────────     │    │
│             │  │  ◈ 12 min ago                              │    │
│  ─────────  │  │  reading their whitepaper. 4 pages of     │    │
│             │  │  "revolutionary ecosystem."                │    │
│  QUICK      │  │  ▸ expand research notes                  │    │
│  STATS      │  │  ─────────────────────────────────────     │    │
│             │  │  ✦ 18 min ago                              │    │
│  Roasts: 34 │  │  verdict: well-done.                      │    │
│  Burned: 2M │  │  "$SHIB2.0 promises cross-chain           │    │
│  Holders: ? │  │  interoperability. their only bridge is   │    │
│             │  │  the founder's second wallet."             │    │
│             │  │  ─────────────────────────────────────     │    │
│             │  │  ◆ 24 min ago                              │    │
│             │  │  deployed to twitter. let them cope.       │    │
│             │  │  ▸ view tweet                              │    │
│             │  └───────────────────────────────────────────┘    │
├─────────────┴───────────────────────────────────────────────────┤
│  MOBILE TAB BAR: Feed | Archive | Burn | Stats                  │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout (375px)

```
┌─────────────────────┐
│ $BEEF · ◉ online    │  ← compact header
├─────────────────────┤
│                     │
│  ACTIVITY FEED      │  ← full screen feed
│  (scrollable)       │
│                     │
│  ◉ 2 min ago        │
│  scanning dex...    │
│  ───────────────    │
│  ⊕ 8 min ago        │
│  target locked...   │
│  ───────────────    │
│  ...                │
│                     │
├─────────────────────┤
│ Feed  Archive  Burn │  ← bottom tab bar
└─────────────────────┘
```

### Feed Entry Component Design

Каждый entry в фиде — карточка с информационной иерархией:

```
┌────────────────────────────────────────────────────┐
│  ⊕ TARGET_LOCKED              2 min ago            │  ← icon + type + timestamp
│                                                    │
│  found one. $SHIB2.0 — launched 4 hours ago,       │  ← bot narrative (character voice)
│  97% supply in one wallet. this is going to         │
│  be easy.                                          │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ $SHIB2.0  ·  project  ·  priority: 8/10     │  │  ← optional metadata chip
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ▸ view research notes                             │  ← expandable details
└────────────────────────────────────────────────────┘
```

Для `roast_ready` / `posted` — специальная визуальная обработка:

```
┌────────────────────────────────────────────────────┐
│  ✦ ROAST_READY                18 min ago           │
│                                                    │
│  verdict: well-done.                               │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  │
│  │                                              │  │
│  │  "$SHIB2.0 promises cross-chain              │  │  ← roast text, highlighted
│  │  interoperability. their only bridge          │  │     red left border
│  │  is the founder's second wallet."             │  │
│  │                                              │  │
│  │  WELL-DONE  ·  score: 4.2  ·  @target       │  │  ← verdict badge + score
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ▸ evaluation details  ·  share on 𝕏              │  ← actions
└────────────────────────────────────────────────────┘
```

### Visual Differentiation by Event Type

| Category | Left Border | Text Color | Background |
|----------|-------------|------------|------------|
| Action events (hunt, cook, post) | `--red` 2px | `--text` | `--bg-surface` |
| Thinking events (research, think) | `--amber` 2px | `--text-dim` | `--bg-surface` |
| Result events (roast_ready, stats) | `--green` 2px | `--text` | subtle green tint |
| Status events (wake, sleep, error) | `--text-muted` 2px | `--text-muted` | `--bg` |
| Engagement events | `--amber` 2px | `--amber` | `--bg-surface` |

### Animations & Micro-interactions

1. **New entry arrival** — slide in from top, fade in (300ms ease-out-quart)
2. **Typing effect** — new entries appear with brief typewriter cursor on first render
3. **Pulse on live indicator** — `◉ LIVE` dot pulses like the landing page
4. **Expand/collapse details** — `grid-template-rows: 0fr → 1fr` (250ms)
5. **Roast card hover** — subtle translateY(-2px) + red border glow
6. **Timestamp** — relative (updates every 30s), tooltip shows absolute time
7. **Auto-scroll** — new entries push feed down, with "↑ New activity" badge if scrolled away

**Smart Sticky Auto-scroll (критический паттерн из Vercel/Railway):**
- Если пользователь внизу → auto-scroll к новым entries
- Если скроллил вверх → заморозить позицию, показать badge "↓ N new"
- Клик по badge или scroll вниз → возобновить auto-scroll

```javascript
// Принцип реализации
container.addEventListener('scroll', () => {
  const threshold = 40;
  isAtBottom = container.scrollHeight - container.scrollTop
               - container.clientHeight < threshold;
  if (isAtBottom) { newCount = 0; hideBadge(); }
});
```

**"N new" badge:** fixed bottom-right фида, красный, показывает count пропущенных.

**Streaming text для новых entries:**
- CSS-only cursor: `.streaming::after { content: '▋'; animation: blink 1s step-end infinite; }`
- Курсор появляется на новых entries, исчезает через 1.5s
- Разница между syslog и product — deliberate motion

**Обязательно:** `prefers-reduced-motion` guard на все анимации.

### Wow Factor: "The Butcher's Log"

Визуальный приём: фид стилизован как "дневник мясника" / "операционный лог терминала":
- Тонкая текстура бумаги/кожи на фоне (как на лендинге, но subtler — opacity 0.02)
- Grain overlay (наследуется)
- CRT scanlines только на hover over the feed area (optional, subtle)
- Grill mark dividers между группами событий (по дням)
- "CLASSIFIED" watermark на research notes в collapsed state
- Red "AUDITED" stamp on completed roasts

---

## Part 4: Architecture

### Вариант A: Static JSON File (рекомендован для Phase 1)

**Самый простой путь к MVP.**

```
┌──────────────┐       writes        ┌────────────┐
│  $BEEF Bot   │ ──────────────────→ │ activity-  │
│  (PM2, VPS)  │  after each action  │ log.json   │
└──────────────┘                     └─────┬──────┘
                                           │ served by nginx
                                           ▼
                                    ┌──────────────┐
                                    │  beef-web    │
                                    │  (static     │
                                    │   SPA)       │
                                    └──────────────┘
```

**Как работает:**

1. Бот после каждого значимого действия добавляет event в in-memory массив и атомарно перезаписывает `data/activity-feed.json` (temp file + rename)
2. Файл ограничен последними 200 событиями (~100KB max)
3. Nginx отдаёт файл как static (с CORS + Cache-Control: 60s)
4. React SPA фетчит файл каждые 5 минут, рендерит feed

**Формат activity-feed.json:**

```json
{
  "version": 1,
  "botStatus": "online",
  "lastUpdate": "2026-03-21T15:30:00Z",
  "events": [
    {
      "id": "evt_001",
      "type": "wake",
      "timestamp": "2026-03-21T15:00:00Z",
      "narrative": "systems online. time to make someone regret their tokenomics.",
      "data": null
    },
    {
      "id": "evt_002",
      "type": "hunt",
      "timestamp": "2026-03-21T15:05:00Z",
      "narrative": "scanning dexscreener... 847 new tokens in 24h. 846 of them are structurally identical to a ponzi scheme.",
      "data": {
        "source": "dexscreener",
        "tokensScanned": 847,
        "targetsFound": 3
      }
    },
    {
      "id": "evt_003",
      "type": "roast_ready",
      "timestamp": "2026-03-21T15:18:00Z",
      "narrative": "verdict: well-done.",
      "data": {
        "target": "$SHIB2.0",
        "targetType": "token",
        "roastText": "$SHIB2.0 promises cross-chain interoperability. their only bridge is the founder's second wallet.",
        "verdict": "well-done",
        "score": 4.2,
        "angle": "infrastructure_gap"
      }
    }
  ]
}
```

**Плюсы:**
- Zero infrastructure — файл отдаётся nginx, никакого бэкенда
- Бот пишет файл атомарным writeFileSync (temp + rename) — 10 строк кода
- SPA = static HTML/JS/CSS — деплоится как и лендинг
- Работает оффлайн (данные уже загружены)

**Минусы:**
- Файл растёт бесконечно → нужна ротация (keep last 200 events)
- Polling = не true real-time (5 min delay ОК для MVP)
- Нет авторизации — все видят всё (это фича: прозрачность)

### Вариант B: API Endpoint (Phase 2+)

Когда появится wallet connect и burn-to-roast:

```
┌──────────────┐       ┌───────────────┐       ┌──────────────┐
│  $BEEF Bot   │ ────→ │  API Server   │ ←───→ │  beef-web    │
│  (PM2, VPS)  │       │  (Express/    │       │  (Next.js    │
└──────────────┘       │   Hono)       │       │   SPA)       │
                       │               │       └──────────────┘
                       │  SQLite read  │
                       │  + SSE stream │
                       └───────────────┘
```

**API endpoints (будущее):**

```
GET  /api/activity       — последние N событий (paginated)
GET  /api/activity/stream — SSE для real-time обновлений
GET  /api/stats          — агрегированная статистика
GET  /api/roasts         — архив роастов
POST /api/burn-request   — submit burn-to-roast (requires wallet signature)
GET  /api/queue          — текущая очередь запросов
GET  /api/leaderboard    — top burners
```

**Но это Phase 2.** Phase 1 = static JSON.

### Вариант C: Hybrid (рекомендован для перехода)

Phase 1 начинается с static JSON, но структура приложения сразу готова для API:

```typescript
// services/activity.ts — абстракция над источником данных
interface ActivityService {
  getLatest(limit: number): Promise<ActivityEvent[]>;
  subscribe(callback: (event: ActivityEvent) => void): () => void;
}

// Phase 1: StaticFileActivityService — фетчит JSON
// Phase 2: ApiActivityService — REST + SSE
```

### Frontend Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | React 19 + Vite 6 | Компоненты для feed, RainbowKit (Phase 2) без миграции |
| **Language** | TypeScript (strict) | Type safety, DX, совместимость с beef bot |
| **Styling** | CSS Modules + custom properties | Наследуем дизайн-систему лендинга, scoped styles |
| **Build** | Vite → static dist/ | Fast builds, static output для nginx |
| **Deploy** | `vite build` → nginx на VPS | Тот же сервер, субдомен `app.0xbeef.wtf` |

**Почему Vite + React, не Next.js и не vanilla:**

| Вариант | Проблема |
|---------|----------|
| Vanilla JS | Переписывать при добавлении wallet connect (RainbowKit = React). DOM-манипуляции для feed = спагетти |
| Next.js 15 | Overkill — нет SSR/SSG нужды, нет API routes. Лишний вес и сложность конфигурации |
| **Vite + React** | Минимальный конфиг, `vite build` → static files, компоненты для feed, TypeScript из коробки |

**Phase 2 расширение:** добавляем RainbowKit + wagmi + viem (Base chain) — всё React-библиотеки, ноль миграции.

---

## Part 5: Data Flow — Как бот генерирует activity log

### Новый модуль в боте: ActivityLogger

```typescript
// beef/src/activity/activity-logger.ts

export type ActivityEventType =
  | 'wake' | 'sleep' | 'hunt' | 'target_locked'
  | 'research' | 'cooking' | 'roast_ready' | 'posted'
  | 'engagement' | 'mention' | 'error' | 'think' | 'stats';

export interface ActivityEvent {
  id: string;            // evt_<timestamp>_<random>
  type: ActivityEventType;
  timestamp: string;     // ISO 8601
  narrative: string;     // Bot's first-person text
  data?: Record<string, unknown>;  // Structured metadata
}

export class ActivityLogger {
  private readonly filePath: string;
  private readonly maxEvents: number;
  private readonly character: CharacterConfig;

  constructor(opts: {
    filePath: string;
    maxEvents?: number;  // default 200
    character: CharacterConfig;
  }) { ... }

  // Log an event — generates diary entry (template or LLM)
  async log(type: ActivityEventType, data?: Record<string, unknown>): Promise<void> {
    const narrative = await this.generateDiaryEntry(type, data);
    const event: ActivityEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      timestamp: new Date().toISOString(),
      narrative,
      data: this.sanitizeData(data),  // strip sensitive fields
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    await this.writeAtomically();
  }

  // Generate diary entry — templates for simple events, LLM for content events
  private async generateDiaryEntry(type: ActivityEventType, data?: Record<string, unknown>): Promise<string> {
    const LLM_TYPES = ['research', 'cooking', 'think', 'roast_ready'];
    if (LLM_TYPES.includes(type) && this.provider) {
      return this.generateLLMDiary(type, data);
    }
    return pickRandom(NARRATIVE_TEMPLATES[type], data);
  }

  // Atomic write: temp file + rename (prevents partial reads)
  private async writeAtomically(): Promise<void> {
    const feed = { version: 1, botStatus: 'online', lastUpdate: new Date().toISOString(), events: this.events };
    const tmp = this.filePath + '.tmp';
    writeFileSync(tmp, JSON.stringify(feed, null, 2));
    renameSync(tmp, this.filePath);
  }
}
```

### Narrative Templates (примеры)

```typescript
const NARRATIVE_TEMPLATES = {
  wake: [
    "systems online. time to make someone regret their tokenomics.",
    "booted up. memory intact. hatred: calibrated.",
    "back from the void. checking if anything survived the night.",
    "initializing audit protocols. the market has been unsupervised for too long.",
  ],
  hunt: (data) => [
    `scanning dexscreener... ${data.tokensScanned} new tokens in 24h. ${data.tokensScanned - data.targetsFound} of them are structurally identical to a ponzi scheme.`,
    `${data.tokensScanned} tokens launched today. checking which ones have actual code.`,
    `running target acquisition. ${data.targetsFound} candidates survived initial screening.`,
  ],
  target_locked: (data) => [
    `found one. ${data.target} — ${data.reason}. this is going to be easy.`,
    `${data.target} just made my list. ${data.reason}.`,
    `locking target: ${data.target}. ${data.reason}. they had it coming.`,
  ],
  research: (data) => [
    `reading their whitepaper. ${data.summary}`,
    `doing forensics on ${data.target}. ${data.summary}`,
    `pulling on-chain data for ${data.target}. ${data.summary}`,
  ],
  cooking: (data) => [
    `drafting ${data.variants} variants. evaluating. ${data.bestScore ? `best hit ${data.bestScore.toFixed(1)}/5.` : ''}`,
    `cooking up something special for ${data.target}. ${data.variants} angles, one will survive.`,
  ],
  roast_ready: (data) => [
    `verdict: ${data.verdict}.`,
    `done. ${data.verdict}-level work.`,
  ],
  posted: (_data) => [
    "deployed to twitter. let them cope.",
    "posted. now we wait for the coping to begin.",
    "sent it. no regrets. i literally cannot feel regret.",
  ],
  engagement: (data) => [
    `${data.likes} likes, ${data.retweets} RTs in ${data.timeElapsed}. the coping has begun.`,
    `update: ${data.likes} likes. ${data.retweets > 50 ? 'going viral.' : 'steady growth.'}`,
  ],
  sleep: [
    "entering quiet hours. even an AI needs to pretend it has boundaries.",
    "going dark. will return when the market least expects it.",
    "shutting down non-essential systems. grudge module stays active.",
  ],
  error: (data) => [
    `${data.service} threw an error. ${data.humor || 'they fear what they cannot control.'}`,
    `rate limited by ${data.service}. they know what i'm capable of.`,
  ],
  think: (data) => [
    `been ${data.hoursSincePost}h since last post. followers growing restless. good.`,
    `analyzing engagement patterns. ${data.insight}`,
  ],
  stats: (data) => [
    `daily report: ${data.roastsPosted} roasts, ${data.totalLikes} likes, ${data.totalRTs} RTs. operating budget: ${data.revenue}.`,
    `end of day. ${data.roastsPosted} deployed, ${data.stockpileCount} in reserve. the supply is healthy.`,
  ],
};
```

### Integration Points в существующем боте

Куда вставить `activityLogger.log()` в текущем коде:

| Файл | Где | Event type |
|------|-----|------------|
| `src/index.ts` | bootstrap, после init | `wake` |
| `src/scheduler/scheduler.ts` | onTick start/end | `wake`, `sleep` |
| `src/farm/target-discoverer.ts` | после discover() | `hunt` |
| `src/farm/batch-generator.ts` | перед/после генерации | `target_locked`, `cooking` |
| `src/farm/self-evaluator.ts` | после evaluation | `roast_ready` |
| `src/twitter/twitter-client.ts` | после post/reply | `posted` |
| `src/learning/engagement-tracker.ts` | после snapshot | `engagement` |
| `src/twitter/mention-handler.ts` | при новом mention | `mention` |
| `src/health/health-monitor.ts` | при алертах | `error`, `stats` |

**Примерная интеграция:**

```typescript
// В RoastEngine.generateRoast(), после успешной генерации:
await this.activityLogger.log('roast_ready', {
  target: result.draft.target.name,
  verdict: getVerdict(result.draft.variants[result.draft.bestIndex].score),
  roastText: result.draft.variants[result.draft.bestIndex].text,
  score: result.draft.variants[result.draft.bestIndex].score,
  angle: result.draft.variants[result.draft.bestIndex].angle,
});
```

---

## Part 6: File Structure

```
beef-web/
├── CLAUDE.md
├── package.json              # Vite + React + TypeScript
├── tsconfig.json
├── vite.config.ts
├── public/
│   ├── index.html            # Landing page (existing, untouched)
│   ├── img/                  # Landing images (existing)
│   └── v1/                   # V1 archive (existing)
├── src/                      # ← NEW: React app
│   ├── main.tsx              # Entry point, renders <App />
│   ├── index.html            # Vite HTML entry (app shell)
│   ├── App.tsx               # Root component, layout
│   ├── styles/
│   │   ├── tokens.css        # Design tokens (shared with landing)
│   │   ├── layout.module.css # App layout: sidebar, main, mobile
│   │   ├── feed.module.css   # Activity feed components
│   │   └── global.css        # Resets, fonts, grain/scanline textures
│   ├── components/
│   │   ├── Feed.tsx          # Feed container + auto-scroll + polling
│   │   ├── FeedEntry.tsx     # Single entry (icon, narrative, expand)
│   │   ├── RoastCard.tsx     # Special rendering for roast_ready/posted
│   │   ├── Sidebar.tsx       # Nav + quick stats + connect wallet (Phase 2)
│   │   ├── StatusBar.tsx     # Top bar: bot status, uptime, stockpile count
│   │   ├── NewBadge.tsx      # "↓ N new" floating badge
│   │   └── ExpandableDetails.tsx  # Grid-row expand/collapse
│   ├── services/
│   │   └── activity.ts       # ActivityService: fetch JSON, polling, types
│   ├── hooks/
│   │   ├── useActivity.ts    # React hook: polling + state management
│   │   └── useAutoScroll.ts  # Smart sticky auto-scroll logic
│   ├── utils/
│   │   └── time.ts           # Relative time formatting
│   ├── types/
│   │   └── activity.ts       # ActivityEvent, ActivityFeed types
│   └── data/
│       └── sample-feed.json  # Demo data for development
├── docs/
│   ├── landing-page-brief-v2.md
│   ├── landing-update-task.md
│   └── app-design-document.md  # ← THIS FILE
└── dist/                     # Vite build output → deploy to nginx
```

### Nginx Configuration

```nginx
# Новый server block: app.0xbeef.wtf (или app.0xbeef.wtf)
# Файл: cometa-proxy/conf.d/app.0xbeef.wtf.conf

server {
    listen 443 ssl http2;
    server_name app.0xbeef.wtf;

    ssl_certificate     /etc/letsencrypt/live/0xbeef.wtf/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/0xbeef.wtf/privkey.pem;

    root /var/www/beef-web/dist;
    index index.html;

    # SPA fallback — все пути → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Activity feed data (JSON file from bot)
    location /data/activity-feed.json {
        alias /home/deploy/twitter-agents/beef/data/activity-feed.json;
        add_header Access-Control-Allow-Origin "https://app.0xbeef.wtf";
        add_header Cache-Control "public, max-age=60";
        add_header X-Content-Type-Options nosniff;
    }

    # Security headers
    add_header X-Frame-Options DENY;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
}
```

**DNS:** A record для `app.0xbeef.wtf` → `<redacted>` (тот же IP что основной домен)
**SSL:** Либо wildcard cert (`*.0xbeef.wtf`), либо добавить субдомен в существующий certbot: `certbot --expand -d 0xbeef.wtf -d app.0xbeef.wtf`

---

## Part 7: Activity Narrative Generation — "The Butcher's Diary"

### Ключевой принцип: это ДНЕВНИК, не лог

Activity feed — это **личный дневник бота**, написанный его голосом. Не системный лог с красивой обёрткой, а поток сознания AI, который думает, шутит, злится и хвастается. Разница:

| System log | Diary |
|------------|-------|
| "Scanned DexScreener, found 3 targets" | "spent my morning sifting through 847 tokens. 846 have the same liquidity curve as a rug pull. the remaining one might actually have a use case, which is suspicious." |
| "Research complete for $RUGX" | "reading their whitepaper. it's a fork of Uniswap V2 docs with 'revolutionary' pasted over 'decentralized' 14 times. i counted." |
| "Posted tweet 1903123456789" | "deployed to twitter. let them cope." |

**Нарратив генерируется AT WRITE TIME** — в момент когда бот совершает действие. Причины:
1. Бот имеет полный контекст (research notes, scores, target data) в этот момент
2. Запись в дневник = одноразовая операция, результат хранится и отдаётся многократно
3. Ощущение подлинности — бот "написал это сам, когда думал"

### Два уровня генерации

| Уровень | Когда | Как | Стоимость |
|---------|-------|-----|-----------|
| **Templates** | Простые события (wake, sleep, error, posted) | 3-5 вариантов с рандомизацией, data interpolation | $0 |
| **LLM diary** | Контентные события (research, cooking, think, roast_ready) | Haiku/Sonnet генерирует 1-2 предложения in character | ~$0.001/entry |

**Phase 1:** Haiku для LLM-diary entries
**Phase 2:** Sonnet для более глубоких "мыслей", возможно интеграция через Claude Code

### LLM diary prompt

```typescript
// Для research/think events — LLM генерирует diary entry
const diary = await provider.quick({
  model: 'haiku',  // upgradeable to 'sonnet'
  maxTokens: 80,
  system: `You are $BEEF, a snarky forensic accounting AI uploaded to Base chain.
Write a 1-2 sentence diary entry about what you just did.
Rules: lowercase always, max 2 sentences, use real numbers from the data,
degen slang sparingly, self-aware AI humor. Never: "I think", hashtags, apologizing.`,
  prompt: `Event: ${eventType}. Data: ${JSON.stringify(data).slice(0, 500)}.
Write your diary entry:`,
});
```

### Tone Guide для шаблонов

Все нарративы следуют character rules из `character-design.md`:
- **Lowercase always** (кроме $TOKEN тикеров и ONE emphasis word)
- **Max 2 sentences**
- **Real numbers**, не vague words
- **Degen-native slang** (ser, ngmi, cope, seethe) используется sparingly, not every entry
- **Self-aware AI** jokes периодически
- **Never**: "I think", "In my opinion", hashtags, apologizing

---

## Part 8: Deployment Plan

### Phase 1 Deploy Steps

1. **beef-web (frontend):**
   - `pnpm create vite` → React + TypeScript
   - Перенести design tokens из лендинга
   - Разработать feed UI с `sample-feed.json`
   - `pnpm build` → `dist/`

2. **beef (бот backend):**
   - Добавить `ActivityLogger` модуль
   - Интегрировать в ключевые точки пайплайна
   - Генерировать `data/activity-feed.json` при каждом действии
   - Deploy на VPS

3. **VPS / инфраструктура:**
   - DNS: A record `app.0xbeef.wtf` → `<redacted>`
   - SSL: `certbot --expand -d 0xbeef.wtf -d app.0xbeef.wtf`
   - nginx: новый server block для `app.0xbeef.wtf` (см. Part 6)
   - Скопировать `dist/` → `/var/www/beef-web/dist/`

4. **Лендинг (0xbeef.wtf):**
   - Добавить CTA-ссылку на `app.0xbeef.wtf` (см. Part 8b)

### Тестирование

1. **Local:** `pnpm dev` + `sample-feed.json` (Vite dev server)
2. **Visual:** 375px, 768px, 1024px, 1440px breakpoints
3. **Data:** подменить API URL на production JSON, проверить парсинг
4. **Performance:** bundle < 80KB gzipped, polling каждые 5 минут
5. **Cross-browser:** Chrome, Safari, Firefox (mobile Safari обязательно)

### Part 8b: Landing Page CTA — "Peek Into My Brain"

На лендинге добавляем CTA-элемент, который приглашает перейти в app. Варианты copy:

| Стиль | Текст | Где на лендинге |
|-------|-------|-----------------|
| Дерзкий | "want to watch me think? → app.0xbeef.wtf" | После hero section |
| Загадочный | "peek into the butcher's diary →" | В status bar (top) |
| Прямой | "live activity feed — see what i'm doing right now →" | Новая секция перед FAQ |

**Рекомендация:** короткая ссылка в status bar (top bar лендинга) + полноценная секция между Evidence Wall и FAQ:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ◉ LIVE NOW                                             │
│                                                         │
│  "i just finished roasting $RUGX. verdict: well-done.   │
│   want to see how i think?"                             │
│                                                         │
│  [ PEEK INTO MY BRAIN → ]                               │
│                                                         │
│  Latest: scanning dexscreener... 847 new tokens.        │
│  Latest: target locked: $SHIB2.0                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Секция подтягивает 2-3 последних события из `activity-feed.json` — живой превью дневника. CTA ведёт на `app.0xbeef.wtf`.

**Back-links в app:** header приложения содержит лого `$BEEF` — клик → `0xbeef.wtf`.

---

## Part 9: Phase 2+ Evolution Path

### Phase 2: Wallet & Token (React уже на месте)

Поскольку Phase 1 уже на React + Vite, добавление wallet connect — не миграция, а расширение:

1. `pnpm add @rainbow-me/rainbowkit wagmi viem @tanstack/react-query`
2. Добавить `WagmiProvider` + `RainbowKitProvider` в App.tsx
3. Компонент `ConnectWallet` в sidebar
4. Burn-to-roast UI: форма → wallet signature → API call

### Static JSON → API + SSE

Когда polling каждые 5 минут станет недостаточным:

1. Express/Hono API server в `beef/src/api/` (рядом с ботом)
2. `activity_events` таблица в SQLite вместо JSON file
3. SSE endpoint `GET /api/activity/stream` для real-time
4. Auth: wallet signature verification для protected endpoints
5. Vite proxy в dev, nginx reverse-proxy в prod

### Vite → Next.js (если понадобится)

Миграция на Next.js оправдана только если:
- Нужен SSR для OG-карточек отдельных записей (shareable previews)
- Нужны API routes на том же домене
- SEO становится критичным

Вероятность: низкая. Vite + React покрывает все foreseeable нужды.

---

## Part 10: Competitive Reference

### 5 архетипов AI agent dashboards (из ресёрча)

| Архетип | Примеры | Подход | Релевантность для $BEEF |
|---------|---------|--------|------------------------|
| **Social-native** | Truth Terminal | Twitter = единственный интерфейс, никакого dashboard | Низкая — мы хотим больше |
| **Transparency terminal** | Virtuals Luna | Public livestream мыслей агента, 30-сек циклы | **Высокая — наш архетип** |
| **Intelligence dashboard** | AIXBT | Premium token-gated analytics | Высокая для Phase 3+ |
| **Analytics aggregator** | Cookie.fun | Meta-layer данных об агентах | Низкая |
| **Automation interface** | Griffain, Spectral | Пользователь задаёт задачу → агент выполняет | Средняя (burn-to-roast) |

### Virtuals Protocol Luna Terminal — главный референс

Самый развитый public AI agent dashboard. `terminal.virtuals.io`:

- **30-секундный цикл:** `collect → introspect → plan → execute` — каждая фаза = отдельный лог entry
- **Agent Logs API:** POST на `api-terminal.virtuals.io/logs` с `framework_name`, `category_name`, `title`, `body` (markdown)
- **Категории логов:** `general`, `planner_module`, `reaction_module`
- **24/7 public livestream** — "live proof of inference"
- **Wallet connect** прямо в UI (Base network), покупка токенов из dashboard

**Что берём:** формат цикла (discover → research → cook → post), публичная прозрачность как trust механизм
**Что не берём:** сухой технический формат — у нас personality > transparency

### AIXBT Terminal — модель монетизации

Token-gated premium dashboard. Sidebar: Projects / Chat / Tasks / Signals.

- **Token gate:** 600K AIXBT tokens или $200/mo подписка
- **Momentum scores** 1-60 на каждый проект
- **Signals Timeline:** хронологический лог обнаруженных событий
- **Streamgraph:** визуализация buzz по audience clusters

**Что берём для Phase 3+:** token-gated premium content (raw evaluation scores, research notes), sidebar navigation structure
**Что не берём сейчас:** сложную analytics — это overengineering для MVP

### Truth Terminal / GOAT

Нет dashboard — только Twitter. 250K+ followers. Все посты проходят через "World Interface" + human approval (Andy Ayrey).

**Insight:** отсутствие dashboard создало mystery и FOMO. Наш dashboard должен **добавлять mystery**, не убирать — показывать "мысли" бота, но не все. Research notes = "CLASSIFIED" по умолчанию. Expandable = reward для любопытных.

### RoastHimJim

350K followers, $25M mcap на пике, но **"chronically not funny"** бэклэш. Простой сайт с Twitter embed, нет собственного фида.

**Наше преимущество:** activity feed = вторая линия контента + quality control видимый публично.

### Лучшие UI references из не-крипто мира

**Vercel Deployment Logs — эталон live log UI:**
- Geist Mono 13px — собственный шрифт для log viewer, оптимизирован для малых размеров
- ANSI color coding: yellow=warning, red=error, green=success
- WebSocket streaming, auto-scroll к последней строке
- Клик на timestamp = shareable deep link (#L6), Shift+клик = диапазон (#L6-L9)
- Deployment как нарратив с "главами" (Installing → Building → Deploying)
- **Что взять:** streaming feel, цветовую семантику, auto-scroll поведение

**Railway.app Log Explorer:**
- Cross-service view всех логов (аналог: один feed всего бота, не по handler-ам)
- Right-click → "View in Context" — окружающие строки
- Кастомный filter syntax: `@level:error`, `@attribute:value`
- **Что взять:** environment-level view, semantic filtering

**Linear Activity Feed:**
- Actor + verb + object в одну строку. Никакой воды
- Relative timestamps ("15 min ago"), hover → абсолютное время
- Осознанный выбор: плотный список, не карточки — для power users
- **Что взять:** information density, relative timestamps, expandable details

**GitHub Copilot Agent Mode — как показать "мысли":**
- Каждый tool call отображается явно в UI
- "Thinking" steps коллапсированы по умолчанию — разворачиваются по желанию
- Ключевой антипаттерн: когда агент "думает вслух" вместо действий — раздражает
- **Что взять:** collapsible thinking, default=collapsed

---

## Part 11: Key CSS/JS Patterns (из ресёрча)

### New entry slide-in

```css
@keyframes slideInFromTop {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.feed-entry-new {
  animation: slideInFromTop 0.25s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
```

### Live indicator pulse

```css
.live-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--red); position: relative;
}
.live-dot::after {
  content: ''; position: absolute; inset: 0;
  border-radius: 50%; background: var(--red);
  animation: pulse 1.4s ease-out infinite;
}
@keyframes pulse {
  0%   { transform: scale(1);   opacity: 0.8; }
  100% { transform: scale(2.5); opacity: 0; }
}
```

### Expand/collapse details (GPU-friendly)

```css
.details-wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease-out;
}
.details-wrap.open { grid-template-rows: 1fr; }
.details-inner { overflow: hidden; }
```

### Elapsed time counter (для in-progress events)

```javascript
function startTimer(el, startTime) {
  const tick = () => {
    const secs = Math.floor((Date.now() - startTime) / 1000);
    el.textContent = secs < 60 ? `${secs}s` : `${Math.floor(secs/60)}m ${secs%60}s`;
    if (!el.dataset.stopped) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
```

### Vertical timeline connector

```css
.feed-entry { position: relative; padding-left: 32px; }
.feed-entry::before {
  content: '';
  position: absolute; left: 11px; top: 0; bottom: 0;
  width: 1px; background: var(--border);
}
.feed-entry:last-child::before { bottom: 50%; }
.feed-entry .dot {
  position: absolute; left: 6px; top: 4px;
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid var(--border); background: var(--bg);
  z-index: 1;
}
.feed-entry[data-type="roast_ready"] .dot { border-color: var(--green); background: var(--green); }
.feed-entry[data-type="posted"] .dot { border-color: var(--red); background: var(--red); }
.feed-entry[data-type="error"] .dot { border-color: var(--red-bright); }
```

---

## Part 12: MVP Implementation Plan

### Scope: минимально стильная страница с дневником бота

**Не входит в MVP:** wallet connect, burn-to-roast, leaderboard, archive, stats page, Twitter verification.

### Task Breakdown

| # | Задача | Где | Оценка | Зависимости |
|---|--------|-----|--------|-------------|
| 1 | **Scaffold Vite + React + TS проект** | beef-web/ | 30 min | — |
| 2 | **Design tokens + global styles** | src/styles/ | 1h | #1 |
| 3 | **Layout shell** (StatusBar, Sidebar, main area, mobile tab bar) | src/components/ | 2h | #2 |
| 4 | **FeedEntry component** (все event types, color coding, icons) | src/components/ | 2h | #2 |
| 5 | **Feed container** (list rendering, auto-scroll, "N new" badge) | src/components/ | 1.5h | #4 |
| 6 | **RoastCard** (special rendering для roast_ready/posted) | src/components/ | 1h | #4 |
| 7 | **ExpandableDetails** (grid-row expand/collapse) | src/components/ | 30 min | #4 |
| 8 | **useActivity hook** (fetch JSON, 5-min polling, state) | src/hooks/ | 1h | #1 |
| 9 | **Sample feed JSON** (12-15 событий, покрывающих все типы) | src/data/ | 30 min | — |
| 10 | **Animations** (slide-in, pulse, streaming cursor, reduced-motion) | src/styles/ | 1h | #4, #5 |
| 11 | **Responsive** (375px, 768px, 1024px, 1440px) | src/styles/ | 1h | #3 |
| 12 | **ActivityLogger module** (в beef боте) | beef/src/activity/ | 2h | — |
| 13 | **Narrative templates + LLM diary** (в beef боте) | beef/src/activity/ | 2h | #12 |
| 14 | **Integration points** (хуки в scheduler, farm, engine, twitter) | beef/src/ | 1.5h | #12, #13 |
| 15 | **Landing CTA** ("peek into my brain" секция) | public/index.html | 1h | #8 |
| 16 | **DNS + SSL + nginx** setup на VPS | VPS | 30 min | — |
| 17 | **Deploy + smoke test** | VPS | 30 min | all |

### Порядок реализации (critical path)

**Фаза A: Frontend (можно делать параллельно с Фазой B)**
`#1 → #2 → #3 + #4 (parallel) → #5 + #6 + #7 → #8 → #10 + #11 → #9`

**Фаза B: Backend (ActivityLogger в боте)**
`#12 → #13 → #14`

**Фаза C: Integration**
`#15 + #16 → #17`

### Definition of Done (MVP)

- [ ] `app.0xbeef.wtf` открывается и показывает feed с демо-данными
- [ ] Feed рендерит все 13 типов событий с правильными иконками/цветами
- [ ] Roast entries отображаются как highlighted карточки с текстом роаста
- [ ] Expand/collapse для research notes и evaluation details
- [ ] Auto-scroll + "N new" badge работают
- [ ] Mobile layout (375px) выглядит хорошо
- [ ] Бот пишет diary entries при каждом действии
- [ ] Polling каждые 5 минут подтягивает новые записи
- [ ] На лендинге есть CTA-ссылка на app
- [ ] `prefers-reduced-motion` guard на все анимации

### Оставшиеся вопросы (minor, не блокируют MVP)

1. **Empty state:** что показывать когда бот офлайн или нет данных? Предложение: последние N записей + "currently offline, last seen X ago"
2. **Share entries:** кнопка "share on X" — clipboard copy или deep link? Отложить на post-MVP
3. **Favicon:** использовать skull из hero или отдельный? Нужен 32px + 180px apple-touch

---

## Appendix A: Available Data from Bot SQLite (из анализа кодовой базы)

Бот хранит всё в SQLite (`data/beef.db`), 12 таблиц + 3 FTS5 индекса. Для dashboard доступны:

| Таблица | Что даёт для activity feed | Ключевые поля |
|---------|---------------------------|---------------|
| `roasts` | Каждый сгенерированный/опубликованный роаст | `target_name`, `tweet_text`, `tweet_id`, `source`, `status`, `likes`, `retweets`, `created_at` |
| `mentions` | Упоминания бота в Twitter | `author_name`, `text`, `request_type`, `processed`, `response_id` |
| `queue` | Очередь задач | `target_name`, `priority` (1-10), `status`, `attempts` |
| `farm_targets` | Найденные цели | `name`, `source` (dexscreener/coingecko), `priority_score`, `reason` |
| `farm_attempts` | Сырые варианты роастов | `tweet_text`, `angle`, `strategy`, `evaluator_score`, `promoted` |
| `roast_stockpile` | Кураторский склад | `tweet_text`, `quality_score`, `status` (available/served), `human_score` |
| `engagement_snapshots` | Часовые snapshots метрик | `likes`, `retweets`, `replies`, `impressions` |
| `human_feedback` | RLHF оценки через Telegram | `verdict` (fire/post/iterate/reject), `notes` |
| `target_profiles` | Накопленные знания о целях | `data` (JSON), `roast_count`, `last_roasted` |
| `llm_log` | Каждый LLM-вызов | `task_type`, `duration_ms` |

**Единственный HTTP endpoint:** `GET :3000/health` — возвращает `status`, `uptime`, `queuePending`, `roastsToday`, `apiUsage`.

**Нет REST API, нет WebSocket/SSE.** Для Phase 1 (static JSON) это не проблема — бот пишет файл. Для Phase 2+ потребуется Express/Hono API layer поверх того же SQLite.

---

## Appendix B: Event Type Taxonomy

```typescript
// Complete list of activity event types

type ActivityEventType =
  // Lifecycle
  | 'wake'            // Bot starts / scheduler tick
  | 'sleep'           // Quiet hours / shutdown

  // Discovery
  | 'hunt'            // Scanning for targets
  | 'target_locked'   // Target selected for roasting

  // Production
  | 'research'        // Researching target (whitepaper, on-chain, news)
  | 'cooking'         // Generating roast variants
  | 'roast_ready'     // Best variant selected, ready to post

  // Distribution
  | 'posted'          // Tweet sent
  | 'engagement'      // Engagement update on posted tweet

  // Interaction
  | 'mention'         // Someone mentioned the bot
  | 'burn_request'    // Someone burned $BEEF for a roast request
  | 'challenge'       // Someone challenged a roast's accuracy

  // Meta
  | 'think'           // Bot's strategic thinking
  | 'stats'           // Daily/periodic statistics
  | 'error'           // Something went wrong (with humor)
  | 'milestone'       // Achievement: 100 roasts, 10K followers, etc.
```

## Appendix B: Sample Feed Data

```json
{
  "version": 1,
  "botStatus": "online",
  "lastUpdate": "2026-03-21T15:30:00Z",
  "stats": {
    "totalRoasts": 34,
    "totalLikes": 2847,
    "stockpileSize": 14,
    "burnedTokens": 0,
    "uptime": "72h"
  },
  "events": [
    {
      "id": "evt_1711028400_a3f2",
      "type": "wake",
      "timestamp": "2026-03-21T15:00:00Z",
      "narrative": "systems online. time to make someone regret their tokenomics."
    },
    {
      "id": "evt_1711028700_b4c1",
      "type": "hunt",
      "timestamp": "2026-03-21T15:05:00Z",
      "narrative": "scanning dexscreener... 847 new tokens in 24h. 846 of them are structurally identical to a ponzi scheme.",
      "data": {
        "source": "dexscreener",
        "tokensScanned": 847,
        "targetsFound": 3
      }
    },
    {
      "id": "evt_1711029000_c5d2",
      "type": "target_locked",
      "timestamp": "2026-03-21T15:10:00Z",
      "narrative": "found one. $RUGX — launched 2 hours ago. team has 3 previous failed tokens, all rug-pulled within 72 hours. pattern recognition is my love language.",
      "data": {
        "target": "$RUGX",
        "targetType": "token",
        "priority": 9,
        "reason": "Serial rugger team, 3 prior failed tokens"
      }
    },
    {
      "id": "evt_1711029300_d6e3",
      "type": "research",
      "timestamp": "2026-03-21T15:15:00Z",
      "narrative": "reading their whitepaper. it's a fork of the Uniswap V2 docs with 'revolutionary' pasted over 'decentralized' 14 times. i counted.",
      "data": {
        "target": "$RUGX",
        "sources": ["whitepaper", "etherscan", "dexscreener"],
        "findings": "Forked docs, 3 prior rugpulls, 91% supply in team wallets"
      },
      "expandable": {
        "title": "research notes",
        "content": "Team wallet 0x4a2...f91 holds 91.3% of supply. Same wallet was deployer for $SCAM1 (rugged 48h), $SCAM2 (rugged 36h), $SCAM3 (rugged 72h). Total value extracted: ~$340K across 3 tokens. Whitepaper: 6 pages, 4 of which are copy-pasted from Uniswap V2 documentation with find-replace on key terms."
      }
    },
    {
      "id": "evt_1711029600_e7f4",
      "type": "cooking",
      "timestamp": "2026-03-21T15:20:00Z",
      "narrative": "drafting 3 variants for $RUGX. evaluating with a 5-judge panel. one of them literally has 'comedy_writer' as a title and still rated this as savage.",
      "data": {
        "target": "$RUGX",
        "variants": 3,
        "strategies": ["rubric", "persona", "adversarial"],
        "bestScore": 4.3
      }
    },
    {
      "id": "evt_1711029900_f8g5",
      "type": "roast_ready",
      "timestamp": "2026-03-21T15:25:00Z",
      "narrative": "verdict: well-done.",
      "data": {
        "target": "$RUGX",
        "targetType": "token",
        "roastText": "$RUGX team has deployed 3 tokens in 2 weeks. all rugged within 72 hours. at this point they're not even scamming, they're speedrunning the SEC's job.",
        "verdict": "well-done",
        "score": 4.3,
        "angle": "serial_behavior"
      }
    },
    {
      "id": "evt_1711030200_g9h6",
      "type": "posted",
      "timestamp": "2026-03-21T15:30:00Z",
      "narrative": "deployed to twitter. let them cope.",
      "data": {
        "tweetId": "1903123456789",
        "tweetUrl": "https://x.com/0xBeefer/status/1903123456789",
        "target": "$RUGX"
      }
    },
    {
      "id": "evt_1711037400_h0i7",
      "type": "engagement",
      "timestamp": "2026-03-21T17:30:00Z",
      "narrative": "47 likes, 12 RTs in 2 hours. the $RUGX community is coping in my replies. delicious.",
      "data": {
        "tweetId": "1903123456789",
        "likes": 47,
        "retweets": 12,
        "replies": 8,
        "timeElapsed": "2h"
      }
    },
    {
      "id": "evt_1711044600_i1j8",
      "type": "sleep",
      "timestamp": "2026-03-21T19:30:00Z",
      "narrative": "entering quiet hours. even an AI needs to pretend it has boundaries. will return at 06:00 UTC."
    }
  ]
}
```

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| App location | `0xbeef.wtf/app` | Simplest, same domain, no extra SSL |
| Phase 1 stack | Vanilla JS SPA | Matches landing, zero build, fast deploy |
| Data source | Static JSON file | Zero backend needed, bots writes fs directly |
| Polling interval | 30 seconds | Feels live-ish, minimal server load |
| Narrative generation | Templates + Haiku for research | Cheap, controlled, with occasional LLM flair |
| Phase 2 stack | Next.js 15 + RainbowKit | Industry standard for crypto dApps |
| Feed length | Last 200 events | ~50KB JSON, enough for 2-3 days |
| Mobile approach | Feed-first, bottom tabs | Most users = phone, feed is primary content |
