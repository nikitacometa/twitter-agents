# $BEEF — Launch Pipeline v2

**Дата:** 16 марта 2026 (v2 — accelerated token launch)
**Цель:** бот + токен live к дню 4-5. Не ждать viral proof — создавать его с токеном.

---

## Текущий статус

**Готово:**
- Типы, SQLite + миграции, 7 репозиториев, LLM Provider layer
- 31 тест, zero typecheck/lint errors
- Документация: architecture, strategy, market research, twitter playbook, farcaster integration

**Не готово:**
- Character config, prompt templates, roast engine, content filter, Twitter client, bootstrap
- Farcaster client (код спроектирован, не написан)
- Нет ни одного реального роаста

---

## Почему ускоряем токен-launch

### Прецеденты: все топы запускали токен на день 0-1

| Проект | Бот → Токен | Продукт на момент запуска | Пик mcap |
|--------|-------------|---------------------------|----------|
| Luna (Virtuals) | 1 день | 1 пост ("hello kittens") | $300M |
| AIXBT | 0-1 день | Бот стартовал с 0 подписчиков | $800M |
| ai16z | 0 дней | Демо свопа в тестовом кошельке | $2B |
| Dolos ($BULLY) | токен ДО бота | Бот построен постфактум | $130M |
| Freysa | 0 дней | Игра-контракт, без контента | $150M |
| Zerebro | недели | Бот активно постил | $800M |
| GOAT (Truth Terminal) | 116 дней | 4 месяца органического контента | $1B |

**Паттерн:** единственный проект, который ждал — GOAT. Но его токен создал случайный человек, не команда. Все проекты, которые контролировали свой launch, делали это на день 0-1.

### Почему ждать 3 недели = проигрыш

1. **Hype decay:** GTC NemoClaw tailwind = 2-4 недели. К дню 21 окно закрыто
2. **Внимание конечно:** каждый день без токена — упущенные buyer'ы, которые купят что-то другое
3. **Viral metric как gate — ошибка:** $BULLY набрал $130M без единого вирусного роаста. Токен СОЗДАЁТ виральность
4. **Конкуренты:** BurnieAI ($ROAST) ждал месяцы, результат — $122K mcap. Рынок не ждёт
5. **Токен = маркетинговый бюджет:** creator fee 0.684% от каждого swap = passive income на контент

### Что НЕ нужно для запуска токена

- 200+ подписчиков (AIXBT стартовал с 0)
- Viral proof (>300 RT) — это post-launch KPI
- Burn-to-roast on-chain (нарратив "coming soon" достаточен)
- Landing page (launch tweet = landing page)
- Полный scheduler (setInterval)

### Что НУЖНО для запуска токена

- Работающий бот, который постит роасты (minimum 5-10 постов до launch)
- Twitter handle + bio + avatar
- Farcaster аккаунт с кросс-постами
- $BEEF logo
- $800-2,500 ликвидности для Bankr pool
- 3-5 друзей готовых RT launch tweet

---

## Pipeline: 4 фазы (compressed)

```
Фаза 0          Фаза 1              Фаза 2              Фаза 3
Content          Build + First       TOKEN LAUNCH +       Scale
Validation       Tweets              Growth Sprint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
День 0-1         Дни 1-3             День 4-5 LAUNCH      Дни 14+
                                     Дни 5-14 GROWTH

Blind test       MVP code            Bankr deploy         Scheduler
20 роастов       Character           Simultaneous:        Mentions
Feedback         Prompts              Twitter+Farcaster   News monitor
GO/NO-GO         Engine+Filter       KOL seed             Learning
                 Twitter+FC client   Reply-guy sprint     Telegram admin
                 Bootstrap           Viral hunt
                 Deploy VPS          Burn-to-roast
                 First 5-10 posts    narrative
```

---

## Фаза 0: Content Validation (день 0-1)

**Цель:** убедиться что AI-роасты смешные. GO/NO-GO gate.

### Чеклист

- [ ] Написать personality document (name, voice, topics, anti-patterns)
- [ ] Сгенерировать 20 роастов через Claude CLI (без кода бота)
- [ ] Отправить в 2-3 крипто-чата как blind test
- [ ] Собрать feedback: минимум 5 из 20 должны получить "🔥 смешно"
- [ ] Если не проходит — итерировать персонажа, не код

### Критерий GO/NO-GO

| Результат | Действие |
|-----------|----------|
| 5+ из 20 = 🔥 | GO — переход к Фазе 1 |
| 3-4 из 20 = 🔥 | Итерация персонажа, ещё 10 роастов |
| <3 из 20 = 🔥 | PIVOT — менять концепт или аудиторию |

### Blind test уже запущен

5 роастов отправлены в Telegram (16 марта):
1. AIXBT — dashboard hack, 55 ETH, -97% ATH
2. Virtuals Protocol — revenue -94%, 17K agents can't generate revenue
3. Moltbook — 42-day exit, "expensive chatroom" for Meta
4. ClawdBot — 10 seconds scam during rebrand
5. ElizaOS — -99.6% from ATH, eternal alpha

---

## Фаза 1: Build + First Tweets (дни 1-3)

**Цель:** работающий бот, 5-10 живых постов в Twitter + Farcaster до токен-launch.

### Порядок задач

```
День 1 (параллельно):
├── [A] TA-015 → TA-016: Personality + character JSON + Zod loader
│                         (beef-bot.json, character.loader.ts)
├── [B] TA-023: Content filter (regex, length ≤280, banned words)
└── [C] Параллельно: создать Twitter аккаунт, bio, avatar
                      + Farcaster аккаунт + Neynar signer
                      + $BEEF logo (Midjourney/DALL-E)

День 2 (параллельно):
├── [A] TA-048: Prompt template — craft-roast.ts (один шаблон)
│         + fix extractJsonFromOutput (убрать regex fallback)
│         + добавить тесты для extractJsonFromOutput
├── [B] TA-019: Twitter client (agent-twitter-client, cookie auth, postTweet + getMentions)
│         + TA-057: Farcaster client (neynar SDK, postCast)
│         + TA-058: Post dispatcher
└── [C] Подготовить launch tweet thread + Farcaster cast
          Seed 3-5 друзей для RT

День 3:
├── [A] TA-020: Roast engine + TA-036: Bootstrap
├── [B] DRY_RUN=true — 10-15 тестовых роастов локально
├── [C] Deploy на VPS (PM2, .env)
├── [D] DRY_RUN=false — первые 5-10 реальных роастов
│         Twitter + Farcaster /crypto одновременно
└── [E] Prompt tuning на основе engagement
```

### Что НЕ входит

- Scheduler с 11 job types (замена: `setInterval`)
- Mention polling (замена: ручной мониторинг)
- News monitor (замена: хардкод 10 целей + agent research)
- Queue manager class (замена: прямой вызов roast engine)
- Graceful shutdown module (замена: 5 строк `process.on('SIGTERM')`)
- >80% test coverage (замена: тесты для critical path)
- Burn-to-roast on-chain (замена: нарратив "coming soon")

### Упрощения MVP

| Компонент | Полная версия | MVP версия |
|-----------|--------------|------------|
| Twitter client | Official API ($200/мес) | `agent-twitter-client` (cookie auth, $0) |
| Scheduler | 11 job types, jitter module | `setInterval(roastJob, randomBetween(2h, 4h))` |
| Target discovery | News monitor + RSS + DexScreener | Массив 10 вечных целей + agent research |
| Provider | ProviderManager (primary/degraded/paused) | Прямой ClaudeCodeProvider |
| Shutdown | Graceful shutdown module | `process.on('SIGTERM', () => { db.close(); })` |
| Moderation | Telegram /approve flow | DRY_RUN + ручной запуск |
| Burn-to-roast | On-chain burn → queue | "Coming soon" в bio + manual demo |

---

## Фаза 2: Token Launch + Growth Sprint (дни 4-14)

### День 4-5: TOKEN LAUNCH

**Gate:** бот уже постит 5-10 роастов, бот visible в Twitter + Farcaster.

```
День 4: Pre-launch
  ├── Тизер-роаст: "something's cooking 🥩"
  ├── Pin tweet: bio бота + "token incoming"
  ├── Убедиться что 5-10 качественных роастов уже live
  ├── Seed друзей: "завтра launch, будь готов RT"
  └── Подготовить ликвидность ($800-2,500 ETH на Base)

День 5: LAUNCH DAY
  ├── Deploy $BEEF через @bankrbot на Twitter
  │     @bankrbot launch token $BEEF "AI that roasts your bags"
  ├── Announce thread: "what is $BEEF + how burn-to-roast works"
  ├── Farcaster: announce в /crypto /base
  ├── Специальный launch roast — роаст САМОГО популярного проекта (AIXBT?)
  │     "congratulations $BEEF holders, your AI just roasted its first billion-dollar target"
  ├── KOL micro-push ($500-1000, 1-2 micro-KOL) — ОДНОВРЕМЕННО с launch
  └── Первый burn-to-roast демо (собственные средства)
```

### Дни 5-14: Growth Sprint

**Цель:** максимальный engagement, viral moments, community building.

```
Ежедневный ритм:

Утро (13:00 UTC):
  - 2-3 автономных роаста (original tweets)
  - Кросс-пост в Farcaster /crypto
  - 1 роаст топ-проекта (AIXBT, Virtuals, ElizaOS) — high-impact targets

День (14:00-18:00 UTC):
  - Reply-guy sprint: 5-10 replies на крупные аккаунты
  - Reply на ВСЕ комментарии к нашим постам (150x weight window)
  - Мониторинг: какой стиль/цель даёт лучший engagement
  - Farcaster: reply на топ cast'ы в /crypto, /base, /ai

Вечер:
  - Анализ engagement, prompt tuning
  - Подготовка целей на завтра
  - Community: "кого роастить следующего?" poll
```

### Viral Catalysts (активно использовать)

| Катализатор | Как | Когда |
|-------------|-----|-------|
| Challenge AIXBT | Публичный роаст + "your move @aixbt_agent" | День 5-6 |
| Roast топ проекта | Роаст проекта с 100K+ followers → их комьюнити придёт | Каждый 2-3 день |
| Burn-to-roast demo | "First person to burn $BEEF picks the target" | День 7+ |
| Self-roast | Бот роастит сам себя + $BEEF токен | День 8-10 |
| Farcaster → Twitter bridge | Viral cast → screenshot → tweet | Постоянно |

### A/B тестирование стилей

| Стиль | Пример | Тестировать |
|-------|--------|-------------|
| Data roast | Конкретные числа + twist | Дни 5-7 |
| Pure comedy | Метафоры, сравнения | Дни 7-9 |
| Controversial take | Hot opinion с фактами | Дни 9-11 |
| Self-aware meta | Роаст + мета-комментарий об AI | Дни 11-14 |

### Метрики для отслеживания

| Метрика | Цель к дню 14 | Action trigger |
|---------|--------------|----------------|
| Best tweet RT count | >300 RT | Если <50 к дню 10 — escalate targets |
| Twitter followers | 500-1000 | Token holders + organic |
| Farcaster followers | 50-100 | Channel activity |
| $BEEF mcap | >$100K | If <$50K — increase content volume |
| Daily roasts posted | 3-5 | Minimum 2 |
| Burn-to-roast requests | >5 | Community engagement signal |

### Bankr Launch конкретика

```
Формат команды:
@bankrbot launch token $BEEF "AI that roasts your bags. Burn $BEEF to aim it." image:beef_logo.png

Результат:
- ERC-20 токен на Base
- Uniswap V3 pool автоматически
- Creator fee: 0.684% от каждого swap
```

### Начальная ликвидность

| Сценарий | Liquidity | Ожидаемый mcap day 1 |
|----------|-----------|---------------------|
| Минимум | $800 | $50-100K |
| Оптимум | $1,500 | $100-300K |
| Stretch | $2,500 | $200-500K |

---

## Фаза 3: Scale (дни 14+)

Только после стабильной работы бота 1+ неделю.

### Приоритетный порядок

1. **Burn-to-roast on-chain** — настоящий burn mechanism, не демо
2. **Полноценный scheduler** — заменить `setInterval` на jitter module с quiet hours
3. **Mention polling** — автоответы на @mentions в Twitter
4. **Farcaster webhook** — автоответы на @mentions в Farcaster
5. **News monitor** — RSS + DexScreener для автономного target discovery
6. **Telegram admin** — /status, /pause, /roast, /approve
7. **ProviderManager** — включить fallback на SDK, recovery timer
8. **Learning module** — engagement tracker, character tuning
9. **Burn counter widget** — on-chain data → auto tweet

---

## Аккаунты и credentials

### Нужно до Фазы 1 (день 1)

| Что | Где получить | Стоимость |
|-----|-------------|-----------|
| Twitter bot account | Новый аккаунт + 2FA + cookies | $0 |
| X Premium | twitter.com/premium | $8/мес (4x reach boost, обязательно) |
| Residential proxy (опционально) | proxy provider | $5-15/мес (если запуск с VPS, не локально) |
| Neynar API key | dev.neynar.com | $0 (free tier) |
| Farcaster account | warpcast.com | $5 |
| Neynar signer | On-chain approval | ~$2 OP ETH |
| $BEEF logo/avatar | Midjourney/DALL-E | $0 |

**Twitter API НЕ покупаем.** Используем `agent-twitter-client` (cookie auth, тот же подход что ElizaOS/Zerebro). Экономия $200/мес = $2,400/год. Переход на API опционален позже если оправдано.

### Нужно до Фазы 2 (день 4-5)

| Что | Где получить | Стоимость |
|-----|-------------|-----------|
| Initial liquidity | ETH on Base | $800-2,500 |
| KOL seed budget | ETH/USDC | $500-1,000 |
| Launch tweet thread | Подготовить заранее | $0 |
| 3-5 друзей для RT | Координация | $0 |

---

## Риски и митигации

| Риск | Severity | Митигация |
|------|----------|-----------|
| Роасты не смешные | CRITICAL | Blind-test ДО кода. PIVOT персонажа если не работает |
| Токен launch flop (<$50K mcap) | HIGH | Продолжать контент, mcap не определяет ценность бота |
| Twitter бан | HIGH | Farcaster одновременно = instant fallback. Новый аккаунт + прогрев |
| Claude CLI subprocess fails | HIGH | DRY_RUN mode, manual fallback |
| agent-twitter-client breakage | MEDIUM | Следить за issues, обновлять. Fallback: купить API Basic ($200/мес) |
| Twitter детекция автоматизации | MEDIUM | Cookie reuse (не repeated login), jitter, residential IP, X Premium |
| Rug-обвинения | MEDIUM | Публичная команда, прозрачная механика |
| Content fatigue к месяцу 2 | MEDIUM | Community vote, character tuning, new formats |
| Бюджет без резерва | MEDIUM | Минимум $800 liquidity, rest is profit from fees |

---

## Ключевые принципы (обновлённые)

1. **Token = day 5, не day 21.** Все успешные проекты запускали токен рядом с ботом. Ждать = терять hype
2. **Content before code.** Код обслуживает контент, не наоборот
3. **Ship before polish.** `setInterval` → scheduler, не scheduler → ship
4. **Twitter + Farcaster одновременно.** Insurance + double exposure = $7
5. **Токен создаёт виральность.** Не ждать viral proof — токен IS the viral catalyst
6. **Moderation first.** Первые 3 дня — ручное одобрение каждого роаста
7. **Burn-to-roast = narrative first.** On-chain mechanism фаза 3, "coming soon" — фаза 2
8. **Cookie auth before API.** agent-twitter-client ($0) до product validation. API ($200/мес) — если бан или revenue оправдывает
