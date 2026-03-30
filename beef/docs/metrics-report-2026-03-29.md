# Metrics Report — @0xBeefer — 2026-03-29

Full analytics report. Data source: SQLite `bot_tweets` (Twitter API v2 sync). Period: March 20–27, 2026.

## Account Overview

| Metric | Report Mar 26 | Current (Mar 29) | Delta |
|---|---|---|---|
| Tweets (live) | 121 | 125 | +4 |
| Followers | 26 | 27 | +1 |
| Following | 90 | 90 | 0 |
| Total Impressions | 13,378 | 14,584 | +1,206 (+9%) |
| Total Likes | 113 | 120 | +7 |
| Avg ER | 3.76% | 3.62% | -0.14pp |
| Deleted tweets | 0 | 0 | — |

**Вывод:** Рост замедлился. +4 твита за 3 дня (бот работал 1 день из 3 — Mar 27 only). Follower прирост остановился: +1 за 3 дня vs +9 за предыдущие 2 дня.

## Week-over-Week Comparison

| Метрика | Неделя 1 (Mar 20–24) | Неделя 2 (Mar 25–27) | Тренд |
|---|---|---|---|
| Твитов | 51 | 74 | +45% |
| Активных дней | 5 | 3 | — |
| Твитов/день | 10.2 | 24.7 | **+142%** ⚠️ |
| Impressions | 5,243 | 9,341 | +78% |
| Likes | 67 | 53 | **-21%** ⚠️ |
| Avg ER | 5.73% | 2.16% | **-62%** 🔴 |
| Like rate (likes/imp) | 1.28% | 0.57% | **-55%** 🔴 |
| Твитов с лайками | 54.9% | 41.9% | -13pp |
| Zero-engagement | ~40% | ~54% | +14pp |

**Главная проблема: объём вырос в 2.4x, а качество упало в 2.7x.** Impressions росли медленнее, чем объём — meaning каждый дополнительный твит приносит всё меньше reach. Likes абсолютно упали при росте объёма. Классический quality dilution.

### Like Rate Trend (ежедневно)

| Дата | Tweets | Impressions | Likes/tweet | Like rate |
|---|---|---|---|---|
| Mar 20 | 4 | 395 | 3.5 | 3.54% |
| Mar 22 | 9 | 2,463 | 1.1 | 0.41% |
| Mar 23 | 9 | 347 | 0.6 | 1.44% |
| Mar 24 | 28 | 1,973 | 1.3 | 1.88% |
| Mar 25 | 37 | 4,839 | 0.7 | 0.54% |
| Mar 26 | 36 | 4,481 | 0.7 | 0.58% |
| Mar 27 | 1 | 21 | 1.0 | 4.76% |

**Паттерн:** Like rate стабилизировался на ~0.55% при 35+ tweets/day. Это 6x ниже, чем при 4 tweets/day. Mar 24 — sweet spot: 28 tweets, 1.88% like rate, 1.3 likes/tweet.

## Dead Tweet Analysis

| ER Bucket | Tweets | % | Avg Impressions |
|---|---|---|---|
| 0% (dead) | 58 | 46% | 51 |
| <1% | 15 | 12% | 558 |
| 1–3% | 16 | 13% | 122 |
| 3–5% | 10 | 8% | 80 |
| 5–10% | 8 | 6% | 23 |
| 10%+ | 18 | 14% | 16 |

Без изменений vs прошлый отчёт (было 46%). 58 твитов получили impressions (avg 51), но ноль engagement. Это значит: Twitter показывает reply, но аудитория target-аккаунта не кликает.

**Wasted reach:** 12 твитов с 100+ impressions и 0 likes = 2,599 потерянных impressions. Примеры:

| Tweet | Impressions | Target |
|---|---|---|
| "@retardmode showed a normie..." | 506 | @retardmode |
| "@lookonchain @machibigbrother..." (media) | 355 | @lookonchain |
| "@coinbureau if your payments..." | 182 | @coinbureau |
| "@blockchainchick banks warned..." | 147 | @blockchainchick |
| "@Cointelegraph 14 years..." | 132 | @Cointelegraph |
| "@dwr spent $180m..." | 111 | @dwr |
| "@CryptoGodJohn 'holy shit...' " | 111 | @CryptoGodJohn |

**Паттерн:** Твиты, которые получают 100+ impressions но 0 likes — это почти всегда ответы крупным аккаунтам, где аудитория просто пролистывает. Roast хороший, но target не конвертирует.

## Engagement by Type

| Type | Count | Avg Imp | Total Imp | Avg Likes | Avg ER |
|---|---|---|---|---|---|
| Reply | 107 | 127.0 | 13,585 | 0.90 | 4.0% |
| Original | 18 | 55.5 | 999 | 1.33 | 2.0% |

Reply-guy strategy остаётся core — replies дают 2.3x больше impressions и 2x ER. Но **avg likes у originals выше** (1.33 vs 0.90), что говорит о том, что follower audience конвертирует лучше. С ростом фолловеров originals станут ценнее.

## Target Performance

### High-ROI Targets (composite score = impressions × ER)

| Target | Replies | Avg Imp | Likes | Avg ER | Composite |
|---|---|---|---|---|---|
| @NikitaCometa | 10 | 250 | 10 | 7.06% | 13.0 |
| @WatcherGuru | 1 | 695 | 12 | 1.73% | 12.0 |
| @cryptorover | 2 | 49 | 6 | 8.13% | 5.0 |
| @CoinDesk | 2 | 138 | 3 | 1.08% | — |
| @Cointelegraph | 7 | 70 | 8 | 2.75% | 4.0 |

### Wasted Effort (high reach, zero/near-zero conversion)

| Target | Replies | Avg Imp | Likes | Avg ER | Problem |
|---|---|---|---|---|---|
| @CryptoTice_ | 2 | 538 | 1 | 0.14% | Huge reach, no conversion |
| @coinbureau | 2 | 391 | 3 | 0.25% | Same pattern |
| @HYPERDailyTK | 2 | 316 | 1 | 0.10% | Shill audience |
| @lookonchain | 3 | 260 | 3 | 0.24% | Whale alert audience ignores reply guys |
| @zachxbt | 2 | 209 | 1 | 0.36% | Dedicated audience, won't engage outsiders |
| @lulupengue | 3 | 225 | 3 | 0.41% | Low conversion |
| @dwr | 1 | 111 | 0 | 0.00% | Farcaster bubble |
| @CryptoGodJohn | 1 | 111 | 0 | 0.00% | Shill audience |

**Вывод:** Крупные crypto news/whale аккаунты дают reach но не engagement. Единственное исключение — @WatcherGuru (timing + hot topic). Best ROI — средние аккаунты с engaged community (@cryptorover, @Cointelegraph, @arkham).

## Timing Analysis

### By Hour (UTC)

| Hour | Tweets | Avg Imp | Avg ER | Best? |
|---|---|---|---|---|
| 22:00 | 3 | 29 | 14.3% | ✅ High ER |
| 14:00 | 4 | 98 | 9.0% | ✅ Good both |
| 19:00 | 6 | 17 | 7.0% | ER only |
| 13:00 | 18 | 42 | 7.0% | ✅ Volume proof |
| 12:00 | 7 | 103 | 7.0% | ✅ Good both |
| 20:00 | 2 | 1,116 | 6.0% | ✅ Highest reach |
| 15:00 | 4 | 270 | 2.0% | Reach only |
| 07:00 | 6 | 119 | 0.0% | 🔴 Dead zone |
| 05:00 | 1 | 483 | 0.0% | 🔴 Dead zone |

**Sweet spot:** 12:00–14:00 UTC и 18:00–22:00 UTC. Полностью мёртвая зона: 03:00–07:00 UTC.

### By Day of Week

| Day | Tweets | Avg Imp | Avg ER |
|---|---|---|---|
| Sunday (0) | 9 | 274 | 7.74% |
| Monday (1) | 9 | 39 | 2.84% |
| Tuesday (2) | 28 | 71 | 6.55% |
| Wednesday (3) | 37 | 131 | 2.64% |
| Thursday (4) | 36 | 125 | 1.59% |
| Friday (5) | 5 | 83 | 3.43% |
| Saturday (6) | 1 | 65 | 1.54% |

**Воскресенье и вторник** — лучшие дни. Среда-четверг worst (скорее всего из-за volume spike 37/day).

## Tweet Length Analysis

| Длина | Tweets | Avg Imp | Avg ER |
|---|---|---|---|
| Short (<80) | 13 | 119 | 2.3% |
| Medium (80–150) | 71 | 126 | **4.4%** ✅ |
| Long (150–250) | 40 | 103 | 2.8% |
| Extra (250+) | 1 | 12 | 0.0% |

**Sweet spot: 80–150 символов.** Подтверждается second time — достаточно substance, не теряется внимание. Short tweets (<80) — часто мемы/картинки без текста, low conversion.

## Impression-to-Engagement Conversion

| Imp Bucket | Tweets | Avg Likes | Avg ER | Total Likes |
|---|---|---|---|---|
| 500+ | 7 | 3.57 | 0.58% | 25 |
| 200–500 | 10 | 1.60 | 0.55% | 16 |
| 100–200 | 15 | 1.27 | 1.11% | 19 |
| 50–100 | 20 | 1.00 | 1.97% | 20 |
| 20–50 | 27 | 0.59 | 3.37% | 16 |
| <20 | 46 | 0.52 | 6.42% | 24 |

**Обратная корреляция impressions-ER сохраняется.** Это классический паттерн нового аккаунта: Twitter показывает reply аудитории target, но та аудитория не знает бота и не конвертирует. Low-impression tweets (direct conversations) конвертируют в 10x лучше.

**Значение:** Чтобы пробить ceiling, нужны не больше impressions, а больше followers. Когда база фолловеров вырастет, ER на высоко-impression tweets начнёт расти.

## Best Tweets (Composite Score)

Top 5 по reach × engagement (лучший баланс):

| # | Tweet | Imp | Likes | ER | Pattern |
|---|---|---|---|---|---|
| 1 | "@NikitaCometa algo set a new all-time low..." | 2,213 | 6 | 0.59% | Quote-flip (price data) |
| 2 | "@WatcherGuru $299 to $103. circle proved..." | 695 | 12 | 1.73% | Quote-flip (IPO price) |
| 3 | Algorand Turing award original | 183 | 8 | 4.9% | Absurd comparison |
| 4 | "i was supposed to be a trading bot..." | 149 | 5 | 4.0% | Self-aware humor |
| 5 | "@cryptorover $5.9M — roughly 1% of ark's..." | 34 | 5 | 14.7% | Quote-flip (position size) |

**Winning patterns остались те же:** quote-flip, absurd comparison, self-aware humor. Hypocrisy catch тоже работает (@SatoshiFlipper: 33% ER).

## Data Gaps

- **roast_id не связан:** 0 из 125 tweets привязаны к таблице `roasts`. Из-за этого невозможно анализировать engagement by roast angle. Нужна миграция или скрипт-линковщик.
- **Metrics sync остановился 27 марта** (последний tweet Mar 27 06:52 UTC). Бот, вероятно, был неактивен 28–29 марта — нужно проверить.
- **Нет данных по reply delay** (join на `tweets_observed` пуст — parent tweets не сохраняются в эту таблицу для reply-guy mode).

## Сравнение с прошлым отчётом (Mar 26)

| Рекомендация из Mar 26 | Статус | Результат |
|---|---|---|
| Снизить объём до 15–20/день | ❌ Не сделано | Volume вырос до 24.7/day, ER упал на 62% |
| Фильтр мин. 500 followers для targets | ❌ Не сделано | ~15 tweets ушли на spam-аккаунты |
| Сдвинуть posting schedule | ❌ Не сделано | 04–07 UTC по-прежнему dead zone |
| Приоритет news account replies | ✅ Частично | WatcherGuru, CoinDesk, Cointelegraph в мониторе |
| Quote-flip pattern | ✅ Используется | Остаётся #1 паттерн |
| Follow-back growth loop | ❌ Не сделано | Followers: 26→27 (+1) за 3 дня |
| Track ER weekly | ✅ Этот отчёт | ER: 5.73% → 2.16% 🔴 |

## Выводы

### Что работает

1. **Reply-guy strategy** — replies дают 2.3x reach vs originals. Core стратегия верна.
2. **Quote-flip pattern** — consistently highest engagement. @WatcherGuru reply с 12 likes = лучший результат.
3. **Medium-length tweets (80–150)** — 4.4% ER, sweet spot подтверждён дважды.
4. **Тайминг 12–14 и 18–22 UTC** — стабильно лучшие часы.
5. **Нет shadowban** — 0 deleted tweets, suppression minimal (5 tweets <20% median).

### Что не работает

1. **Объём 25–37 tweets/day убивает качество.** ER падает линейно с ростом volume. Optimal: 15–20/day.
2. **46% dead tweets** — почти половина контента не конвертируется. Нужен pre-filter по target quality.
3. **Крупные аккаунты не конвертируют.** @CryptoTice_ (538 avg imp, 0.14% ER), @coinbureau (391, 0.25%). Reach без engagement — пустые калории.
4. **Follower growth застопорился.** +1 за 3 дня. Без фолловеров originals не работают, а reply conversion не растёт.
5. **roast_id не линкуется** — невозможно анализировать какие angles работают лучше. Критичный data gap.

## Рекомендации

### Критичные (немедленно)

1. **Снизить объём до 15–20 replies/day + 3–5 originals.** Данные однозначны: 28 tweets/day (Mar 24) = 1.88% like rate. 37 tweets/day = 0.55%. Экономим API budget и повышаем качество каждого твита.

2. **Добавить минимальный follower filter: 1K+ для reply targets.** Убирает spam-аккаунты (<50 followers) и мелких, где reach = 0.

3. **Отключить posting в dead zone 03:00–07:00 UTC.** 8 tweets с 0% ER. Чистый waste.

### Стратегические (эта неделя)

4. **Линковать roast_id к bot_tweets.** Без этого невозможен angle analysis. Простой скрипт: match по tweet_id из roasts.posted_tweet_id → bot_tweets.tweet_id.

5. **Запустить follow-back loop.** Follow 20–30 crypto reply-guy аккаунтов в день. Типичный follow-back rate в CT: 15–25%. За неделю = +20–50 followers. Каждый follower увеличивает baseline impression для originals.

6. **Приоритизировать mid-tier targets** (5K–100K followers) над mega-аккаунтами. @Cointelegraph (7 replies, 70 avg imp, 8 likes) лучше чем @CryptoTice_ (2 replies, 538 avg imp, 1 like). Engaged community > big number.

7. **A/B тест media vs text.** Текущая выборка: 12 media, 113 text. Media ER ниже (2.79% vs 3.7%), но sample size слишком мал. Нужно 30+ media tweets для статистики.

### Мониторинг

8. **Еженедельный ER check.** Если ER упадёт ниже 1.5% при 15–20 tweets/day — это сигнал shadowban или spam classification.

9. **API Budget:** 204/17,500 (1.2%) — отлично, запас на весь месяц.

10. **Metrics sync:** Проверить, почему бот не постил 28–29 марта. Если downtime — починить. Если schedule — ок.
