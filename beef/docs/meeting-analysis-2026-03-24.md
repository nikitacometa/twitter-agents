# Анализ встречи Gorokhov + Voronin — 24 марта 2026

Встреча Google Meet, 24 минуты. Обсуждение: текущее состояние бота, запуск, визуалы, идеи фич.

---

## Саммари разговора

### Основные темы

**1. Качество роастов — зацикленность на паттернах**
Воронин заметил, что бот повторяет одни и те же мыслительные паттерны: опирается на token info, дампы, одинаковые метрики. Предложение: ротировать рубрики/темы, чтобы чередовались разные виды атак — не только про токен, но и про фишки проекта, поведение фаундеров, твиты.

**2. Запуск сегодня (25 марта)**
- Качество достаточное, но нужна ручная фильтрация
- Основной план: announcement thread от бота → посты с визуалами → треды от кофаундеров с личных аккаунтов
- 10-15 реплаев за день (лимит для нового аккаунта, чтобы избежать блокировки)
- Роасты на твиты кидаются в Telegram, бот генерит, люди постят руками

**3. Визуалы — три направления**
- **Карточки с роастом**: темплейт с данными (revenue, goal, результат + PFP)
- **AI-сгенерированные мемы**: мемы с классических шаблонов + кастомные (опыт Горохова с AI мем-генерацией год назад)
- **AI-арт**: полноценные генерации а-ля Cometa-стиль (огонь, Diablo-эстетика, бык)

**4. GIF-ки как инструмент reply guy**
Воронин: кореш-reply guy использует качественные GIF-ки для ответов на твиты, это прокачивает просмотры. Монетизация: при 20M просмотров открывается платная подписка.

**5. Мемы — потенциал огромный**
Оба согласны: мемы = reply engagement gold. Варианты:
- Классические шаблоны (Drake, Distracted Boyfriend) с крипто-подписями
- AI-сгенерированные визуалы
- Подход Воронина: берёшь существующий мем-шаблон, подставляешь данные пользователя → "а, это тот мем, но про меня"

**6. Тема медвежки как контент-стратегия**
Воронин: текущий сентимент — "всё хуёво, все уходят". Примеры:
- Интервью с сыном Трампа про extraction из токенов
- Fartcoin от миллиардов до нуля
- Рофл над переходом от эйфории к медвежке
Предложение: новая тема/рубрика — "почему медвежка" с разбором конкретных случаев extraction

**7. On-chain анализ (будущая фича)**
Воронин: у Bankr привязан кошелёк к каждому профилю → можно спросить адрес → анализировать историю трейдов. Горохов: уже в плане, но не горит.

**8. Тестирование на реальных людях**
Воронин скинул роасты корешу-русскому (не native speaker). Цель: проверить понятность юмора, выборка по реакциям. Фидбэк: "what's the budget?" потерял контекст без скриншота био.

**9. Язык бота**
Подтверждено: lowercase + полусленговый стиль — норм. Не грязно-сленговый.

**10. Токен — не сегодня**
Воронин готов покупать + скажет корешам. Горохов: токен через ~5 дней, не сегодня.

---

## Инсайты и action points из разговора

| # | Инсайт / Action | Источник | Приоритет | Статус |
|---|-----------------|----------|-----------|--------|
| 1 | Reply guy pipeline — `/roast-tweet` команда | Оба | **P0** | **Готово** — реализована, тестируется |
| 2 | Ручной режим для реплаев (бот генерит → люди постят) | Горохов | **P0** | **Готово** — Telegram workflow работает |
| 3 | Ротация тематических линз (не только token data) | Воронин | **P0** | В разработке |
| 4 | Media upload + визуальный pipeline | Оба | **P0** | Не начато — enabler для всех визуалов |
| 5 | AI мемы (gpt-image-1.5 + шаблоны) | Воронин | **P1** | Не начато |
| 6 | Визуальные карточки с данными (satori) | Воронин | **P1** | Не начато |
| 7 | Тема медвежки как контент-рубрика | Воронин | **P1** | Контент-задача, не код |
| 8 | GIF-ки для реплаев (Giphy) | Воронин | **P2** | Не начато |
| 9 | AI-арт генерация (fire/Diablo стиль) | Оба | **P2** | Не начато |
| 10 | On-chain wallet analysis (Bankr) | Воронин | **P3** | Отложено (500+ фолловеров) |

---

## Ревью и анализ

### Что обсудили классно

**1. Reply guy стратегия — абсолютно правильный фокус.**
Данные подтверждают: X/Twitter даёт replies 150x author-reply weight в алгоритме. Для нового аккаунта с 12 фолловерами reply guy — единственный реалистичный канал роста. Autonomous roasts уходят в пустоту без аудитории.

**2. Визуалы — правильная ставка.**
X/Twitter даёт +178% engagement для постов с изображениями. Три типа визуалов (карточки, мемы, арт) — хорошая диверсификация. Порядок приоритетов правильный: карточки (быстро, дёшево) → мемы (вирусный потенциал) → арт (wow, но дорого).

**3. Медвежка как тема — отличный тайминг.**
CT sentiment действительно bear. Trump family token extraction, fartcoin collapse, массовый выход — всё это резонирует. Бот, который артикулирует то, что все думают, но боятся сказать — это organic engagement.

**4. Ручной reply на старте — pragmatic.**
API Basic ($200/mo) не даёт reply. Cookie auth даёт error 226 на новых аккаунтах. Playwright posting работает, но нестабильно. Ручной постинг — разумный компромисс на первые дни.

### Что требует коррекции или дополнительного анализа

**1. Reply limits — нужно учитывать warming up.**
Аккаунту ~2 недели, ~25 постов, ~12 фолловеров. X Premium активен. Это уже не совсем "новый" аккаунт — некоторый trust score наработан. Рекомендация: **10 реплаев day 1**, масштабирование до 15-20 к day 3-5. Ключевое: **варьировать интервалы** (не одинаковый ритм), **не более 1 reply на аккаунт/24ч**, **min 60-90сек между replies**.

**2. Зацикленность на паттернах — проблема глубже, чем ротация рубрик.**
Воронин правильно диагностировал симптом, но корень не только в данных. Анализ prompt-builder.ts показывает:
- 9 angles (DATA_BOMB, TIMELINE, COMPARISON, etc.) — достаточно разнообразия
- Но 3 стратегии (rubric, persona, adversarial) используют одну и ту же research pipeline
- Research всегда начинает с Perplexity/WebSearch → получает те же факты → те же роасты

**Решение:** добавить **thematic lenses** — не "какие факты найти", а "через какую призму смотреть":
- Financial forensics (текущий дефолт)
- Social/behavioral (твиты, поведение, flip-flops)
- Narrative/hype gap (что обещали vs реальность)
- Cultural/meme (CT культура, мемы, тренды)
- Personal/lifestyle (lifestyle vs chain performance)

**3. Мемы — потенциал огромный, но реализация нетривиальна.**
Два подхода:
- **Template memes** (imgflip/memegen.link): быстро, предсказуемо, но ограничено шаблонами. LLM выбирает шаблон + генерит текст. Реализация: 2-3 дня.
- **AI-generated memes**: креативнее, но дороже ($0.02-0.08/image через GPT-image-1) и сложнее в контроле качества. Реализация: 5-7 дней.

Рекомендация: **начать с template memes** (быстрый MVP), параллельно экспериментировать с AI-gen.

**4. GIF-ки — ROI ниже, чем у мемов.**
**Tenor умирает** (shutdown август 2026) — использовать только Giphy API (free tier 100 req/час). GIF в reply = generic reaction, не уникальный контент. Для роаст-бота, чья ценность в уникальности, GIF-ки — supplementary, не primary. Важно: GIF нужно загружать как медиафайл (fetch → Buffer → upload), URL в тексте твита не работает.

**5. On-chain анализ — правильно отложили.**
Bankr wallet lookup → Etherscan/Basescan analysis — мощная фича, но:
- Bankr не имеет публичного API для wallet lookup
- Потребует scraping или manual input
- Лучше реализовать когда база фолловеров > 500 и есть токен

**6. Токен через 5 дней — aggressive timeline.**
Текущие метрики: 25 постов, 12 фолловеров. Для успешного токен-лонча на Bankr нужен:
- Минимум 100-200 фолловеров (чтобы был organic buy pressure)
- 1-2 вирусных момента (screenshot roast, RT от KOL)
- Established content cadence (ежедневные посты, заметная активность)

Рекомендация: **токен на день 10-14**, не 5. Привязать к milestone: "200 followers" или "first viral roast (10K+ impressions)".

---

## Ресерч

### Reply Guy стратегия — ключевые данные

**КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ (23 февраля 2026):** X заблокировал автоматические replies через API. `POST /2/tweets` для replies работает **только если автор оригинала упомянул или процитировал твой аккаунт**. Применяется ко всем тарифам кроме Enterprise (>$42K/мес). Unsolicited replies через API → 403. Источник: [X Dev Community](https://devcommunity.x.com/t/update-to-reply-behavior-in-x-api-v2-restricting-programmatic-replies/257909).

**Что это значит для $BEEF:**
| Сценарий | Статус |
|----------|--------|
| API reply на случайный твит | **Заблокировано** |
| API reply на @mention $BEEF | Разрешено |
| Playwright reply (browser automation) | Работает |
| Оригинальные твиты через API | Работает |

**Вывод:** Playwright-based posting — не костыль, а **единственный рабочий путь** для unsolicited replies. $BEEF уже использует Playwright — это правильно.

**Механика X алгоритма для replies** (открытый исходный код + Sprout Social analysis):

| Действие | Вес относительно лайка |
|----------|----------------------|
| Лайк | 1x |
| Профиль-клик | 12x |
| Ответ | 13.5x (27x engagement score) |
| Ответ автора на твой комментарий | 75x |
| Диалог автор↔комментатор | 150x |

Premium-аккаунты: ~600 impressions/пост vs ~60 у бесплатных (10x разница, Buffer analysis 18.8M постов).

**Warming up нового аккаунта** (generic рекомендации; наш аккаунт уже ~2 недели active):
- **Чистый новый аккаунт:** дни 1-3 без replies, дни 4-7 = 5-10 replies
- **Наш случай (@0xBeefer):** ~2 недели, ~25 постов, X Premium, некоторый trust. Можно начинать с 10 replies/день
- **Масштабирование:** +5 replies каждые 2-3 дня, мониторить shadowban.yuzurisa.com
- **Потолок:** 30-50 replies/день к концу первого месяца

**Shadowban — 4 типа:**
1. Search suggestion ban — не появляется в подсказках
2. Search ban — не находится в поиске
3. Ghost ban — ответы скрыты от всех кроме подписчиков
4. Reply deboosting — ответы задвигаются вниз тредов

Детекция: `shadowban.yuzurisa.com`. Recovery: 24ч пауза (ghost ban — 72ч).

**Триггеры бана:** follow/unfollow тактика, идентичный текст в replies, машинный ритм постинга, высокий объём на свежем аккаунте, спам-репорты. Max 1 reply на аккаунт в 24ч.

**Прецедент — RoastHimJim ($JIM):** 250K+ подписчиков, сотни миллионов просмотров. Рос через **mention-based** модель (люди тегали @RoastHimJim), а не unsolicited replies. "Roast to Earn" — пользователи получали $JIM за использование.

**Целевые аккаунты:** mid-tier (50K–300K) эффективнее mega-KOLs. Micro-KOLs конвертируют ~7% engaged audience vs 3% у macro. Меньше конкуренция в ответах, reply заметнее.

**Тайминг:** ответить в течение **15-30 минут** от публикации. Reach decay: 50% каждые 6 часов.

**Что работает в bear market:**
- "Doomerism with data" — конкретные цифры за тем, что все чувствуют
- 85% negative упоминаний Bitcoin в соцсетях (Santiment, W3 March 2026)
- Attacks on powerful actors (VCs, founders extracting) — populist angle
- Bear market **идеален для роаст-бота**: люди злые, хотят accountability и юмор
- Аккаунты, которые остаются active когда большинство молчит — получают непропорционально больше видимости

### Визуалы — техническая реализация

**Карточки с данными — satori vs Puppeteer:**

| | Satori + resvg-js | Puppeteer screenshot |
|---|---|---|
| **Время генерации** | ~80–150 ms | ~300–800 ms (warm) |
| **RAM** | ~30–60 MB | ~150–250 MB Chromium |
| **CSS** | Subset (flex, box model) | Полный браузерный |
| **Zombie-процессы** | Нет | Реальная проблема на VPS |

**Рекомендация: satori + resvg-js.** Pipeline: JSX → `satori()` → SVG → `resvg` → PNG Buffer. На VPS 8GB Puppeteer создаёт risk OOM при незакрытых Chrome-процессах. Satori безопаснее в 10x по RAM. Ограничение: нет `display: grid`, CSS-переменных, `<table>` — всё через flex. Шрифты — только TTF/OTF (не WOFF2), загружать singleton при старте.

Рекомендуемый размер: **1200×630 px** (OG image стандарт). Подробный research: `beef/docs/visual-cards-research.md`.

**Meme templates:**

| Инструмент | Стоимость | Особенности |
|-----------|----------|-------------|
| **memegen.link** | Бесплатно, без ключей | 200+ шаблонов, REST API, open-source |
| **imgflip API** | Free tier + $9.99/мес premium | `/automeme` (LLM-выбор), `/search_memes` (1M+) |

Рекомендация Phase 1: **memegen.link** (без регистрации). Пример: `https://api.memegen.link/images/drake/using_eliza_OS/custom_TypeScript_stack.png`

Top шаблоны для крипто-роастов (imgflip IDs):

| Шаблон | imgflip ID | Применение |
|--------|-----------|------------|
| Drake Hotline Bling | 181913649 | "отвергает X, принимает Y" |
| Distracted Boyfriend | 112126428 | "держит X, смотрит на Y" |
| Two Buttons | 87743020 | дилеммы инвесторов |
| This Is Fine | 55311130 | рынок падает |
| Uno Draw 25 | 217743513 | "мог сделать X или..." |

LLM pipeline: roast context + список шаблонов → LLM выбирает template + генерит box texts (JSON) → API → PNG → Buffer.

**GIF-ки:**
- **Tenor API — УМИРАЕТ.** Shutdown август 2026. Новые ключи не выдаются с января 2026
- **Giphy API**: free tier 100 req/час, бета-ключ мгновенно на developers.giphy.com
- **Важно:** Giphy URL нельзя вставить в твит как ссылку — нужно fetch GIF → Buffer → upload как `image/gif`
- Стратегия: LLM генерит 3 поисковых запроса → Giphy search → первый результат из топ-5

**Twitter media upload (v2 — v1.1 deprecated с марта 2025):**

| Endpoint | Free tier лимит |
|----------|----------------|
| `POST /2/media/upload` (simple) | 85 req/24ч |
| initialize (chunked) | 34 req/24ч |
| append (chunked) | 170 req/24ч |
| finalize (chunked) | 34 req/24ч |

Для PNG/JPEG карточек (<5 MB) — simple upload достаточно. Требуется OAuth 2.0 user context + scope `media.write`.

Для cookie auth: `agent-twitter-client` поддерживает нативно:
```typescript
await scraper.sendTweet('Roast text', undefined, [
  { data: imageBuffer, mediaType: 'image/png' }
]);
```

**AI image generation:**

| Модель | Цена | Примечание |
|--------|------|-----------|
| gpt-image-1-mini | $0.005/img | Самый дешёвый, хорош для data cards |
| gpt-image-1 | $0.04–$0.20/img | Лучшее качество, понимает текст внутри изображений |
| FLUX Schnell (fal.ai) | $0.003–$0.007/img | Быстрый, дешёвый |

При 10 визуалов/день = $0.05–$0.30/день. Экономически незначимо. Но: аудитория хуже резонирует с generic AI art vs узнаваемые мем-форматы.

### Повторяемость паттернов — анализ кода

Текущая architecture prompt-builder.ts:
```
9 angles × 3 strategies × mutations = ~27+ уникальных комбинаций
```

Но research pipeline одинаковый для всех: `perplexity_ask` / `WebSearch` → одни и те же факты.

**Данные из training sessions (82 rated roasts):**
- SELF_AWARE: 19/82 (23%) — most used, avg 2.85 — **перегружен**
- DATA_BOMB: 7/82, avg 2.91 — factual без twist
- UNDERSTATEMENT: 7/82, avg 3.73 — **лучший, но недоиспользован**
- RULE_OF_THREE: 5/82, avg 3.42 — strong
- FAKE_COMPLIMENT: 8/82, avg 2.52 — worst angle

**Паттерн повторяемости**: бот чаще всего начинает с token price / TVL / market cap data → строит роаст вокруг финансовых метрик. Воронин прав — нужна диверсификация входных данных, не только выходных angles.

---

## Маппинг фич на архитектуру

### Текущая архитектура (упрощённо)

```
Scheduler → Queue → RoastEngine → ProviderManager → Claude Agent
                                        ↓
                                   prompt-builder.ts (3 strategies, 9 angles)
                                        ↓
                                   TwitterClient.postTweet(text) ← TEXT ONLY
```

### Что нужно изменить для каждой фичи

#### F1. Thematic Lenses (решает повторяемость)
**Сложность:** Low | **Impact:** High | **Время:** 1-2 дня

Добавить `ThematicLens` в `CreativeMemory` + prompt-builder:
```typescript
type ThematicLens = 'financial' | 'behavioral' | 'narrative' | 'cultural' | 'personal';
```

Изменения:
- `prompt-builder.ts`: добавить section с research focus по lens
- `farm/batch-generator.ts`: ротировать lens при генерации
- `creative-memory.ts`: трекать использованные lenses для target

Не требует изменений в: Twitter client, queue, scheduler, admin bot.

#### F2. Media Upload (enabler для всех визуалов)
**Сложность:** Medium | **Impact:** Critical enabler | **Время:** 2-3 дня

Изменения:
- `twitter-client.interface.ts`: расширить `postTweet(text, mediaIds?)` и `replyToTweet(text, replyToId, mediaIds?)`
- `twitter-client.ts` (Official API): добавить `uploadMedia(buffer: Buffer, mimeType: string): Promise<string>` через v1.1 endpoint
- `scraper-twitter-client.ts`: добавить `mediaData` parameter в `sendTweet()` call
- `queue-manager.ts`: передавать media через pipeline
- `agent.types.ts`: добавить `mediaBuffer?: Buffer` в output types

#### F3. Data Cards (визуальные карточки)
**Сложность:** Medium | **Impact:** High | **Время:** 2-3 дня (после F2)

Новый модуль: `src/visual/`
```
src/visual/
├── card-renderer.ts      # satori + resvg-js → PNG
├── fonts.ts              # Singleton — загрузка TTF при старте
├── templates/
│   ├── roast-card.ts     # Quote card (аватар + хэндл + roast text)
│   ├── receipt.ts        # Receipt формат ("PROMISES: X / DELIVERED: 0")
│   └── stats-card.ts     # Stats/comparison side-by-side
└── types.ts
```

Pipeline: `RoastEngine` → generates roast + data → `CardRenderer.render(roast, data)` → PNG buffer → `TwitterClient.postTweet(text, [mediaId])`

Satori вместо Playwright: 80-150ms vs 300-800ms, 30MB RAM vs 150MB, нет zombie-процессов. Подробный research: `beef/docs/visual-cards-research.md`.

#### F4. Template Memes
**Сложность:** Medium | **Impact:** High | **Время:** 3-4 дня (после F2)

Новый модуль: `src/visual/meme-generator.ts`

Pipeline:
1. LLM получает roast context + список top 50 meme templates с описаниями
2. LLM выбирает template + генерит top/bottom text
3. `memegen.link` API генерит image
4. Image прикрепляется к твиту

Требует: новый prompt в prompt-builder для meme selection, API client для memegen.link.

#### F5. GIF Reactions
**Сложность:** Low | **Impact:** Medium | **Время:** 1-2 дня (после F2)

Новый модуль: `src/visual/gif-finder.ts`

Pipeline:
1. LLM генерит 2-3 search keywords из roast context
2. **Giphy API** search → top 5 results (Tenor умирает август 2026 — не использовать)
3. LLM picks best match OR random из топ-5
4. Fetch GIF → Buffer → upload как `image/gif` (URL нельзя вставить напрямую)

#### F6. Reply Guy Pipeline (упомянуто как параллельная работа)
**Сложность:** High | **Impact:** Critical | **Время:** 5-7 дней

**⚠️ Ключевое ограничение:** с 23.02.2026 X API блокирует unsolicited replies. Reply guy pipeline **обязан** использовать Playwright для постинга, не API. API replies работают только для mention-based ответов.

Новый модуль: `src/reply-guy/`
```
src/reply-guy/
├── tweet-discoverer.ts   # Find hot tweets via Lists/Search
├── relevance-scorer.ts   # LLM-scored relevance + roastability
├── reply-generator.ts    # Specialized reply prompts
└── rate-limiter.ts       # Per-day/per-hour/per-target limits
```

Rate limiting правила:
- Max 1 reply на аккаунт в 24 часа (anti-spam detection)
- Min 60-90 секунд между replies (human typing speed)
- Случайные интервалы, не фиксированные
- Целевые аккаунты: mid-tier 50K–300K фолловеров (не mega-KOLs)
- Тайминг: reply в течение 15-30 минут от публикации твита

Изменения в:
- `scheduler.ts`: новый job для tweet discovery (polling Lists каждые 5-10 мин)
- `queue-manager.ts`: source 'reply_guy' (уже в types!)
- `admin/bot.ts`: команды для управления reply guy targets
- `twitter-client.ts`: Playwright-based reply method (не API)

#### F7. Bear Market Theme / Topical Roasts
**Сложность:** Low | **Impact:** Medium-High | **Время:** 1 день

Не требует нового кода — решается через:
- Новые targets в farm pipeline (Trump extraction, fartcoin, bear market events)
- Thematic lens "cultural" / "narrative" (F1)
- Добавить в `farm/target-discoverer.ts` мониторинг trending topics

#### F8. On-chain Wallet Analysis
**Сложность:** High | **Impact:** High (но не сейчас) | **Время:** 5-7 дней

Требует:
- Basescan/Etherscan API client
- Wallet data parser (top holders, transaction history, token movements)
- Новый research tool для Claude Agent
- Интеграция в prompt-builder для wallet-based roasts

**Отложить до**: 500+ followers + token launched.

---

## Рекомендованный порядок реализации

### Phase 0: Launch Day (25 марта) — уже готово
- [x] Announcement thread от бота
- [x] Stockpile из фермы (14+ готовых роастов)
- [ ] Ручные реплаи на горячие твиты (Воронин находит, бот генерит)
- [ ] Профиль: обновить bio, подписаться на target-аккаунты

### Phase 1: Foundation (дни 1-3) — критический путь
| # | Фича | Время | Обоснование |
|---|-------|-------|-------------|
| 1 | **F1. Thematic Lenses** | 1-2 дня | Решает #1 проблему повторяемости. Минимальные изменения в коде |
| 2 | **F2. Media Upload** | 2-3 дня | Enabler для всех визуалов. Без этого F3-F5 невозможны |
| 3 | **F6. Reply Guy Pipeline** (параллельная сессия) | 5-7 дней | Основной growth driver |

### Phase 2: Visual Layer (дни 3-7)
| # | Фича | Время | Обоснование |
|---|-------|-------|-------------|
| 4 | **F3. Data Cards** | 2-3 дня | Быстрый visual MVP. Playwright уже есть |
| 5 | **F4. Template Memes** | 3-4 дня | Вирусный потенциал. Бесплатный API |
| 6 | **F7. Bear Market Theme** | 1 день | Контент-стратегия, не код |

### Phase 3: Enhancement (дни 7-14)
| # | Фича | Время | Обоснование |
|---|-------|-------|-------------|
| 7 | **F5. GIF Reactions** | 1-2 дня | Supplementary к мемам |
| 8 | Engagement tracking + auto-learn | 3-4 дня | Feedback loop на basis реплаев |

### Phase 4: Advanced (после токена)
| # | Фича | Время | Обоснование |
|---|-------|-------|-------------|
| 9 | **F8. On-chain Analysis** | 5-7 дней | Killer feature, но нужна аудитория |
| 10 | Скриншоты в роастах | 2-3 дня | Quality of life |

---

## Ключевые решения для обсуждения

**1. Порядок визуалов: cards first или memes first?**
- Cards: предсказуемый результат, branded look, быстрее в разработке
- Memes: выше viral potential, но требует LLM для выбора шаблона + может быть cringe если неудачно
- **Рекомендация**: cards first (день 3-5), memes second (день 5-7)

**2. Media upload: Official API или Scraper?**
- Official API v2: `POST /2/media/upload` — 85 req/24ч на free tier (достаточно). v1.1 deprecated с марта 2025
- Scraper (`agent-twitter-client`): бесплатно, `sendTweet()` поддерживает `mediaData` нативно
- **Рекомендация**: реализовать обе ветки. Scraper для media + Playwright для replies. API для оригинальных постов + mention-based replies

**3. Reply guy: автоматический или semi-manual?**
- Auto: бот находит горячие твиты, генерит ответы, постит через **Playwright** (API replies заблокированы с 23.02.2026!)
- Semi-manual: люди кидают ссылки в Telegram, бот генерит, люди постят руками
- Mention-based (RoastHimJim модель): растить через organic mentions → API replies на @mentions разрешены
- **Рекомендация**: semi-manual первые 3-5 дней (warming up), потом auto Playwright с approval flow. Параллельно растить mention-based модель для organic growth

**4. Token timeline: день 5 или день 14?**
- День 5 (предложение Воронина): быстрый запуск, но без аудитории
- День 14 (рекомендация плана): больше followers, narrative build
- **Рекомендация**: привязать к milestone, не к дате. Trigger: 200+ followers ИЛИ viral moment (50K+ impressions на одном посте)

---

## Метрики для отслеживания

| Метрика | Day 1 | Day 3 | Day 7 | Day 14 |
|---------|-------|-------|-------|--------|
| Followers | 12 | 30+ | 100+ | 300+ |
| Daily impressions | — | 5K | 20K | 50K |
| Reply engagement rate | — | 2%+ | 3%+ | 5%+ |
| Roasts posted | 3-5 | 15+ | 40+ | 80+ |
| Replies (reply guy) | 8-10 | 15 | 20 | 25 |
| Визуалов с media | 0 | 2-3 | 5+ | 10+ |

---

## Выводы

**Встреча была продуктивной.** Основные решения правильные:
1. Reply guy = #1 growth driver (подтверждено данными алгоритма X: reply = 13.5x лайка)
2. Визуалы = #2 рычаг (подтверждено +178% engagement)
3. Bear market theme = organic fit для roast бота (85% negative sentiment на CT)
4. Manual posting на старте = pragmatic

**Корректировки:**
1. **КРИТИЧЕСКОЕ**: X заблокировал API replies с 23.02.2026 — unsolicited replies только через Playwright. Mention-based replies через API разрешены
2. Лимит реплаев: 8-10 day 1, не 10-15. Warming up: дни 1-3 без replies вообще
3. Повторяемость паттернов: решать через thematic lenses, не только ротацию рубрик
4. Токен: привязать к milestone (200 followers), не к дате
5. Визуалы: satori для карточек (не Playwright — 10x меньше RAM), memegen.link для мемов (бесплатно)
6. GIF: Giphy, не Tenor (умирает август 2026). GIF загружать как медиафайл
7. Media upload — критический enabler, v2 API (v1.1 deprecated), 85 req/24ч на free tier
