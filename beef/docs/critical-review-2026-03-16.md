# $BEEF — Критический аудит и план v2

**Дата:** 16 марта 2026
**Источники:** 4 параллельных агента-эксперта (market intel, code review, strategy, speed analysis) + существующие 8 research docs
**Цель:** найти всё слабое, ускорить запуск, улучшить план

---

## Executive Summary

**Хорошие новости:** нарратив AI-агентов на пике медийного цикла (GTC NemoClaw, Coinbase x402). Окно — 2-4 недели. Base — правильная цепочка. Reply-only стратегия валидирована изменениями X API от 24 февраля. Код написан качественно.

**Плохие новости:** 30-40% написанного кода не нужно для первого твита. Экзистенциальный риск — качество контента, а не архитектура. Токеномика слабая для пассивных держателей. Бюджет без права на ошибку.

**Главный вывод:** команда строит собор, когда нужна палатка. Первый твит — через 9-14 часов работы, а не через 2 недели. Перефокусировка с инфраструктуры на контент.

---

## Часть 1. Рынок — что изменилось за 48 часов

### Нарратив разогревается

| Сигнал | Что произошло | Импликация для $BEEF |
|--------|--------------|---------------------|
| GTC NemoClaw (15-16 марта) | Nvidia open-source платформа для AI-агентов. Jensen Huang: "agentic AI — центральный элемент стека" | AI-агент нарратив на пике медийного цикла. Запуск сейчас = попутный ветер |
| AI-токены +23.7% за месяц | Лучше DeFi (+18.8%), L1/L2 (+13.3%). AI как "тихая гавань" при Fear & Greed 15 | Капитал ротируется в AI. Но Extreme Fear = осторожные покупатели |
| Coinbase x402 (февраль) | Agentic Wallets для AI-агентов на Base. Gasless, setup за минуты | Готовая инфра для burn-to-request прямо на Base |
| X запретил автоответы (24 фев) | Боты не могут тегать первыми. Только reply-when-mentioned | Наша стратегия валидирована. Спам-конкуренция снижена |
| $BULLY на Solana | Dolos ($BULLY) в нише sarcastic/roast на Solana, не на Base | Gap на Base. Но $BULLY — прямой референс для сравнения |

### Конкуренты: актуальные mcap

| Проект | Chain | Mcap | Статус |
|--------|-------|------|--------|
| VIRTUAL | Base | ~$467M | 17K+ агентов, $39.5M cumul. revenue |
| AIXBT | Base | ~$26M | -97% от ATH. Живой, но cooling |
| CLANKER | Base | ~$27-58M | Автодеплой токенов |
| MOLT (Moltbook) | Base | ~$40M | 1.5M+ зарегистрированных агентов |
| CLAWD | Base | ~$16M | Autonomous code factory |
| $BULLY (Dolos) | Solana | ~$164K | Roast-ниша, но мёртвый |

### Окно возможности

**2-4 недели.** После GTC медийный цикл пойдёт на спад. Следующий нарратив (BTC ETF flows, institutional DeFi) заберёт внимание. Запуск контента нужен в ближайшие 7 дней, токена — в ближайшие 14-21 день.

---

## Часть 2. Код — что не так

### CRITICAL (исправить до первого твита)

| # | Проблема | Файл | Fix |
|---|----------|------|-----|
| 1 | `extractJsonFromOutput` regex fallback (`/\{[\s\S]*\}/`) грубо хватает от первого `{` до последнего `}` — при нескольких JSON-блоках вернёт мусор | `claude-code.provider.ts:183` | Убрать regex fallback, бросать ошибку на нераспознанный формат |
| 2 | Нигде не проверяется длина твита ≤280 символов | Весь pipeline | Добавить `validateTweetLength()` в content filter |
| 3 | Нет дедупликации роаст-целей за день | `roast.repository.ts` | Добавить `getByTargetNameToday(name)` |

### HIGH (исправить до production)

| # | Проблема | Файл | Fix |
|---|----------|------|-----|
| 4 | Ноль тестов для `extractJsonFromOutput` — самая failure-prone функция | `claude-code.provider.ts` | 5 test cases: raw JSON, array, multi-block, empty, garbage |
| 5 | `consecutiveFailures` не сбрасывается после fallback success | `provider-manager.ts` | Reset counter в `run()` после успешного fallback |
| 6 | Нет graceful shutdown (`SIGTERM`/`SIGINT`) | `index.ts` | 5 строк: `process.on('SIGTERM', () => { db.close(); manager.shutdown(); })` |
| 7 | `ConfigRepository` — нет typed setters для `daily_limit`, `moderation_mode` | `config.repository.ts` | 2 метода |
| 8 | SDK health check тратит реальные токены API каждые 15 мин | `anthropic-sdk.provider.ts` | Заменить на models-list endpoint или убрать live call |

### MEDIUM (backlog)

- `QueuePriority` тип не enforced на уровне БД — добавить `CHECK` constraint
- `usedForRoast: number` должен быть `boolean` в `NewsItem`
- Repository тесты — нет failure-path coverage
- `retryWithBackoff` использует `console.warn` вместо `logger.warn`
- `handleRecoveryAsync` — бесполезная обёртка, удалить
- `ProviderManager.name` врёт когда в degraded mode
- `AgentDiscoveryOutput` дублирует `TargetType` вместо импорта
- `AgentAuditOutput` — мёртвый тип, удалить
- `viem` в dependencies, ничего не импортирует — удалить

---

## Часть 3. Стратегия — что слабо

### CRITICAL: качество контента — экзистенциальный риск №1

**Всё остальное вторично.** Если роасты не смешные — проект мёртв независимо от архитектуры и токеномики.

90% AI-юмора попадает в неработающие режимы:
- **Generic insult**: "ваш проект упал на 90%, вы NGMI" — не роаст, а констатация
- **Fact dump**: перечисление статистики с негативным тоном — аналитика, не комедия
- **Tryhard slang**: "ser", "ngmi", "touched grass" без punch line — CT видит насквозь

**Что работает**: неожиданное сравнение + конкретный факт + twist. Wordware был вирусным потому что находил персонализированные противоречия.

**Действие:** blind-test 20 роастов с реальными людьми вне проекта ДО продолжения разработки. Если "не смешно" — менять персонажа. Это 2 часа и спасёт месяц работы.

**Критерий из 50 тестовых роастов (TA-021):** минимум 5 должны вызвать смех у людей, которые не знают про проект. Blind test, не friend-test.

### CRITICAL: токеномика не создаёт value для пассивного держателя

Burn-to-roast — хороший механизм для дефляции. Но:

- **Слишком длинная цепочка**: купить → удержать → сжечь → ждать = 3-4 действия до value. Wordware = 1 клик, 0 долларов
- **Challenge mechanism — театр**: реально стейкать и верифицировать будет 1-3% держателей. Это механика на бумаге
- **Нет daily proof of life**: FelixCraft публикует P&L, AntiHunter — торговые сделки. Что видит держатель $BEEF ежедневно?

**Добавить:**
1. Публичный burn counter (on-chain виджет)
2. Ежедневный auto-report в Telegram: топ-3 роаста по engagement, счётчик burns
3. "Roast attribution" — если burn-to-roast генерирует вирусный пост (>1000 likes), тот кто сжёг получает public credit

### ~~HIGH: метрика запуска токена неправильная~~ → RESOLVED

**Обновление (v2):** после ресёрча прецедентов — токен запускаем на день 4-5, одновременно с работающим ботом. Viral metric (>300 RT) — post-launch KPI, не gate. Luna, AIXBT, ai16z, Freysa — все запускали токен на день 0-1 без viral proof. Ждать 3 недели = потерять GTC hype window.

### HIGH: бюджет без права на ошибку

$1,300-2,000 — реалистично для запуска, но:
- KOL за $500 с аудиторией 10-50K = лотерея. CTR 0.5-2% = 5-20 покупок токена
- Нет резерва на "что пошло не так" (минимум +$500-800)
- Реальный минимум: $1,800-2,800

### HIGH: пивот от PVP — правильный, но потерян элемент

Потеряно: азарт ставок, встроенный конфликт (two sides), фракции аудитории.

**Как вернуть без усложнения:** периодические "challenge матчи" — $BEEF публично вызывает AIXBT или другой проект на Farcaster. Нарративный PVP, не технический. Бесплатно, создаёт drama-моменты.

### MEDIUM: Farcaster — insurance, не Phase 2

При Twitter бане Farcaster становится primary мгновенно. Кросс-постинг первых 20 роастов = $0 дополнительных затрат. Запустить одновременно с Twitter.

---

## Часть 4. Скорость — главная проблема

### Диагноз: cathedral thinking

**Цифры:**
- 10 таблиц вместо 4 нужных → 150% overhead по схеме
- 7 репозиториев вместо 3 нужных → 133% overhead по data layer
- FTS5 full-text search для 0 ростов в базе
- ProviderManager с 3 режимами до product validation
- 271 строка кода (tweet, user, target repos) с нулевым ROI для запуска

**Потеря не в качестве — в sequencing.** Код хороший, он пригодится. Но порядок работы перевёрнут.

### Minimum Viable Bot — 5 компонентов

| Компонент | Что достаточно | Строк |
|-----------|----------------|-------|
| Character | `beef-bot.json` + system prompt | ~30 |
| Roast generation | 1 промпт-шаблон + `claude -p "..."` | ~100 |
| Content filter | Длина ≤280 + banned words regex | ~30 |
| Twitter client | `TwitterApi.tweet()`, 1 метод | ~80 |
| Bootstrap | Wiring + `setInterval` с jitter | ~50 |

**Итого: ~290 строк нового кода до первого твита.**

### Critical Path

```
TA-015 (personality) → TA-016 (character JSON) ─┐
                                                  ├→ TA-048 (1 prompt) → TA-020 (roast engine)
                                                  │                            │
TA-023 (content filter) ─────────────────────────┘    TA-019 (twitter client) ─┘
                                                                                │
                                                              TA-036 (bootstrap) → FIRST TWEET
```

### Timeline: 9-14 часов работы

| Задача | Часы | Параллельность |
|--------|------|---------------|
| TA-015 personality definition | 1-2 | — |
| TA-016 character config + loader | 1 | после TA-015 |
| TA-048 prompt template (roast only) | 1-2 | после TA-016 |
| TA-020 roast engine | 2-3 | после TA-048 |
| TA-023 content filter | 1 | параллельно с TA-016 |
| TA-019 Twitter client | 1-2 | параллельно с TA-020 |
| TA-036 bootstrap + wiring | 1 | в конце |
| 10-15 test roasts + tuning | 1-2 | после bootstrap |

**При 2 людях параллельно: 2 вечера. В одиночку: 3-4 вечера.**

### Kill List — заморозить до post-launch

| Задача | Почему не сейчас |
|--------|-----------------|
| TA-022 News monitor (RSS + DexScreener) | Первые 20 целей захардкодить или дать агенту найти |
| TA-039 Mention polling | Бот сначала учится постить, потом отвечать |
| TA-040 Queue manager class | QueueRepository уже есть |
| TA-038, TA-049 Jitter scheduler (11 job types) | `setInterval(roastJob, randomBetween(2h, 4h))` = 10 строк |
| TA-042 Graceful shutdown module | `process.on('SIGTERM')` = 5 строк |
| TA-043 Integration tests | После MVP |
| TA-037 >80% test coverage | Тесты для critical path only |
| Milestone 3 (Telegram, health, metrics) | Всё после MVP |
| Milestone 4 (learning, reply-guy, engagement) | Всё после MVP |

### Что упростить но сохранить

| Вместо | Сделать | Экономия |
|--------|---------|----------|
| ProviderManager в bootstrap | Прямой вызов ClaudeCodeProvider | ProviderManager вернуть через неделю |
| Scheduler с 11 job types | `setInterval` + `Math.random()` | 190 строк |
| Target discovery agent | Массив из 10 вечных целей + Claude сам найдёт | News monitor = Phase 2 |

---

## Часть 5. Обновлённый план

### Фаза 0: Content Validation (день 0-1)

**Цель:** убедиться что AI-роасты вообще смешные.

1. Написать personality document (TA-015) — 1 час
2. Сгенерировать 20 роастов через Claude прямо в терминале (без кода) — 1 час
3. Разослать в 2-3 крипто-чата как "AI написал про X, смешно?" — 1 час
4. **Если не смешно — СТОП. Менять персонажа, не код.**

### Фаза 1: First Tweet Sprint (дни 1-3)

**Цель:** бот постит первый роаст в Twitter.

| День | Человек A (контент/агент) | Человек B (инфра) |
|------|--------------------------|-------------------|
| 1 | TA-016 character JSON + loader | TA-023 content filter |
| 1 | TA-048 craft-roast prompt | TA-019 Twitter client |
| 2 | TA-020 roast engine | TA-036 bootstrap |
| 2 | Fix CRITICAL code issues (3 шт) | Twitter handle + API credentials |
| 3 | 10-15 test roasts (DRY_RUN) | Deploy на VPS |
| 3 | Prompt tuning | Первые 3-5 реальных ростов (moderation) |

### Фаза 2: Proof of Content (дни 3-14)

**Цель:** достичь метрики "1 роаст с >300 RT".

- 3-5 роастов/день в moderation mode (ручное одобрение через Telegram)
- Reply-guy mode вручную (15 мин/день)
- Farcaster кросс-постинг (одновременно с Twitter)
- A/B тестинг стилей роастов: data-driven vs purely funny vs controversial
- Мониторинг: какие цели/стили дают лучший engagement

### Фаза 3: Token Launch (дни 14-21)

**Только после достижения viral метрики.**

1. Запуск $BEEF через Bankr
2. Включение burn-to-roast (минимальная on-chain интеграция)
3. KOL seed (1-2 micro-KOL, $500-1000)
4. Публичный burn counter

### Фаза 4: Scale (дни 21+)

- Автоматический scheduler (заменить `setInterval` на полноценный)
- Mention polling
- News monitor
- Telegram admin bot
- Learning module

---

## Часть 6. Что изменить немедленно — Top 5

### 1. Blind-test контента СЕГОДНЯ (CRITICAL)

Попросить Claude сгенерировать 20 роастов. Разослать в крипто-чаты. Если не смешно — остановить разработку и менять персонажа. **2 часа работы, спасает месяц.**

### 2. Перефокусировать следующий коммит на "первый твит" (CRITICAL)

Правило спринта: ни одна строка кода не пишется если она не ведёт к первому реальному твиту. Scheduler, tests >80%, news monitor — всё после.

### 3. Запустить Farcaster одновременно с Twitter (HIGH)

$0 дополнительных затрат. Страховка при бане. Кросс-постинг = 10 строк кода.

### 4. ~~Изменить метрику токен-launch~~ → Ускорить токен на день 4-5 (CRITICAL)

Ресёрч: все успешные AI-агент проекты запускали токен на день 0-1 (Luna, AIXBT, ai16z, Freysa). Ждать viral proof = терять hype window. Токен СОЗДАЁТ виральность, а не наоборот.

### 5. Исправить 3 CRITICAL бага в коде (HIGH)

- Убрать regex fallback в `extractJsonFromOutput`
- Добавить tweet length validation
- Добавить target dedup check

---

## Сводная таблица рисков (обновлённая)

| Риск | Оценка | Митигация |
|------|--------|-----------|
| AI-роасты не смешные | CRITICAL | Blind-test до продолжения кода |
| Токеномика слабая для пассивных держателей | CRITICAL | Burn counter, daily report, roast attribution |
| Over-engineering задерживает launch | CRITICAL | Kill list, 48-hour sprint focus |
| Бюджет без резерва | HIGH | Увеличить до $1,800-2,800 или принять риск |
| Twitter бан | HIGH | Farcaster одновременно = insurance |
| Метрика launch оторвана от реальности | HIGH | Viral proof вместо follower count |
| `extractJsonFromOutput` вернёт мусор в production | HIGH | Убрать regex, добавить тесты |
| Контент-выгорание к месяцу 3 | MEDIUM | Weekly community vote + character tuning |
| AI agent sentiment cooling (macro) | MEDIUM | GTC даёт 2-4 недели попутного ветра |
| Rug-усталость рынка | MEDIUM | Публичная команда, прозрачная механика |
| KOL бюджет = лотерея | MEDIUM | Планировать KOL как тест, не катализатор |

---

## Источники

- GTC NemoClaw: [CoinDesk](https://www.coindesk.com/markets/2026/03/10/ai-tokens-rally-after-nvidia-open-source-agent-plan-beating-coindesk-20)
- X API policy changes: [OpenTweet](https://opentweet.io/blog/twitter-automation-rules-2026)
- AI sector mcap: [Coira Research](https://coira.io/blog/ai-agents-crypto-2026-breakout-narrative)
- Coinbase x402: [FinTech Weekly](https://www.fintechweekly.com/news/ai-agents-crypto-payments-coinbase-nvidia-nemoclaw-fintech-2026)
- Base ecosystem: [PANews](https://www.panewslab.com/en/articles/b98e8fd1-b414-4afe-98c2-e7c2705b7190)
