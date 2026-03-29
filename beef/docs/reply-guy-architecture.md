# Reply Guy: Autonomous Reply Pipeline

## Goal

Автономный цикл: мониторинг → отбор → генерация → dry-run/постинг.
Настраиваемый объём: 30-40/день для dry run (калибровка), 15-20/день для live mode.

## Architecture

```
Timeline Monitor (*/10 cron, existing)
  │
  │  poll() → ScoredTweet[] (5-30 за цикл)
  │  sendMonitorDigest() → Telegram ALPHA chat
  │
  │  onNewTweets callback (fire-and-forget)
  │
  ▼
ReplyGuyPipeline (NEW, async, не блокирует monitor)
  │
  ├─ 1. Hard filter (код, мгновенно)
  │     score ≥ 12, age < 60 min, length ≥ 50,
  │     not in reply_guy_candidates, daily < CAP
  │
  ├─ 2. LLM batch eval (Sonnet CLI, 1 вызов, ~8-12s)
  │     2-8 кандидатов → JSON с roastability + reasoning + angle
  │     Timeout: 30s
  │
  ├─ 3. Select winners (roastability ≥ threshold)
  │     Dry run: ≥ 5 (больше данных для калибровки)
  │     Live: ≥ 7 (только качественные)
  │     Max per cycle: 3
  │
  └─ 4. For each winner:
        │
        ├─ getTweet(tweetId) → полные метрики
        │  Timeout: 10s
        │
        ├─ generateRoastLightning(tweetMode: true)
        │  10 variants → prefilter → dedup → top 1
        │  Timeout: 45s
        │
        └─ DRY_RUN=true:  sendDryRun() → Telegram admin chat
           DRY_RUN=false: replyToTweet() → Playwright → notify Telegram
```

### Почему fire-and-forget, а не синхронно

Первая версия плана блокировала monitor poll. Проблемы:
- LLM eval (~12s) + lightning gen (~18s × 2 winners) = ~50s дополнительно к poll
- `isRunning` guard в TimelineMonitor — если poll затянулся, следующий пропускается
- CLI subprocess может повиснуть → monitor мёртв

Решение: monitor вызывает `onNewTweets(scored)` callback и **не ждёт**. Reply-guy работает асинхронно в фоне. Если падает — логирует ошибку, monitor не затронут.

```typescript
// index.ts wiring
const replyGuy = new ReplyGuyPipeline({ ... });
const monitor = new TimelineMonitor({
  ...,
  onNewTweets: (tweets) => {
    void replyGuy.processCycle(tweets).catch(err =>
      logger.error({ err }, 'Reply guy cycle failed')
    );
  },
});
```

### Почему НЕ OpenClaw

OpenClaw — NL-интерфейс для людей. Автономный пайплайн — это код.

| Фактор | OpenClaw | Native |
|--------|----------|--------|
| БД доступ (dedup, daily count) | HTTP → API → SQL | Прямой SQL |
| Roast engine | Нет доступа | In-process |
| Timeout/retry control | Нет | Полный контроль |
| Failure blast radius | Gateway down = всё мертво | Изолированные ошибки |

OpenClaw остаётся для ad-hoc команд: "roast this tweet" через Telegram.

## Tweet Selection

### Layer 1: Hard Filter (код)

| # | Фильтр | Зачем |
|---|--------|-------|
| 1 | `score ≥ 12` | Минимум B-tier(5) + keyword(5) + freshness(1) + substance(2) = 13. Порог 12 пропускает A/S-tier без keyword match |
| 2 | `ageMinutes < 60` | Engagement window. Реплай на твит старше часа уже не попадёт в видимую часть thread |
| 3 | `text.length ≥ 50` | Нужен substance для quote-flip. Короткие "gm" / "lfg" нероастабельны |
| 4 | `NOT in reply_guy_candidates` | Dedup — не оценивать один и тот же твит повторно |
| 5 | `daily count < CAP` | `REPLY_GUY_DAILY_CAP` — основной volume knob |

**Убрано из первой версии:**
- `!isReply` — **ошибка**. Base category специально включает реплаи (`-is:retweet`, без `-is:reply`). KOL, отвечающий с bad take в чужом треде — отличная цель. Вместо hard filter: LLM оценивает engagement potential реплаев ниже (меньше visibility).
- `followersK ≥ 5` — **бессмысленно**. `followersK` в ScoredTweet — из статического конфига, не live API. Все 75 таргетов уже курированы.

**Ожидаемый пропуск:** ~20-30 твитов/цикл → 3-8 кандидатов проходят hard filter.

### Layer 2: LLM Evaluation (Sonnet CLI)

Один batch-вызов на цикл. Получает 2-8 кандидатов, возвращает JSON.

**Что оценивает (конкретные сигналы для $BEEF):**

| Сигнал | Вес | Примеры |
|--------|-----|---------|
| **Quote-flippable** | Критический | Их слова можно буквально перевернуть. "biggest L2 by far" → "biggest cope by far" |
| **Factually attackable** | Высокий | Цифра/утверждение, которое можно опровергнуть: "Base has 50% ETH TVL" |
| **Hypocrisy/contradiction** | Высокий | Проповедует decentralization, сидит на централизованном chain |
| **Controversial take** | Средний | Горячая тема, thread уже набирает ratio — наш реплай увидят |
| **Fresh engagement wave** | Средний | Твит набирает momentum (likes/RTs растут) |

**Что дисквалифицирует (anti-patterns, explicit в промпте):**

| Anti-pattern | Почему |
|--------------|--------|
| Breaking news (factual report) | Нечего атаковать — нет мнения, только факты |
| Personal milestone ("hit 100K followers") | Punching down vibes, не наш бренд |
| Grief/loss/health | Токсично, никакой engagement стоимости |
| Technical deep-dive | Слишком нишево, аудитория не оценит |
| Already ratioed | Опоздали — dog pile не даёт visibility |
| Our own reply targets | Уже реплаили этому автору за последние 24ч |

**Формат ответа:**

```json
[
  {
    "tweetId": "1234567890",
    "roastability": 8,
    "angle": "QUOTE_FLIP",
    "reasoning": "Claims Base has 50% of ETH TVL — factually wrong, easy dunk with real DeFiLlama data"
  },
  {
    "tweetId": "1234567891",
    "roastability": 3,
    "reasoning": "Just reporting Aerodrome yield numbers — factual, nothing to attack"
  }
]
```

### Layer 3: Enrichment (lightweight)

**Изменение vs первая версия:** первый план полностью пропускал enrichment. Это ошибка — без контекста автора roasts будут поверхностными.

Но полный `twitterEnricher.enrich()` (profile + 20 recent tweets + replies + likes) — это ~5s + API reads. Для 2-3 winners за цикл — 10-15s + 6 API reads. При 40/день = 240 дополнительных API reads.

**Решение: lightweight enrichment.** Только `getTweet(tweetId)` для полных метрик (likes, RTs, replies, views, quotedTweet, inReplyToTweetId). Это даёт:
- Метрики для Telegram preview (engagement numbers)
- Parent/quoted tweet chain для контекста
- Достаточно данных для tweet-mode roast (который и так фокусируется на тексте твита, не профиле)

Полный enrichment — в Phase 2 (live mode), когда volume ниже и качество критичнее.

### Volume Model

```
Dry run (REPLY_GUY_DRY_RUN=true, CAP=40):
  75 таргетов → ~200 твитов/день
  Hard filter (score ≥ 12) → ~60-80 кандидатов/день
  LLM eval → ~40-50 с roastability ≥ 5
  Lightning gen → 40 roasts/день (capped)

  Стоимость:
  - LLM eval: ~40 batch calls/день (max 144, но большинство циклов 0 кандидатов)
  - Lightning: ~40 calls/день
  - API reads (getTweet): ~40/день → из бюджета 17,500/мес (0.2%)
  - Всё через CLI Max = $0

Live mode (REPLY_GUY_DRY_RUN=false, CAP=20):
  Те же фильтры, но roastability ≥ 7 + CAP=20
  Lightning gen → 15-20 roasts/день
  API reads: ~20/день (0.1% бюджета)
```

## Dry Run vs Live Mode

Единый флаг `REPLY_GUY_DRY_RUN` контролирует поведение:

| Аспект | `DRY_RUN=true` | `DRY_RUN=false` |
|--------|-----------------|------------------|
| Действие | Отправка в Telegram | Постинг через Playwright + уведомление |
| Рекомендуемый CAP | 30-40 (больше данных) | 15-20 |
| Roastability порог | ≥ 5 (видим и средних кандидатов) | ≥ 7 (только качественных) |
| Enrichment | Lightweight (getTweet only) | Full (twitterEnricher.enrich) |
| Telegram label | `🏜 DRY RUN` | `✅ POSTED` |
| Approve buttons | Нет (informational) | `✅ Post` / `❌ Skip` (если auto-post выключен) |

**Зачем разный порог для dry run?** При roastability ≥ 5 мы видим кандидатов, которые LLM считает "средними". Это даёт данные для калибровки — можно понять, где порог 7 отсекает правильно, а где теряет хорошие цели.

### Telegram Dry Run Format

```
🏜 DRY RUN · Reply Guy #23/40

💬 @jessepollak · 850K · 3m ago
"Base just crossed $5B TVL — biggest L2 by far.
The future of onchain is here."
👁 45.2K · ❤️ 1.2K · 🔁 230 · 💬 89

🔥 Reply:
"biggest l2 by far" ser your tvl is 60%
bridged eth sitting in aave. that's not
adoption, that's a savings account with extra steps

<tg-spoiler>📊 Monitor: 19pts · Roastability: 8/10
Angle: QUOTE_FLIP
"biggest L2 by far" — factually challengeable.
TVL composition attackable with DeFiLlama data.
High engagement = reply gets visibility.</tg-spoiler>
```

### Telegram Live Post Format

```
✅ POSTED · Reply Guy #12/20

💬 @jessepollak · 3m ago
"Base just crossed $5B TVL..."

🔥 Reply (posted):
"biggest l2 by far" ser your tvl is...

🔗 x.com/0xBeefer/status/123456789
```

## DB Schema

```sql
-- Migration 018 (or next available)
CREATE TABLE reply_guy_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL UNIQUE,
  author_handle TEXT NOT NULL,
  tweet_text TEXT NOT NULL,
  tweet_url TEXT NOT NULL,
  monitor_score INTEGER NOT NULL,
  is_reply INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL,                    -- S/A/B/C from monitor
  -- LLM evaluation
  roastability INTEGER,                  -- 1-10, NULL = not evaluated
  reasoning TEXT,
  suggested_angle TEXT,
  -- Generation
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','evaluated','selected','generated','posted','skipped')),
  roast_text TEXT,
  roast_score REAL,                      -- lightning self-eval score
  -- Lifecycle timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  evaluated_at TEXT,
  generated_at TEXT,
  posted_at TEXT,                         -- dry-run sent OR live posted
  -- Live mode tracking
  posted_tweet_id TEXT                    -- our reply tweet ID (live mode only)
);

CREATE INDEX idx_rg_status ON reply_guy_candidates(status);
CREATE INDEX idx_rg_created ON reply_guy_candidates(created_at);
CREATE INDEX idx_rg_author ON reply_guy_candidates(author_handle);
```

**Изменения vs v1:** добавлены `is_reply`, `tier`, `roast_score`, `posted_tweet_id`, индексы. Убран `sent_at` (заменён на `posted_at` — unified для dry run и live).

## Implementation Plan

### Phase 1: Dry Run MVP

**Step 1 — DB + Repository**
- Migration: `reply_guy_candidates` table + indexes
- `ReplyGuyCandidateRepository`: insert, markEvaluated, markGenerated, markPosted, getTodayCount, hasSeen, getDailyStats
- Pruning: удаление записей старше 14 дней (аналог monitor)

**Step 2 — Hard Filter + LLM Evaluator**
- `src/reply-guy/reply-guy-selector.ts`
- `filterCandidates(tweets: ScoredTweet[], todayCount: number, cap: number): ScoredTweet[]`
- `evaluateBatch(candidates: ScoredTweet[]): Promise<EvaluatedCandidate[]>` — CLI subprocess
- Eval prompt с конкретными сигналами + anti-patterns (таблицы выше)
- JSON parse с fallback: если LLM вернул невалидный JSON → skip цикл, логировать
- **Timeout: 30s** на CLI subprocess

**Step 3 — Pipeline Orchestrator**
- `src/reply-guy/reply-guy-pipeline.ts`
- `processCycle(scoredTweets: ScoredTweet[]): Promise<void>` — main entry point
  1. Hard filter → candidates[]
  2. Skip if 0 candidates
  3. LLM eval → evaluated[]
  4. Filter by roastability threshold → winners[]
  5. Cap by `MAX_PER_CYCLE`
  6. For each winner:
     a. `getTweet(tweetId)` — полные метрики (timeout: 10s)
     b. `generateRoastLightning(tweetMode: true)` — (timeout: 45s)
     c. Pick top variant
     d. Save to DB (status='generated')
     e. If `DRY_RUN`: send Telegram dry-run
     f. Else: `replyToTweet(text, tweetId)` → save `posted_tweet_id`, send Telegram notification
- **Total cycle timeout: 3 min** — если превышен, abort remaining winners

**Step 4 — Telegram Formatter**
- `src/reply-guy/reply-guy-notify.ts`
- `formatDryRunMessage(candidate, tweetData, roastText, dailyCount, cap)`
- `formatLivePostMessage(candidate, tweetUrl)`
- `sendReplyGuyNotification(token, chatId, html)`
- Uses `<tg-spoiler>` for reasoning section

**Step 5 — Wiring in index.ts**
- Callback pattern: `onNewTweets` на TimelineMonitor
- `config.ENABLE_REPLY_GUY` → instantiate pipeline
- Fire-and-forget: `void pipeline.processCycle(tweets).catch(...)`
- No changes to TimelineMonitor class (только конструктор принимает optional callback)

**Step 6 — Config**
- Новые env vars в Zod schema (reuse existing `ENABLE_REPLY_GUY`, `REPLY_GUY_DAILY_CAP`)
- Добавить: `REPLY_GUY_DRY_RUN`, `REPLY_GUY_MIN_ROASTABILITY`, `REPLY_GUY_MAX_AGE_MINUTES`, `REPLY_GUY_MAX_PER_CYCLE`

### Phase 2: Live Posting

- `REPLY_GUY_DRY_RUN=false` → `replyToTweet()` через Playwright
- Full enrichment (`twitterEnricher.enrich`) для deeper roasts
- Inline buttons: `✅ Post` / `❌ Skip` (если `REPLY_GUY_AUTO_POST=false`)
- Auto-post for roastability ≥ 9 + tier S/A
- 24h per-author cooldown (не реплаить одному автору чаще раза в сутки)
- Save to `roasts` table with `source: 'reply_guy'` for metrics tracking

### Phase 3: Learning Loop

- Track engagement на posted replies (metrics cron уже существует)
- Correlation: roastability score vs actual engagement → threshold tuning
- High-engagement replies → auto-add to few-shot examples
- Weekly report: hit rate, avg ER, best/worst angles, best/worst targets

## Config

```env
# Existing (already in Zod schema)
ENABLE_REPLY_GUY=true                # master switch
REPLY_GUY_DAILY_CAP=40               # volume knob (40 for dry run, 20 for live)

# New
REPLY_GUY_DRY_RUN=true               # true=Telegram only, false=post via Playwright
REPLY_GUY_MIN_ROASTABILITY=5          # LLM eval threshold (5 for dry run, 7 for live)
REPLY_GUY_MAX_AGE_MINUTES=60          # tweet freshness window
REPLY_GUY_MAX_PER_CYCLE=3             # max winners per 10-min cycle

# Existing but unused (will now be wired)
REPLY_GUY_INTERVAL_MINUTES=15         # NOT USED — runs inside monitor cycle, not own cron
```

**`REPLY_GUY_INTERVAL_MINUTES`** — уже в Zod-схеме, но не нужен. Reply-guy работает внутри monitor cron (*/10), не в собственном. Оставляем в схеме для обратной совместимости, не читаем.

## File Structure

```
src/reply-guy/
├── reply-guy-pipeline.ts              — orchestrator: cycle → filter → eval → generate → notify
├── reply-guy-selector.ts              — hard filter + LLM batch evaluation
├── reply-guy-candidate.repository.ts  — SQLite CRUD
├── reply-guy-notify.ts                — Telegram formatters (dry run + live)
└── types.ts                           — EvaluatedCandidate, CycleResult
```

## Design Decisions

### 1. Fire-and-forget callback, не синхронная вставка в monitor

**Проблема v1:** reply-guy блокирует monitor poll. CLI subprocess (LLM eval) может повиснуть → monitor мёртв.

**Решение:** `onNewTweets` callback + `void ... .catch()`. Monitor не знает о reply-guy, pipeline работает в фоне.

**Trade-off:** если pipeline крашится, нет retry до следующего цикла. Приемлемо — следующий цикл через 10 мин.

### 2. Score ≥ 12 вместо ≥ 14

**Проблема v1:** порог 14 отсекает A-tier без keyword match (8 + 1 + 2 = 11) и S-tier свежие без substance (10 + 3 = 13). Теряем хорошие цели.

**Решение:** 12 — пропускает A-tier + freshness (8 + 3 + 1 = 12) и B-tier + keyword + freshness (5 + 5 + 3 = 13). C-tier (max 3 + 5 + 5 + 2 + 2 = 17, realistic 3 + 5 + 1 = 9) всё ещё отсекается.

### 3. Replies допускаются (hard filter убран)

**Проблема v1:** `!isReply` убивает целый пласт хороших целей. Base category специально включает replies в поисковый запрос.

**Решение:** LLM eval снижает roastability для low-visibility replies естественным образом (сигнал "engagement potential"). Reply на 500-reply thread S-tier KOL — это видимо. Reply на 2-reply C-tier — нет. LLM это различит.

### 4. Lightweight enrichment (getTweet only), не full profile

**Проблема v1:** enrichment не упоминался. Без данных об авторе — поверхностные roasts.

**Решение для Phase 1:** `getTweet()` даёт метрики + parent tweet chain. Достаточно для tweet-mode roasts, которые фокусируются на тексте, не профиле. Full enrichment (+5s + API reads) — в Phase 2 для live mode, где volume ниже.

### 5. Разные пороги для dry run vs live

**Проблема:** одинаковый порог не даёт данных для калибровки.

**Решение:** dry run с roastability ≥ 5 показывает весь спектр — и "отличных" (8-10), и "средних" (5-6) кандидатов. Можно визуально оценить, где LLM ошибается, и скорректировать prompt или порог до перехода в live mode.

### 6. Прямой posting, не через queue

**Проблема:** queue manager запускает полный generation pipeline (3 strategies × 2). Для reply-guy генерация уже произошла (lightning).

**Решение (Phase 2):** `replyToTweet()` напрямую из pipeline → save to `roasts` table. Queue — для items, которым нужна генерация. Здесь roast уже готов.

### 7. DAILY_CAP как главный volume knob

Вместо отдельных конфигов для dry run и live — один `REPLY_GUY_DAILY_CAP`. Пользователь ставит 40 для dry run, 20 для live. Просто и прозрачно.
