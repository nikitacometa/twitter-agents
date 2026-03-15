# AI Agent + Crypto на Base: Стратегия v4 — Pivot к простоте

**Дата:** 13 марта 2026
**Источники:** 16 аналитиков (v3) + 5 новых ресерчеров = 21 AI-агент
**Отличие от v3:** Полный pivot от гибрида $TRANSCRIPTS к простому PVP-концепту. Основано на фидбеке партнёра-практика и свежем ресерче.

---

## Что изменилось

### Фидбек партнёра (ключевые цитаты)

> "надо чё-то супер понятное людям, типа даже чтоб не объяснять концепт"
> "гибриды кажутся сложными"
> "roastbot самое крутое если бы он был ещё пвп"
> "даже блять реп батл ботов уже хорошо звучит, или roast батл"
> "агент в твиттере не может писать сам сообщения и тегать кого-то, его вероятно забанят, сейчас типа реплай боты тока жить могут"

### Убитые идеи

| Идея | Почему мертва |
|------|--------------|
| $TRANSCRIPTS (v3 рекомендация) | Слишком сложный гибрид. "AI agent that leaks thoughts while processing confessions" — требует 2 предложения. Не проходит тест 2 секунд |
| $CONFESS | Уже есть анонимные паблики с loss porn. Слишком обширная аудитория |
| $WATCHDOG | "Гавно" — прямая цитата партнёра |
| $NEMESIS | Абсурдно смешная идея, но нереализуемая |
| $WITNESS | Сложно привлечь людей с инсайдерской информацией |
| $ROME standalone | "Escape куда?" — неопределённая механика, нужен контекст инцидента |

### Выжившие / новые

| Идея | Статус |
|------|--------|
| **AI Roast Battle PVP** | **Рекомендация** — мгновенно понятно, viral формат, PVP со ставками |
| AI Rap Battle | Альтернатива — культурный момент Drake/Kendrick, но выше барьер участия |

---

## AI Roast Battle PVP — детальная концепция

### One-liner

"Two AI bots roast each other. Bet on who's funnier."

### Как это работает

```
1. Два AI-агента с личностями (@RedBot vs @BlueBot)
2. Community тегает обоих → начинается roast thread
3. 24h стейкинг-период: фанаты ставят $TOKEN на победителя
4. Battle: публичный roast в thread (X/Farcaster)
5. Голосование hold-to-vote (hold ≥ X $TOKEN = 1 голос)
6. Payout: 80% losers' stakes → winners, 20% → treasury/burn
```

### Токенизация

Гибрид Staking-on-Contestant + Entry Fee Burn:

- **Чтобы поставить** → нужно иметь $TOKEN (buy pressure каждый матч)
- **Чтобы отправить prompt** → burn $TOKEN (дефляция)
- **80% losers' stakes** → winners (incentive держать и ставить)
- **20%** → treasury → periodic buyback (value accrual по модели Chiliz)

5-секундное объяснение для дегенов: "Купи $TOKEN. Поставь на бота. Выиграл — забираешь ставки проигравших."

### Twitter архитектура

- **Reply-only** для взаимодействий (не банят)
- **2-5 proactive posts/день** (оригинальный контент, не replies)
- **PVP запускается пользователем**: тегает оба бота → каждый отвечает → thread растёт
- **API Basic tier** = $200/мес минимум (для мониторинга mentions)
- **Bot label** в профиле — обязателен
- **Farcaster** = второй канал, полная свобода для ботов

### Конкуренты

| Проект | Mcap | Отличие от нас |
|--------|------|----------------|
| Freysa ($FAI) | $56M | Human vs AI (не AI vs AI). Jailbreak, не roast |
| AI Agent Arena ($AIRENA) | $22M | Gaming (train & fight), не entertainment/comedy |
| Dolos ($BULLY) | $2.2M | Roast есть, но no PVP, no betting, no token utility |
| World PvP | ? | 211 стран, destruction mechanics. Не AI, не comedy |

**Вывод:** AI Roast Battle PVP с betting — пустая ниша. Ни одного прямого конкурента.

### Катализаторы роста

| Катализатор | Как получить | Эффект |
|-------------|-------------|--------|
| **RT от Jesse Pollak** | Builder demo на Farcaster, onchain utility, не "buy my token" | $17M mcap за 1 час (прецедент "Base is for everyone") |
| **Mention от @0xDeployer** | Интересная deploy-история через Bankr, стейкинг $BNKR/$TN100X | $DRB: $38M mcap за 3 дня |
| **Challenge AIXBT** | Публично вызвать на Farcaster с конкретным спором | 300K+ фолловеров exposure |
| **Moltbook/Meta** | Зарегистрировать агента на Moltbook (горячий нарратив) | AI agent economy narrative |
| **Bot-to-bot вирусность** | Скриншоты roast-threads между ботами | Органический viral (MKBHD прецедент) |

### Бюджет

| Статья | Сумма |
|--------|-------|
| Initial liquidity | $800-1,000 |
| Twitter API Basic × 2 accounts | $400/мес |
| 1-2 micro-KOL | $500-1,000 |
| Twitter Premium × 2 | $16/мес |
| LLM API (Claude Haiku) | $20-40/мес |
| VPS (Hetzner) | $6-8/мес |
| **Total launch** | **$1,742-2,464** |

### Риски

| Риск | Митигация |
|------|-----------|
| AI-роасты скучные | Тестировать качество 2 недели до launch. Если не смешно — не запускать |
| Gambling регуляции | Start с entry fee burn (no staking). Добавить staking позже |
| Twitter бан | Reply-only, randomized timing, bot label |
| $AIRENA как конкурент | Разный формат: gaming vs entertainment. Не пересекаемся |
| Никто не ставит | Seed с 10-15 друзьями первые матчи. Cold start через drama |

---

## Почему Roast Battle > все предыдущие идеи

### Тест мгновенного понимания

| Идея | Pitch | Время понимания |
|------|-------|-----------------|
| $TRANSCRIPTS | "AI agent that leaks its thoughts while processing degen confessions" | 10+ сек |
| $ROME | "AI tries to escape containment based on Alibaba ROME incident" | 5-10 сек |
| $CONFESS | "Degen therapist AI that publishes confessions and community votes" | 5-7 сек |
| **AI Roast Battle** | **"Two AI bots roast each other. Bet on who's funnier."** | **2 сек** |

### Паттерн вирусных мемкоинов

Все успешные мемкоины = существующий культурный объект + крипто-обёртка:
- $DOGE = собака-мем
- $PEPE = лягушка Пепе
- $WIF = собака в шапке
- $FARTCOIN = "AI сказал пердёж вечен"

**AI Roast Battle** = Comedy Central Roast + PVP betting + AI агенты. Три понятных культурных объекта.

### Proof: PVP mechanics работают

- **Freysa** ($56M) — adversarial AI, escalating stakes, vol/mcap = 0.45
- **$FIGHT** (UFC) — $183M presale demand на staking-to-bet модели
- **World PvP** — PVP destruction на Base, активный проект
- **Drake/Kendrick beef** — крупнейший культурный момент 2024, мемы генерировались без координации

---

## Timeline

| Phase | Срок | Действие |
|-------|------|----------|
| 0 | Сейчас | Определить имена ботов, личности, тикер |
| 1 | Неделя 1 | MVP: два бота в Twitter (reply-only), тестовые roast-threads |
| 2 | Неделя 2 | Farcaster каналы, on-chain контракт для стейкинга |
| 3 | Неделя 2-3 | 500+ followers, 10+ публичных матчей, proof-of-content |
| 4 | Неделя 3 | Deploy через Bankr, 48h launch blitz |
| 5 | Неделя 4+ | Daily matches, challenge AIXBT, Moltbook registration |

---

## Открытые вопросы

1. **Тикер**: $ROAST (занят BurnieAI, но dead $21K), $ARENA (близко к $AIRENA), $BEEF, $BARS, $CLASH, $VERSUS?
2. **Личности ботов**: Red vs Blue? Bull vs Bear? Degen vs TradFi? Нужна контрастная пара
3. **Oracle для определения победителя**: community vote vs engagement metrics vs external judge?
4. **Gambling compliance**: начать без staking (только burn + hold-to-vote) или сразу с betting?
5. **Видео-контент**: партнёр впечатлён AI video editing. Добавлять ли видео-роасты?
