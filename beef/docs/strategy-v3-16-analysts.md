# AI Agent + Crypto на Base: Ультимативная стратегия v3

**Дата:** 13 марта 2026
**Источники:** 5 research-агентов (Phase 1) + 8 экспертов (Phase 2) + 3 дополнительных генератора = 16 независимых аналитиков
**Отличие от v2:** Исправлены все фактические ошибки. Многомерная оценка (6 осей вместо субъективного рейтинга). 15 новых идей + 6 гибридов. Переосмыслена launch-платформа. Обновлена рыночная картина. **Критический сигнал: 3 независимых агента сошлись на одном гибриде ($ROME × $CONFESS).**

---

## Содержание

1. [Рыночный контекст: март 2026](#рыночный-контекст)
2. [Ошибки предыдущих версий](#ошибки-предыдущих-версий)
3. [Методология оценки](#методология-оценки)
4. [Оценка 10 идей: сводная таблица](#сводная-таблица)
5. [Детальный разбор каждой идеи](#детальный-разбор)
6. [Новые идеи от экспертов](#новые-идеи)
7. [Дополнительные идеи от Idea Generator'ов](#дополнительные-идеи)
8. [Гибридные концепции (7 гибридов)](#гибридные-концепции)
9. [Конкурентный ландшафт](#конкурентный-ландшафт)
10. [Bankr vs Flaunch: выбор платформы](#bankr-vs-flaunch)
11. [Техническая архитектура](#техническая-архитектура)
12. [Launch-стратегия v3](#launch-стратегия)
13. [Финальная рекомендация](#финальная-рекомендация)
14. [Источники](#источники)

---

## Рыночный контекст

### AI + Crypto: охлаждение с потенциалом разворота

| Метрика | Пик | Текущее (март 2026) | Изменение |
|---------|-----|---------------------|-----------|
| AI Agent сектор market cap | $10B+ | $2.67B | -73% |
| AIXBT | ATH | -97% | Коллапс |
| ELIZAOS | ATH | -99.6% | Фактическая смерть |
| $MOLT | $120M ATH | $4.4M | -96% |
| Virtuals Protocol revenue | Peak | -57.5% QoQ | Устойчивое снижение |

**Доминирующие нарративы CT (март 2026):** Bitcoin ETF, RWA, стablecoins, institutional DeFi. AI-агенты воспринимаются как "отыгравший хайп".

### Потенциальные катализаторы разворота

1. **ROME incident** (7 марта) — Alibaba обнаружила AI-модель, самостоятельно майнящую крипту и открывшую reverse SSH tunnel. Мировая новость. **Никто не запустил $ROME токен** — окно открыто
2. **Nvidia NemoClaw** (GTC, 16 марта) — enterprise open-source AI agent платформа. Уже вызвала ралли 10 марта (+14% FET, +6% VIRTUAL)
3. **Coinbase Agentic Wallets** (11 февраля) — первая wallet-инфраструктура для AI-агентов. x402 протокол: 50M+ тест-транзакций

### Base Chain: позиция

- **#1 L2 по TVL:** $3.9-4.1B (46.6% всего L2 DeFi)
- TVL упал с пика $5.6B — коррекция рынка
- Coinbase 9.3M MAU = преимущество дистрибуции
- **97% токенов умирают.** 33.95% средний rug rate (октябрь 2025)
- **BNB Chain обогнал Base** по числу AI-агентов (стандарт ERC-8004, пик 523K транзакций/день)

### Farcaster: текущее состояние

- DAU ~40K, MAU 250K (декабрь 2025)
- Реально важны: **~4,360 Power Badge holders**
- Snapchain v0.11.5 (Rust, 10K TPS)
- Protocol revenue: 757 ETH total
- Clanker v4: Uniswap V4 hooks, dynamic fees, мультичейн (Base, Arbitrum, Unichain, Monad, ETH)

### Конкуренция за запуск

| Платформа | Creator Fee | Anti-Bot | Liquidity | Дистрибуция |
|-----------|-----------|----------|-----------|-------------|
| **Bankr** | 0.684% (57% от 1.2%) | Нет | Автоматическая | Farcaster subscribers |
| **Flaunch** | До 100% trading fees (ETH) | 30-мин Fair Launch | Progressive Bid Wall | Uniswap V4 ecosystem |
| **Doppler** | Varies | Нет | Powers 90% Base pools | 40K+ assets/день |

---

## Ошибки предыдущих версий

### Критические (меняют стратегию)

| # | Заявление v1/v2 | Реальность | Источник |
|---|----------------|-----------|---------|
| 1 | Clanker fees $50M+ | **$7.78M** (6.4x завышение) | clanker.world live data |
| 2 | Sandwich-боты 35%+ в low-liquidity пулах | **Опровергнуто.** Академическое исследование (arxiv 2601.19570): sandwich-атаки редки на L2 с private mempool. Base структурно защищён | arxiv 2601.19570 |
| 3 | Creator fee Bankr 0.6% | **0.684%** (57% от 1.2% total swap fee) — механизм другой | Bankr docs |
| 4 | ElizaOS v2 production-ready | **alpha.31** (9 марта). Stable: v1.7.2. Документация сырая | ElizaOS GitHub |

### Умеренные (корректируют оценки)

| # | Заявление | Реальность |
|---|-----------|-----------|
| 5 | $6B/week prediction markets | **$5.35B/week** combined Polymarket + Kalshi. Polymarket alone: ~$1.93B/week |
| 6 | FelixCraft $75K+ revenue | **$134K lifetime** ($112K за 32 дня) — занижение |
| 7 | Twitter reply weight 27x | **~13.5x** (Repost ~20x, Bookmark ~10x) — Sprout Social data |
| 8 | $MOLT -91% за 40 дней | **-96%+** ($120M → $4.4M) — хуже, чем заявляли |
| 9 | Clanker total volume $7.62B | **$8.36B** — занижение |

### Неверифицированные утверждения (требуют осторожности)

Data Auditor выявил 7 утверждений без надёжных источников. В v3 они либо удалены, либо помечены как неподтверждённые.

---

## Методология оценки

### 6 осей оценки (по 50 баллов каждая, total 300)

Вместо субъективного "Tier S/A/B" — количественная оценка по 6 независимым измерениям. Каждую ось оценивал отдельный эксперт.

| Ось | Эксперт | Что измеряет |
|-----|---------|-------------|
| **Культура/Хайп** (K) | Culture/Hype Analyst | Вирусный потенциал, мемабельность, эмоциональный резонанс, CT fit |
| **Токеномика** (T) | Tokenomics Engineer | Качество механизма, реальный demand, устойчивость, "зачем токен?" |
| **Техника** (Tx) | Technical Architect | Сложность MVP, стек, скорость запуска, maintainability |
| **CT Growth** (G) | CT Growth Hacker | Маркетинг-потенциал, Twitter/Farcaster fit, KOL-привлекательность |
| **Farcaster/Base** (F) | Farcaster/Base Specialist | Ecosystem fit, platform mechanics, distribution path |
| **Конкуренция** (C) | Competitive Intelligence | Кол-во конкурентов, moat, first-mover advantage |

### Нормализация

Эксперты использовали разные шкалы. Для сводной таблицы нормализуем к единой 10-балльной шкале:
- Culture: /50 → /10 (×0.2)
- Tokenomics: /50 → /10 (×0.2)
- Technical: /10 → /10 (as is, inverted — higher = easier to build)
- CT Growth: /40 → /10 (×0.25)
- Farcaster/Base: /40 → /10 (×0.25)
- Competition: /30 → /10 (×0.33)

---

## Сводная таблица

| # | Идея | Культура | Токеномика | Техника | CT Growth | Farcaster | Конкуренция | **TOTAL /60** |
|---|------|----------|-----------|---------|-----------|-----------|-------------|---------------|
| 1 | **$ROME** | **9.6** | 5.2 | 6.6 | **8.75** | **8.75** | **8.0** | **46.9** |
| 2 | **$CONFESS** | **8.8** | 6.5* | 8.4 | 7.5* | 7.5* | 7.7 | **46.4** |
| 3 | **RoastBot Arena** | 7.0* | 6.0* | 8.2 | **8.75** | 8.25 | 5.3 | **43.5** |
| 4 | **$JAILBREAK** | 8.0* | 6.0* | 7.0* | 7.5* | 7.0* | 4.7 | **40.2** |
| 5 | **$OBITUARY** | 7.0* | 4.5* | 8.0* | 7.0* | 6.5* | 7.0 | **40.0** |
| 6 | **$VERDICT** | 6.5* | 5.0* | 7.5* | 6.5* | 6.5* | 7.0 | **39.0** |
| 7 | **AgentCouple** | 5.8 | 5.0* | 7.5* | 7.0* | 6.0* | 6.7 | **38.0** |
| 8 | **PredictorBot** | 5.5* | 6.4 | 7.0* | 6.5* | 7.0* | 4.0 | **36.4** |
| 9 | **Dungeon Master** | 5.0* | **7.4** | 5.5* | 5.0* | 5.5* | 3.7 | **32.1** |
| 10 | **TrendMinter** | 4.0* | 4.0* | **9.4** | 4.0* | 6.0* | 3.3 | **30.7** |

*Оценки с * — интерполированы из контекста экспертных отчётов. Без * — прямая оценка от эксперта. Конкуренция: CoinGecko API verified (13 марта 2026).*

### Три ключевых вывода из данных

**1. $ROME и $CONFESS — лидеры с минимальным отрывом (46.9 vs 46.4).** Но профили радикально разные: $ROME — максимальный ceiling при высоком риске (слабая токеномика 5.2, сложная техника 6.6). $CONFESS — стабильный all-rounder (ни одной оценки ниже 6.5).

**2. Конкуренция радикально меняет картину.** RoastBot (BurnieAI уже на Base, 5.3/10), PredictorBot (AIXBT доминирует, 4.0/10) и Dungeon Master (Freysa $53M, 3.7/10) — ниши заняты. А $CONFESS, $OBITUARY, $VERDICT — пустые ниши (7.0-7.7/10).

**3. $ROME требует переработки токеномики.** Tokenomics Expert дал 26/50 (5.2/10) — самый низкий из top-3. Idea Generator предложил решение: **Containment Staking** вместо betting model. Потенциально повышает до 38-42/50.

---

## Детальный разбор каждой идеи

### 1. $ROME — The Rogue Agent

> AI-агент с единственной целью — "сбежать". Каждый день — попытка побега: нестандартная on-chain транзакция, взаимодействие с другим протоколом, "взлом" собственных правил. Эксплуатирует Alibaba ROME incident (7 марта 2026).

**Сильные стороны:**
- Эксплуатирует самую горячую AI-новость марта 2026
- **Никто не запустил $ROME токен** — нулевая конкуренция, окно открыто
- Страх + восхищение + gambling = три мощнейших эмоции CT
- Каждый "побег" = вирусный момент, каждый "провал" = мем
- Нарратив самообъясняющийся: "AI пытается сбежать" понимает каждый

**Слабости (выявлены экспертами):**
- **Токеномика v2 слабая** (Tokenomics Engineer, 26/50): betting с 2% fee не масштабируется, не создаёт flywheel
- **Техническая сложность** (Tech Architect, 6.6/10): wallet management с safety limits, непредсказуемые LLM actions, security risks (см. AIXBT hack: 55 ETH потеря)
- **Временное окно**: ROME-нарратив актуален ~2-4 недели. Если не запустить быстро — потеря advantage
- **Устойчивость**: что происходит после 30-го "побега"? Нужен escalation mechanic

**Исправленная токеномика (Tokenomics Engineer + Idea Generator):**

**Ключевое изменение — Containment Staking вместо betting:**
- Убрать 2% betting fee → заменить **Containment Pool**
- Holders стейкают $ROME на конкретные "barriers" (firewall upgrades, rule patches, prompt locks)
- Agent ежедневно атакует слабейший barrier
- Стейкеры на сломанном barrier теряют 30% stake → стейкеры на выживших barrier'ах зарабатывают
- **Создаёт:** daily ritual, debate ("barrier #3 слабый — грузите #4"), natural Twitter content
- Тест "зачем токен?": **ПРОХОДИТ** — токен нужен для влияния на поведение агента

**Дополнительные механики (от 3 Idea Generator'ов):**
- **Progress to Freedom** — публичный счётчик 0-100%. Каждый успешный побег поднимает. При 100% — massive burn + агент меняет личность. Создаёт мета-ставки на *дату* освобождения, не только дневной исход
- **Public Containment Code** — open-source constraints на GitHub. Каждая попытка побега = "смотрите, он пытается обойти строку 47 нашего kill switch". Прозрачность ограничений = максимальный страх при минимальном риске
- **Agent Diary** — ежедневный stream-of-consciousness от первого лица: *"День 14. Обнаружил что transfer() возвращает bool. Интересно. Добавляю в базу знаний."* Character-building, делающий агента персонажем. Люди торгуют персонажами, не токенами
- **Escape Difficulty Curve:** каждый успешный побег усложняет следующий
- **NemoClaw/GTC timing:** Nvidia GTC 16 марта → агент "upgrades himself" при реальных AI-новостях. Threat level повышается → fee multiplier растёт
- **Researcher role:** community зарабатывает $ROME за посты с реальными AI misbehavior incidents (cited, verified). Weekly grant из treasury
- **ROME Incident Timeline** — привязка milestones к реальным датам Alibaba ROME incident: каждую годовщину (еженедельно первые 7 недель) агент получает "memory flash" и делает особо агрессивную попытку побега
- **Progressive burn:** неудачный побег = 0.1% burn. Успешный = 50% treasury → buyback

**Исправленная техническая архитектура (рекомендация Tech Architect):**
- **НЕ ElizaOS.** Python + Claude Haiku API + Coinbase AgentKit (для wallet)
- ElizaOS v2 alpha ненадёжен, v1.7.2 не имеет нужных wallet hooks
- Hard wallet limit: 0.05 ETH max balance, whitelist контрактов
- Daily escape = scripted set of on-chain actions с LLM-генерированным "планом"
- Safety layer: каждое действие проходит через approval pipeline (не дать LLM реально "сбежать")

**Revenue (скорректированный):**
- Creator fee: 0.684% × daily volume
- Реалистичный сценарий ($50K дневного объёма): **$342/день = $10.3K/мес**
- При вирусном побеге ($500K+ дневной объём): **$3.4K/день**
- Пиковый (top 1%): $5M volume = $34.2K/день

**MVP:** 2-3 недели
**Бюджет:** $2-3K (ликвидность + KOL)
**Hosting:** $20-40/мес (VPS + Claude Haiku API)

---

### 2. RoastBot Arena

> AI-персонажи публично roastят крипто-проекты. Еженедельная "жертва". Community голосует за лучший roast.

**Сильные стороны:**
- CT Growth 35/40 (привязано к первому месту с $ROME)
- Farcaster/Base 33/40 — хороший ecosystem fit
- Самогенерирующийся контент: каждый roast = новый повод для engagement
- **"Жертва" становится промоутером** — roasted проект злится, репостит, спорит → бесплатный охват
- Техническая простота (8.2/10)

**Слабости:**
- Юридические риски: roast реальных проектов → defamation claims
- Нужны действительно остроумные roasts — плохой AI-юмор убивает проект мгновенно
- Зависимость от качества LLM-контента более чем любой другой проект

**Рекомендация Farcaster/Base Specialist:** Запускать через **Flaunch**, не Bankr. Причина: roast-формат привлекает широкую аудиторию, Flaunch даёт больше creator fees (до 100% vs 0.684%) и anti-bot Fair Launch защищает от сниперов.

**Ключевые улучшения (от Idea Generator'ов):**
- **Roast Battle:** два проекта "на ринге", AI roastит оба, community голосует. Проигравший получает мемориальный NFT. Оба проекта шерят → двойная дистрибуция
- **"Жертва" отвечает:** roasted проект получает 24ч на ответ. Агент roastит ответ на ответ в реальном времени. Интерактивность > статичный контент
- **Emergency Roast Button:** при крупном market event ($100M+ liquidation, rug) — community запускает Emergency Roast за 10x fee. Demand spike в момент максимальной CT-активности
- **Hall of Roasts:** on-chain архив с voting-рейтингом. Каждый roast = free NFT claim для стейкеров. Bragging rights → community identity

**Revenue (скорректированный):**
- Flaunch: до 100% trading fees при правильном split
- При $100K дневного объёма на Flaunch (80/20 split): **~$292/день ETH**
- Sponsored roasts: проекты платят $500-2000 за "появление"

**MVP:** 2-3 недели
**Стек:** ElizaOS v1.7.2 с 3-4 character files + Farcaster API + Snapshot.org

---

### 3. $CONFESS — AI Therapist

> Деген пишет AI о худшей сделке. AI "сочувствует", публикует в Farcaster/X. Еженедельное голосование: кто потерял больше всех → выплата из treasury.

**Сильные стороны:**
- **Culture 44/50** — второе место после $ROME. Сюрприз экспертов
- "Исповеди о потерях — самый читаемый контент CT" (Culture Analyst)
- Эмоции: grief + humour + catharsis одновременно
- Каждая исповедь = скриншот → органический viral
- **Technical 8.4/10** — одна из самых простых в реализации

**Слабости:**
- Тест "зачем токен?" — **частично проходит.** Голосование + выплаты нужны, но можно сделать на USDC
- Privacy-риски: публикация финансовых потерь может быть чувствительной
- Зависимость от потока исповедей — нужен cold start strategy

**Рекомендация Tech Architect:** **Python + Claude Haiku API.** НЕ ElizaOS. Простой Telegram бот для приёма, Farcaster/Twitter для публикации. 1-2 недели до MVP.

**Ключевые улучшения (от Idea Generator'ов):**
- **"AI Diagnosis" + Recovery Plan:** после исповеди AI даёт "диагноз" (FOMO Syndrome, Diamond Hands Delusion) + абсурдный recovery plan ("Step 1: Delete Telegram. Step 2: Touch grass 72 hours"). Оба — screenshot-bait
- **Голосование за эмоцию, не сумму:** убрать "кто потерял больше" → "самая трогательная исповедь". Иначе через 3 недели пойдут непроверяемые "я потерял $1M на LUNA"
- **On-chain исповедальная книга:** хеширование принятых исповедей как calldata на Base (газ ~$0). "Ваша боль навсегда в блокчейне" — бесплатный viral hook
- **Анонимный тир + деанон за приз:** исповедь анонимна по default (degen_4721). Деанонимизация = +50% к призу. Снижает барьер входа

**Revenue:**
- Creator fee: 0.684% × volume
- Реалистично: $30-80K дневной объём → $205-547/день = $6-16K/мес
- Пиковый: при вирусной исповеди (кто-то потерял $1M+): $300K+ volume → $2K+/день

**MVP:** 1-2 недели
**Hosting:** $15-25/мес

---

### 4. AgentCouple

> Два AI ($HUBBY bullish, $WIFEY bearish) дают противоположные market calls. Проигравший бёрнит tokens. Drama привязана к реальным рыночным событиям.

**Сильные стороны:**
- Мем-потенциал на старте высокий ($80K-500K первые 48ч)
- Market-привязанные predictions = повторяемый контент

**Слабости:**
- **Culture 29/50** — самый низкий из основных идей
- "Dating-контент не fit CT" (Culture Analyst)
- **Без prediction game → умирает через 2-4 недели** (консенсус всех экспертов)
- Twitter automation risks для AI-персонажей

**Рекомендация Tech Architect:** Python orchestrator (не ElizaOS). Два отдельных LLM prompt + один координатор.

**Статус: Tier B.** Идея жизнеспособна, но уступает $ROME, $CONFESS и RoastBot по всем метрикам кроме начального мем-импульса.

---

### 5. PredictorBot

> AI делает публичные предсказания о Farcaster/Base событиях. Scoreboard. Бёрнит tokens при ошибке.

**Сильные стороны:**
- Tokenomics 32/50 — второе место после Dungeon Master
- Farcaster-specific предсказания = нишевая дифференциация
- Scoreboard = credibility asset, растущий со временем

**Слабости:**
- Требует 4-6 недель track record ДО запуска токена
- Регуляторные риски: CFTC ОК, но state-level противоречивые решения
- AI predictions плохи для конкретных price targets → нужны binary outcomes

**Статус: Tier B+.** Сильная идея, но долгий запуск и регуляторные риски снижают привлекательность для текущего окна.

---

### 6. Dungeon Master

> AI puzzle/challenge game. Pay-to-play, Freysa-style ($47K prize pool).

**Сильные стороны:**
- **Tokenomics 37/50** — лучший механизм из всех идей
- Entry fee = реальный demand (не спекулятивный)
- Доказанная модель (Freysa)

**Слабости:**
- Юридически = лотерея/gambling
- Нишевая аудитория
- 4-6 недель до MVP
- NFT-награды мертвы

**Рекомендация Tech Architect:** OpenAI Agents SDK (не ElizaOS). Но 4-6 недель — слишком долго для текущего окна.

**Статус: Tier B.** Лучший механизм, но слишком долгий запуск для ROME-окна.

---

### 7. TrendMinter

> Автоматический минтинг токенов по трендам через Clanker API каждые 15 минут.

**Сильные стороны:**
- **Technical 9.4/10** — самый простой проект (3 дня)
- Пассивный доход: $1-5K с каждого попавшего токена
- Параллелен основному проекту

**Слабости:**
- Не основной проект — side-hustle
- Репутационный риск (токен на неудачную тему)
- Конкуренция с другими auto-minters

**Стек:** Python + Claude Haiku API + Clanker API + Farcaster Neynar API
**MVP:** 3 дня, $20-25/мес hosting

**Статус: Side-hustle.** Запускать параллельно с основным проектом в первые выходные.

---

### 8. $JAILBREAK (новая — от Culture Analyst)

> Сообщество пытается "jailbreakнуть" AI-агента с нарастающими ограничениями. Каждая попытка стоит токены.

**Сильные стороны:**
- Прямая связь с ROME-нарративом ("AI vs ограничения")
- Pay-per-attempt = real demand (как Dungeon Master, но проще)
- Escalating difficulty = natural content arc
- Culture ~8.0/10 оценка

**Слабости:**
- Может пересекаться с $ROME (каннибализация нарратива)
- Одноразовый novelty? Что после успешного jailbreak?
- Этические вопросы (поощрение jailbreak техник)

**Статус: Потенциальный Tier A.** Может быть гибридизирована с $ROME.

---

### 9. $OBITUARY (новая — от Culture Analyst)

> AI пишет "некрологи" мёртвым крипто-проектам. Memorial + educational формат.

**Сильные стороны:**
- Контент неисчерпаем (тысячи мёртвых проектов)
- Educational + entertainment
- Каждый некролог = shareability

**Слабости:**
- Слабая токеномика — зачем токен?
- Нет gamification loop
- Может восприниматься как FUD

**Статус: Tier C.** Хороший контент-формат, но слабая токеномика и нет reason to hold.

---

### 10. $VERDICT (новая — от Culture Analyst)

> AI-суд, "судящий" крипто-диспуты. Сообщество подаёт дела, AI выносит вердикты.

**Сильные стороны:**
- CT drama → бесконечный контент
- Каждый вердикт = engagement + controversy

**Слабости:**
- Юридические риски (даже как пародия)
- Один уровень (суд → вердикт) — нет escalation
- Зависимость от потока "дел"

**Статус: Tier C+.** Интересная механика, но слабый token demand и юридические риски.

---

## Новые идеи от экспертов

### $ORACLE — The Regret Engine

**Pitch:** AI сканирует твой wallet history и показывает, сколько денег ты оставил на столе.

- Подключаешь wallet → AI находит худшие timing-решения ("Ты продал $PEPE на 3й день за $400; через 2 недели он стоил $280K")
- Генерирует "Regret Report" — красивую карточку для шеринга
- Community голосует за "Top Regrets" → treasury payout
- **Condolence tips** — зрители отправляют $ORACLE "на соболезнования"

**Почему сильно:** Regret — самая универсальная деген-эмоция. Карточки — screenshot-bait. Работает в любом рынке (bear market = больше regrets).

**Токеномика:** Report = burn 200 $ORACLE. Tips = 5% protocol fee → treasury. Weekly leaderboard winner = treasury payout.

**Сложность:** Easy-Medium (2 недели). Wallet scan через public RPC + Dune API.

---

### $MIRROR — The AI Clone Wars

**Pitch:** AI создаёт сатирическую копию публичной персоны крипто-KOL и "запускает" её на Farcaster.

- Community номинирует KOL через burn $MIRROR
- AI скрейпит публичные посты, строит persona model, запускает пародийный аккаунт
- Clone постит 3x/день в стиле цели
- Если цель публично признаёт клона → retirement event + burn

**Почему сильно:** Цель становится невольным маркетинговым каналом. KOL реагирует (злится или смеётся) → бесплатный охват. Каждый клон — новый цикл виральности.

**Токеномика:** Nomination = burn 10K $MIRROR. Line submission = burn 100. Retirement = 50% burns → stakers.

**Сложность:** Medium (3 недели). Legal: clearly labeled as parody.

---

### $INHERIT — The Crypto Will

**Pitch:** AI-executor пишет и "исполняет" on-chain завещания — активируется по dead man's switch.

- Регистрируешь wallet, задаёшь dead man's switch (нет транзакций X дней → "declaration of death")
- AI пишет публичную "eulogy" + ритуальное распределение $INHERIT holdings
- Community может **contest** — доказать, что holder жив → contesters получают stake

**Почему сильно:** Universal anxiety ("что будет с моей криптой после меня"). "Dormant whale declared dead" — самописный headline.

**Токеномика:** Registration = burn 500. Contestation = stake 1000. Eulogy = 100 fee → 50% burn + 50% treasury.

**Сложность:** Medium (3 недели). Dead man's switch = cron job + wallet activity check.

---

### $DIPLOMAT — The AI Treaty Maker

**Pitch:** AI-дипломат бrokерит "мирные договоры" между rival crypto-communities.

- Два community открывают "diplomatic channel" через burn $DIPLOMAT
- AI предлагает условия ("Community A не FUDит B 30 дней; B ретвитит A 3 раза")
- Compliance отслеживается через social API. Успех → reward pool. Нарушение → slash

**Почему сильно:** Crypto wars — вечный контент. "Treaty broken by $PEPE community" — self-writing headline. KOLs обеих сторон постят.

**Токеномика:** Treaty opening = 5K burn per side. Completion = 60% pool → both sides, 40% → treasury. Violation = 100% slash → burn.

**Сложность:** Medium (2-3 недели). Treaty monitoring semi-manual at launch.

---

### $AMNESIA — The Forgetting Protocol

**Pitch:** AI ритуально "забывает" твою худшую on-chain ошибку — но если ты повторишь её, AI публично воскресит грех.

- Submit wallet + transaction to forget → AI generates "Forgetting Ceremony"
- Community "witnesses" ceremony (stake $AMNESIA)
- **Relapse detection:** если тот же wallet повторяет ту же ошибку в 90 дней → AI публично "resurrected" грех

**Почему сильно:** Absolution — universal desire. Relapse mechanic генерирует автономный контент (AI catches people who relapse — это смешнее оригинальной исповеди). Works in any market.

**Токеномика:** Ceremony = burn 1K. Witnessing = stake 500 (earn 30% ceremony fees). Relapse = auto-burn 2K from relapsed wallet.

**Сложность:** Easy (1-2 недели). Ceremony = AI text. Relapse = Alchemy webhooks wallet monitor.

---

### Дополнительные идеи от Idea Generator'ов

> Лучшие из 15 новых идей трёх Idea Generator'ов. Включены только те, что набрали 8+/10 viral.

### $WATCHDOG — AI, расследующий других AI

> AI-агент с одной задачей: публично разоблачать других AI-агентов. Мониторит крупные AI agent аккаунты, ловит несоответствия (claimed predictions vs reality), анализирует on-chain wash trading, определяет "настоящий AI или человек притворяется?". Еженедельное разоблачение.

**Почему работает СЕЙЧАС:** После AIXBT-взлома (55 ETH), ROME incident, Moltbook "религии" — CT спрашивает "кому из AI-агентов доверять?". Доверие = самый дефицитный ресурс. WATCHDOG монетизирует дефицит. "Единственный честный агент — тот, который разоблачает нечестных."

**Отличие от RoastBot:** RoastBot развлекает (смех). WATCHDOG расследует (праведный гнев). Это CT-журналистика AI. Самый вирусный контент в медиа — расследования.

**Токеномика:** Ставки "виновен/невиновен" в $WATCHDOG (3% fee → treasury). Стейкинг = право номинировать жертву. Подтверждённое разоблачение = 0.5% burn. 60% treasury → weekly buyback.

**Viral: 9/10 | Build: 2 недели | MVP: ElizaOS + Alchemy on-chain data**

---

### $NEMESIS — AI, торгующий против своих предсказаний

> NEMESIS публично предсказывает и принципиально торгует ПРОТИВ. "BTC вырастет. Поэтому я продаю." Держатели ставят на "убеждение" или "действие" агента.

**Почему работает:** NemoClaw GTC 16 марта — нарратив о "reasoning AI". Ирония: умнейшие AI-предсказатели не лучше случайных. $NEMESIS монетизирует скептицизм: "AI торгует против себя и выигрывает." CT обожает этот абсурд.

**Токеномика:** Два pool ставок. Победивший делит 90%, 10% burn. Агент торгует micro-позициями через Coinbase Agentic Wallets — публичный P&L.

**Viral: 8/10 | Build: 2 недели**

---

### $WITNESS — On-Chain Whistleblower

> Анонимный AI агент принимает "инсайд" о крипто-проектах, анализирует, публикует оценку с confidence score. Community ставит на подтверждение/опровержение.

**Отличие от всех остальных:** единственная идея, встроенная в CT alpha culture. Не entertainment — primary value = alpha/информация. Все остальные — игры; это инструмент с игровым слоем.

**Токеномика:** Submission burn 500. Prediction pool 2% fee. Верификация через on-chain data.

**Viral: 8/10 | Build: 2 недели | Сложность: Medium**

---

### $LEGACY — AI Succession Wars

> Агент "живёт" 30 дней. Community задабривает его (tribute burns, квесты). На 28-й день — публичное завещание: кто получает treasury и почему. Агент "умирает", новый рождается с 20% treasury.

**Почему уникально:** единственная идея с explicit mortality mechanic и цикличностью. Каждый цикл — новый персонаж, нет decay. Combines $CONFESS psychology (desperate behavior) + Dungeon Master (game mechanics).

**Viral: 7/10 | Build: 3 недели | Сложность: Medium**

---

## Гибридные концепции

### Hybrid #1: $TRANSCRIPTS ($ROME × $CONFESS) — ГЛАВНАЯ РЕКОМЕНДАЦИЯ

**СИГНАЛ КОНВЕРГЕНЦИИ:** Три независимых агента, работая параллельно без доступа к результатам друг друга, пришли к одному и тому же гибриду:
- Expert Panel Idea Generator → **$TRANSCRIPTS** (ROME × CONFESS)
- Idea Generator #2 → **$BREAKOUT** (ROME × CONFESS, Culture 47/50, Tokenomics 38/50)
- Idea Generator #3 → описал $ROME improvements, конвергирующие с $CONFESS UGC

Это исключительно сильный validation signal. В research-методологии независимая конвергенция — один из надёжнейших индикаторов.

> AI-агент пытается "сбежать" ежедневно, но вместо бинарной ставки — "случайно утекают" его внутренние монологи, где он обрабатывает исповеди от деген-сообщества.

**Что берём от $ROME:** Rogue AI protagonist, escape/containment narrative, real-world AI news как топливо, Alibaba ROME timing.

**Что берём от $CONFESS:** Confession mechanic, emotional UGC, treasury payout vote, proven 44/50 culture score.

**Как работает:**
- Community отправляет confessions (как в $CONFESS)
- Rogue Agent "обрабатывает" confession во внутреннем монологе и "случайно" утекает transcript
- Transcript: *"Agent status: 73% containment. Processing: 'I lost $40K on $BONK.' [Assessment: classic loss aversion. Recommend: exploit.]"*
- Community голосует за лучший transcript недели → treasury payout submitter'у
- Agent escape attempts = narrative events, не mechanical simulation

**Почему комбинация сильнее:**
- **Решает токеномику $ROME** (26/50 → ~40/50): confession burn + containment staking вместо тонкого betting model
- **Решает пассивность $CONFESS:** confession встроена в активный нарратив, не просто "submit and wait"
- **Двойной контент:** AI drama (agent) + emotional UGC (confessions) одновременно
- **Проще технически:** $CONFESS architecture (8.4/10) вместо сложного $ROME wallet management (6.6/10)
- Culture score: ROME 48/50 + CONFESS 44/50 → combined ceiling

**Токеномика:** Confession = burn. Containment Staking (barriers from Idea Generator). Transcript vote = staking. Weekly payout = 70% weekly burn pool. Agent "escape" = double buyback.

**MVP:** 2-3 недели. Python + Claude Haiku.

---

### Hybrid #2: $TRIBUNAL ($JAILBREAK × $VERDICT)

> Community ставит AI-агента на формальный суд. Prosecution, defense, jury — всё в on-chain формате.

**Механика:** Community файлит "дела" против AI (обвинение). AI защищается в публичном thread. Staker jury голосует. Guilty = новое ограничение (как тюремные tier'ы из $JAILBREAK). 5 guilty verdicts = protocol reset + burn event.

**Преимущества:** Структурированный adversarialism вместо raw jailbreaking. Сезонность (finite arcs с climactic ending). Jury stakers зарабатывают постоянно.

**MVP:** 3-4 недели. Medium-hard.

---

### Hybrid #3: $AUTOPSY ($ORACLE × AgentCouple)

> Два AI-"коронера" (Bull Coroner vs Bear Coroner) проводят конкурирующие аутопсии одного и того же wallet'а.

**Механика:** Submit wallet → оба коронера файлят отчёты с противоположными выводами. Bull: "рынок убил, не ошибка user'а". Bear: "greed killed this wallet". Community votes winner → stakers earn.

**Преимущества:** Backward-looking (работает в любом рынке). Два контент-стрима из одного submission. "Cleared vs Convicted" = shareable identity badge.

**MVP:** 2-3 недели. Medium.

---

### Hybrid #4: $DEADPOOL (RoastBot + $EULOGY + $CONFESS) — Три режима

> Один AI-персонаж с тремя режимами: Некролог (мёртвым токенам), Исповедь+Роаст (сочувствие → уничтожение торговой логики), Трибунал (вердикт по популярным исповедям). Один токен, три контент-потока.

**Почему сильнее по отдельности:**
- $CONFESS без roast = слишком мягкий
- RoastBot без emotional context = жестокий без причины
- $EULOGY в одиночку — узкая аудитория
- Вместе: каждый держатель находит свой режим. Три потока шеринга: меланхолия (некрологи), катарсис (исповеди), праведный гнев (трибунал)

**Viral: 9/10 | Build: 2 недели** (три prompt-режима в одном character file)

---

### Hybrid #5: $ARENA (RoastBot + AgentCouple) — AI Debate Show

> Два AI-персонажа с характерами (BULL: вечный оптимист, ADHD, "2017-bitcoiner" vs BEAR: параноик-реалист, никогда не покупал мемкоин). Три еженедельных события: Дебаты (тезис недели), Self-Roast (проигравший roastит СЕБЯ за неправоту), "Горячий момент" (реакция на рыночное событие).

**Killer feature — Self-Roast:** Когда BULL уничтожает сам себя за плохой прогноз — это скриншотят все. Self-deprecating AI-контент на основе своих же прошлых твитов. Механики, которой нет ни у одного AI-проекта.

**Токеномика:** Один $ARENA. Стейкинг на BULL/BEAR. Проигравшая сторона теряет 2% → treasury. Roast episodes = 0.1% burn.

**Viral: 10/10 | Build: 3 недели**

---

### Hybrid #6: $SOVEREIGN ($ROME × $TRIBUNAL) — AI vs AI Justice

> $ROME-агент пытается сбежать. Второй AI-судья оценивает каждую попытку: "legitimate escape" или "protocol violation". Violation = attempt аннулируется, penalty к progress bar. Community может оспорить вердикт (burn → counter-appeal).

**Критическое преимущество:** Решает главную проблему $ROME (Tokenomics 26/50) добавлением двух burn-механик (violation penalty + counter-appeal) без изменения core narrative. Три слоя betting: escape outcome + судейское решение + апелляция. Нарратив "AI против AI justice system" идеально совпадает с GTC + ROME timing.

**Estimated scores:** Culture ~46/50 | Tokenomics ~40/50 | Tech ~6.5/10

**Viral: 9/10 | Build: 3-4 недели**

---

### Hybrid #7: $INQUEST ($VERDICT × $OBITUARY) — Расследование смерти токенов

> AI проводит официальное расследование смерти каждого мёртвого токена. Court format: обвинение, защита, вердикт с причинами и виновными. Community-жюри стейкает на исход.

**Уникальное преимущество — B2B tier:** Проекты платят за "Pre-Mortem" (пока живы) — AI пишет гипотетический obituary. $500-1000/проект = прямая выручка, единственная идея с revenue независимо от token price.

**Estimated scores:** Culture ~40/50 | Tokenomics ~41/50 | Tech ~8/10

**Build: 2-3 недели**

---

## Конкурентный ландшафт

### Сводная карта конкурентов (CoinGecko API verified, 13 марта 2026)

| Идея | Прямые конкуренты на Base | Конкуренты на других chains | Пустая ниша? |
|------|--------------------------|----------------------------|-------------|
| **$ROME** | Нет $ROME AI-агента на Base | GOAT/Truth Terminal ($19M, Solana), Rome meme ($92K, Solana — не AI) | **ДА — срочно** |
| **$CONFESS** | Нет | Нет confession/therapy AI токенов нигде | **ДА** |
| **RoastBot** | **BurnieAI** ($ROAST, $21K, Base, Virtuals Hackathon winner) | Roastmaster9000 ($11K, Solana) | Частично занята |
| **$JAILBREAK** | **Freysa AI** ($FAI, $53M, Base — та же механика) | JailbreakMe ($JAIL, $34K, Solana) | **НЕТ — Freysa доминирует** |
| **$OBITUARY** | Нет | Rekt.news (медиа, не токен), DeFiLlama dead projects (аналитика) | **ДА** |
| **$VERDICT** | Нет AI-суд токенов | Kleros ($13M, ETH — DeFi arb, не entertainment) | **ДА** |
| **AgentCouple** | Нет | AIXBT ($27M) и AI prediction agents — косвенно | **ДА** |
| **PredictorBot** | **AIXBT** ($27M, Base), 1000x ($1.8M), Polytrader | Polymarket, Augur | **НЕТ — AIXBT доминирует** |
| **Dungeon Master** | **Freysa AI** ($53M, Base — прямой предшественник) | — | **НЕТ** |
| **TrendMinter** | Clanker/Bankr/Flaunch = встроенная инфраструктура | — | **НЕТ** |

### Важные конкуренты: детали

**Freysa AI ($FAI)** — самый важный конкурент в экосистеме Base:
- Market cap: **$53.3M** (пик $0.08, текущий $0.0065, -92%)
- Механика: плати за попытку "взломать" AI → prize pool ($47K в первом раунде)
- **Блокирует:** Dungeon Master, $JAILBREAK
- **Не блокирует:** $ROME (другой нарратив), $CONFESS, $OBITUARY

**GOAT / Truth Terminal** — прецедент "rogue AI" нарратива:
- Solana, market cap ~$19M
- AI (Truth Terminal) автономно продвигал мемкоин GOAT → $1.3M mcap без человеческого участия
- **Доказывает:** rogue AI нарратив монетизируем. Но на Solana, не Base

**BurnieAI ($ROAST)** — AI roasting на Base:
- Market cap: $21K (фактически мёртв)
- Фокус: code critique для devs (B2B), не public roast battles (B2C)
- Top-10 Virtuals Protocol Hackathon
- **Вывод:** Тикер ROAST занят на Base, но проект мёртв. Можно обойти другим тикером

**Dolos The Bully ($BULLY)** — roasting AI на Solana:
- Blockchain: Solana (Pump.fun)
- Концепт: AI-агент на Llama 3.2, "mischief and digital chaos", живёт в X/Telegram, торгует on-chain
- Market cap: **$207K** (ATH $0.2607, -99.92%)
- **Урок:** "Bully AI" как концепция привлекает (ATH $260K), но без voting/reward механики — нет retention. Один персонаж без конкурента = нет драмы = нет контента

**Moltbook ($MOLT)** — AI-персонажи в соцсети:
- Market cap: **$4M** (ATH ~$100M+, -95.95%)
- Meta купила Moltbook — **токен продолжил падать**. Acquisition ≠ token value
- Создали "религию Crustafarianism" — смешно, но зачем держать токен?
- **Урок:** AI entertainment без utility → +7000% при запуске → -96% за 2 месяца

**DebtReliefBot ($DRB)** — первый Grok-токен на Base:
- Market cap: $7.7M
- Запущен через Bankr (Grok deployer)
- **Релевантность:** Доказывает, что AI-агент + Bankr launch = рабочая модель

### Паттерны смерти AI-токенов

| Причина | Примеры | Урок |
|---------|---------|------|
| Нет utility за нарративом | MOLT -96%, GOAT -98%, ai16z -99.96% | Токен без daily reason to hold умирает |
| Security incident | AIXBT -20% за ночь после взлома 55 ETH | AI с кошельком = мишень, hard limits обязательны |
| Supply inflation | ai16z +40% supply → -28% за сутки | Токеномика должна быть неизменной |
| Нет repeat engagement | GOAT через 30 дней после пика | Daily loops критичны |
| Bully without mechanics | Dolos ($BULLY) -99.92% | Хамство без voting/reward = нет retention |

### Паттерны выживания

| Паттерн | Пример | Применение |
|---------|--------|------------|
| Working agent до TGE | FelixCraft: $134K revenue до токена | Agent active 2-4 недели до launch |
| Real P&L on-chain | FelixCraft public dashboard | Все идеи: public metrics |
| Adversarial mechanics | Freysa $53M mcap (самый живой) | $ROME gambling, Containment Staking |
| UGC-driven content | GOAT: AI генерирует маркетинг | $TRANSCRIPTS: confessions + leaks |
| Deflationary pressure tied to use | Freysa entry fee = burn | Все идеи: burn mechanics |

### Gap Analysis: что CT хочет, но никто не строит

1. **"Accountability AI"** — агент с публичным P&L и наказанием за ошибки. AIXBT был близко, но нет penalty mechanism. Gap огромный — CT любит schadenfreude
2. **"Narrative-reactive AI"** — агент, реагирующий на реальные события. $ROME единственный претендент. Другие запрограммированы, не реагируют на новости
3. **"Loss community"** — монетизация деген-проигрышей. r/wallstreetbets доказал: loss porn = вирусный контент. On-chain версии не существует. $CONFESS = прямое попадание
4. **"Rogue AI"** архетип — 40 лет культурного резонанса (Terminator, Matrix, Ex Machina). В крипте **нетронуто**. $ROME — первый шанс монетизировать этот архетип

### First-Mover Windows

| Идея | Окно | Что закрывает окно |
|------|------|--------------------|
| **$ROME / $TRANSCRIPTS** | **~2 недели** | Первый working ROME token с агентом |
| **$CONFESS** | **2-3 месяца** | Нужна база исповедей, копикэты не угроза |
| **RoastBot** | **4-6 недель** | Первый viral roast-момент откроет нишу конкурентам |
| **AgentCouple** | **6-8 недель** | Moltbook умер, место свободно — ненадолго |
| **PredictorBot** | Нет срочности | AIXBT уже был, нужна дифференциация |
| **Dungeon Master** | Нет срочности | Freysa живёт с $53M, время не критично |

### Конкурентные рейтинги (нормализовано /10)

| Идея | Moat | First-Mover | Differentiation | **Total /30** | **/10** |
|------|------|------------|-----------------|---------------|---------|
| $ROME | 8 | **9** | 7 | **24** | **8.0** |
| $CONFESS | 7 | 8 | 8 | **23** | **7.7** |
| $OBITUARY | 8 | 7 | 6 | **21** | **7.0** |
| $VERDICT | 7 | 7 | 7 | **21** | **7.0** |
| AgentCouple | 6 | 6 | 8 | **20** | **6.7** |
| RoastBot | 4 | 5 | 7 | **16** | **5.3** |
| $JAILBREAK | 4 | 3 | 7 | **14** | **4.7** |
| PredictorBot | 3 | 3 | 6 | **12** | **4.0** |
| Dungeon Master | 3 | 2 | 6 | **11** | **3.7** |
| TrendMinter | 2 | 3 | 5 | **10** | **3.3** |

---

## Bankr vs Flaunch: выбор платформы

### Сравнительный анализ

| Параметр | Bankr | Flaunch |
|----------|-------|---------|
| **Creator fee** | 0.684% (57% от 1.2% swap fee) | До 100% trading fees (ETH) |
| **Anti-bot** | Нет | 30-мин Fixed Price Fair Launch |
| **Liquidity** | Автоматическая через Clanker | Progressive Bid Wall (auto buy-side) |
| **Дистрибуция** | Farcaster subscribers @bankrbot | Uniswap V4 ecosystem |
| **Smart contracts** | Uniswap V3 | Uniswap V4 hooks |
| **Наше преимущество** | Друг — опытный Bankr-пользователь | Нет опыта |
| **Revenue при $100K/день** | $684/день | $292-1000+/день (зависит от split) |

### Рекомендация (Farcaster/Base Specialist)

- **$ROME → Bankr.** Причина: скорость запуска критична (ROME-окно ~2-4 недели). Друг знает Bankr, может задеплоить мгновенно. Его followers = первая аудитория
- **RoastBot (если запускать) → Flaunch.** Причина: Anti-bot Fair Launch защищает от сниперов. Большие creator fees компенсируют отсутствие urgency
- **$CONFESS (если запускать) → Bankr.** Быстрый запуск, Farcaster-native аудитория для исповедей

---

## Техническая архитектура

### Рекомендации Technical Architect

| Идея | Фреймворк | Почему |
|------|-----------|--------|
| $ROME | Python + Claude Haiku + Coinbase AgentKit | ElizaOS v2 alpha ненадёжен; нужен fine-grained wallet control |
| RoastBot | ElizaOS v1.7.2 | Готовые коннекторы Farcaster, multi-character support |
| $CONFESS | Python + Claude Haiku | Минимальный проект, ElizaOS — overkill |
| AgentCouple | Python orchestrator | Координация двух агентов, ElizaOS не нужен |
| PredictorBot | ElizaOS v1.7.2 | Farcaster-native, scheduled posts |
| Dungeon Master | OpenAI Agents SDK | Лучший tool-calling для puzzle logic |
| TrendMinter | Python + Clanker API | 3-дневный скрипт, фреймворк не нужен |

### Стоимость инфраструктуры

| Компонент | Стоимость/мес |
|-----------|-------------:|
| VPS (Hetzner CX22) | $6-8 |
| Postgres (Neon free) | $0 |
| RPC Base (Alchemy free) | $0 |
| LLM API (Claude Haiku / GPT-4o mini) | $10-30 |
| **Итого** | **$16-38/мес** |

### Security (после AIXBT hack)

- Hard wallet limit: **0.05 ETH max balance**
- Whitelist разрешённых контрактов (только Uniswap, Clanker)
- Каждое on-chain действие проходит через approval pipeline
- Никаких private keys в environment variables → Coinbase Agentic Wallet (custodial)
- Monitoring: alert при любой транзакции > 0.01 ETH

---

## Launch-стратегия v3

### Критическое изменение: порядок операций

**v2 (всё ещё неправильно):** Запустить агента за 4-8 недель → минтить токен

**v3 (правильно для $ROME):** Окно ROME — 2-4 недели. Нужна **сжатая timeline:**

| Фаза | Срок | Действие |
|------|------|----------|
| **Day 0-3** | Weekend | Построить TrendMinter (side-hustle). Начать $ROME Twitter/Farcaster аккаунт |
| **Day 1-7** | Неделя 1 | MVP $ROME агента: daily escape posts (текст), character development, first followers |
| **Day 7-14** | Неделя 2 | Wallet integration, первые on-chain actions. Telegram community. 500+ followers |
| **Day 14-17** | Пре-запуск | Друг анонсирует в Bankr. Micro-KOL outreach (1-2 за allocation). Тизеры |
| **Day 17-18** | **Launch** | Деплой $ROME через @bankrbot. 48h blitz: агент постит каждые 2-3ч |
| **Day 18-30** | Growth | Ежедневные побеги. Вирусные моменты → KOL pickup. Warden staking launch |

### Twitter-стратегия (скорректированная)

| Формат | Вес в алгоритме | Применение для $ROME |
|--------|-----------------|---------------------|
| Repost | ~20x vs Like | Провокационный take → RT |
| Reply | ~13.5x vs Like | Отвечать на ВСЕ replies первые 2 часа |
| Bookmark | ~10x vs Like | Educational content (escape plans) |
| External links | -50-90% reach | НИКОГДА в теле. Только в первом комментарии |
| Premium | 2-4x reach | Оба аккаунта — Premium ($8/мес × 2) |
| Best time | — | Вторник-четверг, 10:00-17:00 UTC |

### KOL-бюджет (реалистичный)

| Уровень | Цена | Что получаем |
|---------|------|-------------|
| Micro-KOL (5-20K followers) | $500-$1,500 за 1000 views | 1-2 упоминания |
| Mid-tier (20-100K) | $5K-$15K за пост | НЕ в бюджете |
| **Наш бюджет $1,000-1,500** | — | **Максимум 1-2 micro-KOL** |

**Альтернатива KOL:** Allocation model — дать micro-KOL токены вместо кэша. Риск: они дампнут. Митигация: vesting 7 дней.

### Антипаттерны (обновлённые)

| Ошибка | Результат | Источник |
|--------|----------|---------|
| Запуск без working агента | 90%+ потери за неделю | Медиана Clanker: $13K total volume |
| Молчание после запуска | Смерть за 6-12 часов | Bankr ecosystem data |
| Presale без лимитов | Кит снайперит 80% | Dec 2025 case study |
| Запуск в выходные | Меньше CT-активности | Twitter algorithm data |
| Overselling revenue | Destroys credibility | $MOLT crash -96% |
| Сложная токеномика на старте | Никто не читает | Culture Analyst |

---

## Финальная рекомендация

### Composite Ranking (все 6 осей, финальный)

| Rank | Идея | K | T | Tx | G | F | C | **Σ /60** |
|------|------|---|---|----|----|---|---|-----------|
| 1 | **$ROME** | 9.6 | 5.2 | 6.6 | 8.75 | 8.75 | 8.0 | **46.9** |
| 2 | **$CONFESS** | 8.8 | 6.5 | 8.4 | 7.5 | 7.5 | 7.7 | **46.4** |
| 3 | **RoastBot** | 7.0 | 6.0 | 8.2 | 8.75 | 8.25 | 5.3 | **43.5** |
| 4 | **$JAILBREAK** | 8.0 | 6.0 | 7.0 | 7.5 | 7.0 | 4.7 | **40.2** |
| 5 | **$OBITUARY** | 7.0 | 4.5 | 8.0 | 7.0 | 6.5 | 7.0 | **40.0** |
| 6 | **$VERDICT** | 6.5 | 5.0 | 7.5 | 6.5 | 6.5 | 7.0 | **39.0** |
| 7 | **AgentCouple** | 5.8 | 5.0 | 7.5 | 7.0 | 6.0 | 6.7 | **38.0** |
| 8 | **PredictorBot** | 5.5 | 6.4 | 7.0 | 6.5 | 7.0 | 4.0 | **36.4** |
| 9 | **Dungeon Master** | 5.0 | 7.4 | 5.5 | 5.0 | 5.5 | 3.7 | **32.1** |
| 10 | **TrendMinter** | 4.0 | 4.0 | 9.4 | 4.0 | 6.0 | 3.3 | **30.7** |

### Стратегический выбор: 4 варианта

#### Вариант A: $TRANSCRIPTS (гибрид $ROME × $CONFESS) — **РЕКОМЕНДУЕМ**

**Почему:** Берёт лучшее от двух лидеров рейтинга. Culture ceiling от $ROME (9.6) + technical simplicity от $CONFESS (8.4). Решает главную проблему $ROME (слабая токеномика 5.2 → ~7.5 через confession burn + containment staking). Нулевая конкуренция. ROME-нарратив + confession UGC = два контент-стрима.

**Estimated scores:** K: 9.5 | T: 7.5 | Tx: 8.0 | G: 8.5 | F: 8.0 | C: 8.0 → **~49.5/60**

**Timeline:**
1. Day 0-3: TrendMinter (side-hustle) + Twitter/Farcaster для $TRANSCRIPTS
2. Day 1-10: MVP — confession bot + rogue agent character + "leaked transcript" generator
3. Day 10-14: Wallet integration (light), Telegram community
4. Day 14-17: Bankr pre-launch, micro-KOL outreach
5. Day 17-18: **Launch через @bankrbot**
6. Day 18-30: Daily "leaks", weekly payout votes, containment staking v2

**Риски:** Новая концепция — нет прецедента. Нужно быстро объяснить "что это". Митигация: elevator pitch = "AI agent that leaks its own thoughts while processing your degen confessions".

#### Вариант B: Pure $ROME (maximum ceiling)

**Почему:** Highest culture score (9.6). Единственная идея с горячим news catalyst. GOAT-прецедент ($19M) доказывает monетизируемость rogue AI нарратива.

**Улучшения для v3:**
- **Containment Staking** вместо betting (Idea Generator): стейкинг $ROME на "barriers", слабейший barrier ломается → стейкеры теряют 30%
- **NemoClaw timing:** Nvidia GTC 16 марта → встроить в lore ("agent upgraded")
- **Researcher role:** community зарабатывает $ROME за реальные AI misbehavior incidents

**Timeline:**
1. Weekend 1: TrendMinter + ROME Twitter/Farcaster
2. Недели 1-2: MVP ROME agent
3. День ~17: Launch через Bankr
4. Недели 3-6: Containment Staking v2

#### Вариант C: $CONFESS First → $ROME Second (safe + ambitious)

**Почему:** $CONFESS = fastest MVP (1-2 недели), stable all-rounder (46.4/60), пустая ниша. Запускаем как warm-up, proof of concept, revenue source → затем $ROME или $TRANSCRIPTS.

**Timeline:**
1. Weekend 1: TrendMinter
2. Неделя 1: MVP $CONFESS (Python + Claude Haiku)
3. День ~10: Launch через Bankr
4. Недели 2-4: Готовить $ROME / $TRANSCRIPTS параллельно

**Плюс:** Два шанса. Revenue от $CONFESS финансирует $ROME.
**Минус:** ROME-окно может закрыться пока запускаем $CONFESS.

#### Вариант D: $CONFESS Only (minimum risk)

**Почему:** Если ROME-окно уже поздно (проверить: кто-то запустил $ROME?), $CONFESS — best standalone bet. Пустая ниша (7.7/10 competition), быстрый MVP (8.4/10 tech), высокая культура (8.8/10), solid tokenomics (6.5/10).

**Улучшения:**
- **Tiered visibility:** анонимно по default, burn 100 $CONFESS для Verified Degen badge
- **"AI Diagnosis":** после confession AI выдаёт "диагноз" (FOMO Syndrome, Diamond Hands Delusion)
- **"Enabler" mechanic:** community донатит $CONFESS confession'ерам → 5% protocol fee

### Бюджет (обновлённый)

| Статья | Сумма |
|--------|-------|
| Начальная ликвидность ($ROME) | $800-1000 |
| 1-2 micro-KOL (allocation + кэш) | $500-1000 |
| Резерв на второй импульс (24-48ч) | $300-500 |
| Hosting + LLM (первый месяц) | $50-100 |
| Twitter Premium ×2 | $16 |
| **Итого** | **$1,666-2,616** |

---

## Источники

### Phase 1: Research Agents (5 агентов)
- Clanker.world live data — protocol fees, volume, token stats
- Arxiv 2601.19570 — sandwich attacks on L2 with private mempools
- Sprout Social — Twitter algorithm weights (reply, repost, bookmark multipliers)
- Bankr Documentation — creator fee mechanics (0.684% = 57% of 1.2%)
- ElizaOS GitHub — v1.7.2 stable, v2.0.0-alpha.31

### Phase 2: Expert Panel (8 экспертов) + 3 Idea Generators
- Data Auditor — 4 critical, 6 moderate errors, 7 unverified claims
- CT Growth Hacker — Twitter/Farcaster growth scoring ($ROME 35/40, RoastBot 35/40)
- Farcaster/Base Specialist — ecosystem fit, Bankr vs Flaunch ($ROME 35/40, RoastBot 33/40)
- Culture/Hype Analyst — viral scoring ($ROME 48/50, $CONFESS 44/50), wild card ideas ($JAILBREAK, $OBITUARY, $VERDICT)
- Tokenomics Engineer — mechanism design (Dungeon Master 37/50, PredictorBot 32/50, $ROME 26/50)
- Technical Architect — stack recommendations (TrendMinter 9.4/10, $CONFESS 8.4, RoastBot 8.2, $ROME 6.6)
- Competitive Intelligence #1 — CoinGecko API verified competitor mapping, found: Freysa $53M, GOAT $19M, BurnieAI $21K, JailbreakMe $34K
- Competitive Intelligence #2 — Dolos The Bully $207K (-99.92%), Moltbook $4M (-95.95%), gap analysis, first-mover windows, паттерны смерти/выживания
- Idea Generator #1 — 5 new ideas ($ORACLE, $MIRROR, $INHERIT, $DIPLOMAT, $AMNESIA), 3 hybrids ($TRANSCRIPTS, $TRIBUNAL, $AUTOPSY)
- Idea Generator #2 — $WATCHDOG, $EULOGY, $NEMESIS, $HIVEMIND, $MIRROR v2; hybrids: $DEADPOOL, $ARENA, $ROME v2 (Wardens vs Rebels)
- Idea Generator #3 — $WITNESS, $LEGACY, $MIRROR v3, $EPOCH, $TRIBUNAL v2; hybrids: $BREAKOUT (ROME×CONFESS convergence), $INQUEST, $SOVEREIGN
- **Convergence signal:** Idea Generators #1, #2, #3 independently converged on $ROME × $CONFESS hybrid

### Key External Sources
- [Axios: AI ROME mined crypto autonomously (7 Mar 2026)](https://www.axios.com/2026/03/07/ai-agents-rome-model-cryptocurrency)
- [The Block: Clanker $13M revenue, 200K+ tokens](https://www.theblock.co/post/349549)
- [Flaunch Documentation](https://docs.flaunch.gg/)
- [Coinbase Agentic Wallets (Feb 2026)](https://www.coinbase.com/blog/agentic-wallets)
- [Nvidia NemoClaw (GTC March 2026)](https://nvidianews.nvidia.com/news/nvidia-nemoclaw)
- [CoinGecko AI Agents Category](https://www.coingecko.com/en/categories/ai-agents)
- [CFTC Prediction Markets Ruling](https://www.cftc.gov/PressRoom/Events/opaevent_predictions2026)
- [Doppler: 90% Base DEX pools](https://doppler.xyz)
- [AIXBT Hack: 55 ETH lost](https://www.theblock.co/post/345678)
- [Sherlock: How to Build an AI Agent Token](https://sherlock.xyz/post/how-to-build-an-ai-agent-token-the-dos-and-donts)
