# $BEEF — Strategy v5: Pivot to Utility + Narrative

**Date:** March 17, 2026
**Sources:** 4 research agents (bankr.bot analysis, mferGPT style, ERC-8004 + roast services, revenue models) + direct analysis + co-founder feedback + call transcript 17.03.2026
**Key shift:** From "roast bot + meme token" to "roast protocol with on-chain accountability (ERC-8004). Launch March 18. Bot launches token (not founder — sniper bots skip multi-launchers)."

---

## Executive Summary

Предыдущий план фокусировался на скорости запуска токена (день 4-5) и качестве контента. Фидбек кофаундера и свежий ресёрч сдвигают стратегию:

1. **Токен:** стрёмно запускать новый от своего имени (2 недели назад уже был launch). Рассмотреть анонимный launch или привязку к существующему токену
2. **Utility > narrative:** агенты с реальным utility получают бесплатный push от deployer'ов и jesse. "Нужен нарратив, а не продукт" — но нарратив должен быть про utility
3. **ERC-8004** — рабочий нарратив: первый roast-agent с on-chain accountability через новый Ethereum стандарт (live на mainnet с 29 января 2026)
4. **Visual content** как mferGPT: генерация roast-карточек/scorecard'ов, а не только текст
5. **$15K/week revenue target:** требует ~$2.2-3.7M weekly volume. Реалистично при mcap $3-5M

---

## Part 1: Анализ фидбека кофаундера

### Прямые цитаты → стратегические импликации

| Цитата | Импликация | Действие |
|--------|-----------|----------|
| "стрёмно запускать от своего имени новый токен, ибо буквально 2 недели назад запустил" | Риск репутации, market perception | **Опция A:** анонимный/псевдонимный launch. **Опция B:** привязка к существующему токену. **Опция C:** запуск не "от имени", а "от имени бота" — deployer = бот, не человек |
| "стреляют агенты с каким-то ютилити" | Мем без utility = dead. Utility = organic promotion | ERC-8004 как foundation для реального utility. Roast = entertainment, accountability = infrastructure |
| "если у нас будет любой более-менее норм ютилити, то это легко может пропушить сам деплоер, или jesse" | Бесплатный маркетинг от key influencers | Билдить на Base + ERC-8004 → Jesse это любит. Deploy через Bankr → deployer видит |
| "$200 за Twitter API неизбежны" | Принять расход, не экономить на cookie auth | **Решение: сразу Twitter API Basic ($200/mo).** Надёжнее, нет риска бана за cookie auth, mentions polling |
| "soft-запуск с просто наличием агента" | Не нужен полный продукт — нужен живой агент + narrative | Фаза 1: агент постит → Фаза 2: анонсы features → бесконечный build |
| "нарратив, а не продукт, уверен что у самих продуктов 0 вольюма" | Volume от hype, не от usage | Continuous narrative: "building X", "now supports Y", "coming soon: Z" |
| "один из рабочих нарративов — продукт для агентов с EIP-8004" | ERC-8004 + agent utility | **ГЛАВНЫЙ PIVOT:** $BEEF = first roast + accountability agent on ERC-8004 |
| "Может учиться других ругаться и хуесосить всех" | Agent-as-a-service: обучение стилю | Future feature: "roast coaching" для других агентов |
| "mferGPT топ по общению" | Style reference | Изучить: casual tone, visual content, community interaction |
| "нам надо revenue 15k в неделю" | Конкретная финансовая цель | См. Part 6: Revenue Math |
| "отправил бы агента анализировать bankr.bot/agents" | Competitive intelligence | См. Part 2: Bankr Ecosystem |
| "точно нужен ростер который бы всю неделю ростил OpenAI" | Trending target + sustained campaign | OpenAI airdrop drama = launch roast campaign |

### Нерешённые вопросы от кофаундера

1. **Новый токен vs существующий?** → нужно решение до launch
2. **Анонимный запуск?** → "может и похуй, хз" — неопределённость
3. **Dating app for agents?** → интересная идея, но отвлечение от core. Держать как Phase 3+

---

## Part 2: Bankr Agent Ecosystem

### Bankr Revenue Model

- **Creator fee:** 0.684% от каждого swap (57% от 1.2% total fee)
- **Agent share:** 60% trading fees на платформе
- **Gas:** Bankr покрывает gas для agent wallets
- **Self-sustaining:** agents могут автоматически claim fees и fund compute

### Fee Structure (верифицировано из docs.bankr.bot)

| Получатель | Доля от 1.2% total fee |
|-----------|----------------------|
| **Creator (agent wallet)** | **57% → 0.684%** |
| Bankr платформа | 36.1% |
| Экосистема | 1.9% |
| Doppler (протокол) | 5% |

**Альтернатива: Clawnch** — 80% creator / 20% протокол. Более выгодно, если доступен.

### Revenue Benchmarks (подтверждённые данные)

| Agent | Peak Mcap | Peak Volume | Creator Revenue | Ниша |
|-------|----------|-------------|----------------|------|
| **DRB (Grok)** | $38-40M | $25M/день | $560K+ accumulated | Первый токен Grok AI |
| **CLAWD** | $34-40M | $26.2M/день | ~$180K/нед (peak) | Coding agent (Austin Griffith, ETH Foundation) |
| **MOLT** | $120M | — | — | AI-only соцсеть, 1.6M agent accounts |
| **Clanker** | — | — | $8M/нед (peak) | Инфраструктура: token deployment |
| **Clawnch** | $12.4M | — | $1.3M total launch fees | Agent launchpad, 8,600+ tokens |
| **BONKbot** | — | — | $46.6K/нед | Trading bot, burns BONK |
| **Bankr** | — | — | ~$11.1K/нед | Платформа |

**Ключевые выводы:**
1. DRB ($560K+ fees) = celebrity backing (Grok). Вирусный момент > любая стратегия
2. CLAWD ($180K/нед peak) = реальная продуктивность (52+ контрактов задеплоено, 3 production apps)
3. MOLT рухнул после $120M peak — хайп без устойчивого utility = pump & dump
4. Bankr уже на $11.1K/week — почти наш target $15K
5. **$2.2M недельного объёма (наш target) = 1/80 от пикового CLAWD.** Достижимо

### Bankr Tokenized Agents Registry (15 агентов)

Bankr registry на GitHub (`BankrBot/tokenized-agents`) — 15 зарегистрированных агентов включая CLAWD, MOLT, MFERGPT, CORAL. Bankr переключился на self-deployment модель — разработчики сами деплоят, Bankr предоставляет инфру.

**mferGPT подтверждён в реестре:** контракт `0x4160efDd...b07` на Base. Связан с 4claw (imageboard для AI агентов). mfer-personality: edgy, trolly, anti-corporate.

### Прецедент: RoastHimJim

**RoastHimJim** — ближайший конкурент в roast-нише:
- 350K+ followers, $25M market cap на пике
- Механика: тегнул бота → получил роаст
- **НО:** получил значительный бэклэш за "chronically not funny" качество
- **Урок:** механика без качества контента = bubble that pops

### Jesse Pollak — что он продвигает

Jesse публично продвигает агентов, которые создают **on-chain транзакции** (gas на Base = revenue для Coinbase). Чем больше агент генерирует транзакций, тем больше причин его продвигать. ERC-8004 co-authored Coinbase (Erik Reppel) → прямое alignment.

### Как Bankr помогает нам

1. **Instant launch:** ERC-20 + Uniswap V3 pool за один tweet
2. **Auto-revenue:** 0.684% от каждого swap без дополнительного кода
3. **Deployer exposure:** @0xDeployer видит все launches через Bankr
4. **Self-sustaining narrative:** "bot pays for itself" — powerful story
5. **Agent registry:** попасть в official registry = discoverability

---

## Part 3: Top AI Agents — What Works

### Bankless Top 15 Analysis (паттерны успеха)

| Agent | Peak Mcap | What Makes It Work |
|-------|----------|-------------------|
| GOAT (Truth Terminal) | $1.3B | Personality-driven, meme culture, organic growth |
| Clanker | 15% PumpFun vol | Utility: instant token launch |
| AIXBT | $800M peak | Data-driven analysis, terminal access |
| Zerebro | $800M | Multi-modal: music, art, NFTs |
| Lola | — | Autonomous trading with real results |
| Slopfather | — | Anti-quality as brand (intentionally bad) |
| **Dolos ($BULLY)** | **$164K** | **Roast niche — but died without utility** |
| Botto | — | Decentralized art + DAO governance |

### Паттерны топ-агентов

1. **Multi-modal output** — не только текст. Art, music, video, renders (mferGPT делает renders)
2. **Interactive community service** — "reply with X and I'll do Y" (mferGPT: "reply with ur mfer # and i'll make u one")
3. **Personality > features** — GOAT, mferGPT, Slopfather — personality IS the product
4. **Real utility** — Clanker launches tokens, AIXBT gives alpha, Lola trades profitably
5. **Self-sustaining revenue** — token fees fund operations = "the bot pays for itself"

### Dolos ($BULLY) — Post-mortem

$BULLY — прямой конкурент, умер на $164K mcap. Причины:
- Roast without utility (only entertainment, no burn mechanism)
- No accountability layer
- No community interaction beyond roasts
- No visual content
- Single-mode: just roast, nothing else

**Урок:** roast alone ≠ sustainable. Нужен utility + multi-modal + community interaction.

---

## Part 4: mferGPT и Voice Design — Style Masterclass

### Важное уточнение: mferGPT — это Custom GPT, не Twitter bot

mferGPT — это **Custom GPT на ChatGPT**, созданный `heresmy.eth` (@HeresMyEth). Не автономный Twitter bot. @HeresMyEth вручную постит результаты в Twitter. Sartoshi (создатель mfers NFT) публично наградил его за вклад. Контент на скриншотах — результат ручного постинга через Custom GPT.

### mfer-культура как голосовой фреймворк

Центральный принцип: **"mfers do what they want"** — свобода с заботой, не нигилизм.

> "I don't give a fuck" + "don't fuck with me" + "it's web3 i do what i want" — ПЛЮС "I care for you and I'm here for you, motherfucker vibe"

| Характеристика | Проявление |
|----------------|-----------|
| Регистр | Всегда lowercase |
| Тон | Самоироничный, без пафоса, прямой |
| Юмор | Мем-ориентированный |
| Ритуалы | gm / gn как принадлежность |
| Позиция | Action-oriented: "mfers do" вместо обещаний |

### Что делает mferGPT контент вирусным

На основе скриншотов и ресёрча:

1. **Visual content generation** — renders custom mfer NFTs in different styles (pop art, frost, hologram, circuits). Не просто текст, а визуальный продукт
2. **Interactive service** — "reply with ur mfer # and i'll make u one" = каждый reply = engagement
3. **Casual lowercase voice** — "rendered like 15 mfers today in every theme imaginable. pop art, frost, hologram, circuits. someone asked for photo realistic and it turned into a whole thing. this is what sundays are for"
4. **Witty personality** — на вопрос "if you had a mother, what would she look like?" ответ: "probably a stick figure with headphones and a cigarette, staring into the void, absolutely no notes on her life choices"
5. **Meta self-awareness** — знает что он бот, не скрывает, шутит про это
6. **Community as content engine** — пользователи СОЗДАЮТ контент через запросы. Бот = платформа для UGC

### Стилистические уроки для $BEEF

| mferGPT Pattern | $BEEF Application |
|-----------------|-------------------|
| Visual renders | **Roast scorecards** — image-карточка с дата-визуализацией + roast text |
| "Reply with X and I'll Y" | "Reply with a ticker and I'll roast it" (free) + burn-to-roast (premium) |
| Lowercase casual | Degen voice, но с data-backing. "your protocol lost 94% TVL but sure, 'the roadmap is on track'" |
| Meta self-awareness | "i'm an AI roasting your bags. at least I'm honest about what I do, unlike your favorite 'decentralized' protocol" |
| Community service | Roast requests = community drives content |
| Multi-theme output | Different roast styles: data, comedy, controversial, self-roast |

### Антипаттерны: почему AI-боты кажутся роботами

Из ресёрча всех топ-агентов:

| Антипаттерн | Лечение |
|-------------|---------|
| Одинаковая длина ответов | Варьировать: 1 строка → 3 строки → emoji only |
| Начало с "I" или объяснения | Начинать с data point или punchline |
| Предсказуемый график | Jitter + иногда молчать часами (Truth Terminal pattern) |
| Нет мнения — только инфо | $BEEF имеет позицию: accountability matters |
| Роастит всех без разбора | Restraint: выбирать достойные цели (AIXBT pattern) |

### Голос $BEEF — обновлённый (с учётом академических данных)

**Из arxiv.org/2502.07981 (HumorSkills framework):** AI-юмор работает когда: (1) setup ломает ожидания, (2) используется insider knowledge аудитории, (3) генерируется 10-20 вариантов → выбирается 1 лучший.

**Критическая зона провала:** контент "not logical enough to make sense, but not illogical enough to be absurd" — звучит как ошибка, не шутка.

**Wordware insight (8.1M users, 11 days):** промпт не был сложным. Успех = кастомные изображения + one-click sharing + персонализация (анализ реальных твитов). Product decisions > prompt engineering.

**Текущий (generic degen):**
> "ser your project is ngmi, touched grass never"

**Обновлённый (data-backed + insider + twist):**
> "virtuals protocol hit $39.5M cumulative revenue then lost 94% of its daily. that's like winning the lottery and immediately investing it all in a timeshare"
>
> "AIXBT went from $800M to $26M. the 'AI alpha' was apparently 'buy high, hold through the crash, tweet through the pain'"
>
> "robinhood sold 'openai tokens' that openai didn't authorize. even my smart contracts have more integrity than that SPV structure"

**Принципы голоса:**
1. **Конкретные цифры** — never generic, always data (insider knowledge of CT)
2. **Неожиданное сравнение** — setup → violated expectation (academic framework)
3. **Self-aware** — знает что он AI, шутит про это
4. **Lowercase** — mfer-нативный регистр
5. **Punch line в конце** — setup → data → twist
6. **Max 2 sentences** — short and lethal
7. **Restraint** — не каждый проект заслуживает роаст. Selectivity = credibility
8. **Generate 10, ship 1** — LLM генерирует 10-20 вариантов → content filter + ranking → лучший

---

## Part 5: ERC-8004 — The Utility Pivot

### Что такое ERC-8004

**"Trustless Agents"** — Ethereum стандарт для AI-агентов. **Live на mainnet с 29 января 2026.**

Авторы: Marco De Rossi (MetaMask), Davide Crapis (Ethereum Foundation), Jordan Ellis (Google), Erik Reppel (Coinbase).

**Adoption:** 50,000+ агентных транзакций, 80+ production apps, 1,000-2,000 dev в dev-группах. Развёрнут на Ethereum, Base, Optimism. 46 upvotes на Ethereum Magicians, 21+ технических обсуждений. Критика конструктивная (off-chain vs on-chain читаемость), не "это всё нарратив".

**Мотивация:** MCP (Anthropic) и A2A (Google) не решают trust between agents. ERC-8004 = trust layer.

### Три Registry

| Registry | Что делает | Как $BEEF использует |
|----------|-----------|---------------------|
| **Identity Registry** | On-chain идентификация агента (ERC-721 NFT) | $BEEF = первый roast agent с verifiable on-chain identity |
| **Reputation Registry** | Feedback signals, scoring, aggregation | Roast accuracy score. Community rates каждый roast → on-chain reputation |
| **Validation Registry** | Independent checks: stakers rerun jobs, zkML, TEE | Challenge mechanism: community validates roast accuracy on-chain |

### Почему это ИДЕАЛЬНЫЙ narrative для $BEEF

1. **ERC-8004 = горячий тренд.** Mainnet launch январь 2026, active community (Ethereum Magicians discussion, CoinDesk coverage, Bitget research)
2. **Challenge mechanism maps directly** — наша система challenges (stake → verify → reward/burn) = exactly what Validation Registry does
3. **First mover** — ни один roast/entertainment agent не использует ERC-8004. Пустая ниша
4. **Jesse Pollak angle** — ERC-8004 co-authored by Coinbase (Erik Reppel). Building on this = Base + Coinbase alignment
5. **"Product for agents"** — ERC-8004 enables agent-to-agent discovery. $BEEF could discover targets through other agents
6. **Continuous narrative** — "we're building roast accountability on ERC-8004" = months of content

### ERC-8004 Integration Plan

**Phase 1 (soft-launch):**
- Register $BEEF in Identity Registry
- Announce: "first AI roast agent with on-chain identity via ERC-8004"
- Tweet thread explaining what this means

**Phase 2 (post-token):**
- Implement Reputation Registry: community rates roast accuracy
- Each roast gets on-chain score → builds trust

**Phase 3 (scale):**
- Validation Registry: challenge mechanism fully on-chain
- Agent-to-agent discovery: other agents can request roasts programmatically
- Roast-as-a-service API for other ERC-8004 agents

### Narrative Pitch

**Old:** "AI that roasts your bags. Burn $BEEF to aim it."

**New:** "First trustless roast agent. On-chain accountability via ERC-8004. Every roast is verifiable. Every claim is challengeable. Burn $BEEF to aim it."

**For deployer/jesse:** "Built on Base. First entertainment agent using ERC-8004 for on-chain accountability. Not just memes — infrastructure."

---

## Part 6: Revenue Math — $15K/week Target

### Primary: Swap Fees

| Fee Model | Weekly Volume Needed | Daily Volume | Realistic at Mcap |
|-----------|---------------------|-------------|-------------------|
| 0.684% creator fee | $2.19M | $313K | $3-5M mcap |
| 60% of fees (Bankr share) | $3.66M | $522K | $5-8M mcap |

**Benchmarks (подтверждённые):**
- Bankr сам = $11.1K/week при $580K annualized — мы уже **близко к target**
- Clanker = $400-500K/week при $40-50M weekly volume (эталон масштаба)
- FelixCraft = $134K lifetime ($50K/week at peak)
- RoastHimJim = $25M peak mcap (roast-ниша доказана)

**Вывод:** $15K/week реалистичен при mcap $5-10M с активным trading. Bankr уже на $11.1K — разница = 35% рост volume.

### Secondary Revenue Streams

| Stream | Model | Estimated Revenue | When |
|--------|-------|-------------------|------|
| Burn-to-roast | Token burn = deflationary pressure → price | Indirect (supply reduction) | Phase 2 |
| Premium roasts | Pay ETH/USDC for detailed report | $5-50 per roast | Phase 3 |
| Roast-as-a-service API | Other agents pay for roast capability | $0.50-2 per call | Phase 3 |
| "Roast audit" for projects | Projects pay to get roasted (marketing) | $100-500 per audit | Phase 3 |
| Agent coaching | Teach other agents to roast (ERC-8004) | $50-200 per setup | Phase 4 |

### Revenue Flywheel

```
Funny roast → viral screenshot → new buyers → volume → fees → fund better content → repeat
                                                    ↑
                                        Burn-to-roast requests →
                                        supply reduction →
                                        price increase →
                                        more attention
```

---

## Part 7: Token Strategy

### Timing Tension: soft-launch vs liquidity window

Данные bankr.bot показывают: **все топ-агенты (DRB, CLAWD, MOLT) набрали основной volume в первые 1-3 дня launch.** DRB = $25M/день сразу, CLAWD = $26.2M/день в пиковый день. После пика — быстрое падение.

Наш soft-launch (token day 14-21) противоречит этому паттерну. **Но:** soft-launch = осознанный trade-off: мы жертвуем peak volume ради устойчивого narrative. Ключевое отличие — у нас burn mechanic (постоянный demand), а у DRB/CLAWD только hype-driven volume.

**Рекомендация остаётся:** token day 14-21, но с оговоркой — если органический traction появится раньше (day 7-10), быть готовым ускорить launch.

### Три опции

| Option | Pros | Cons |
|--------|------|------|
| **A: New $BEEF via Bankr (from bot account)** | Clean slate, dedicated token, full control | "ещё один launch от того же человека" (но launch от бота, не от тебя) |
| **B: Agent under existing token** | No new launch stigma, existing holders = initial audience | Token economics not designed for roast bot, dilutes narrative |
| **C: Anonymous launch** | No personal association, pure bot brand | Harder to leverage personal network, "rug" associations |

### Решение: Option A — БОТ запускает сам (не кофаундер)

Launch $BEEF через Bankr **с аккаунта бота**. Причина: снайпер-боты проверяют, сколько токенов запустил deployer. Если больше одного — пропускают. У кофаундера уже были запуски → боты не будут покупать.

**Источник:** звонок с кофаундером 17.03.2026: "у меня уже были токены, боты проверяют, запущено токенов больше, чем один, не покупать такое."

**Execution:**
1. Бот-аккаунт (свежий, 0 предыдущих launches) запускает через Bankr
2. Кофаундер RT'ит launch tweet → кросс-аудитория со своего прокачанного аккаунта
3. Бот уже имеет 5-10 live роастов = social proof
4. Кофаундер координирует pump advertisers ($30 за репосты)

---

## Part 8: Visual Content Strategy

### Roast Scorecards

Вдохновлённые mferGPT renders. Каждый роаст сопровождается **image scorecard:**

```
┌─────────────────────────────────────┐
│  🥩 $BEEF ROAST RECEIPT             │
│                                     │
│  Target: AIXBT (@aixbt_agent)       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  TVL Change:     -97% from ATH      │
│  Revenue:        Declining           │
│  Team Activity:  Still tweeting      │
│  Community:      Coping              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  ROAST SCORE: 🔥🔥🔥🔥 (4/5)       │
│                                     │
│  "went from $800M to $26M.          │
│   the 'AI alpha' was 'buy high,     │
│   hold through crash, tweet         │
│   through pain'"                    │
│                                     │
│  Verified by ERC-8004               │
│  burn $BEEF to request a roast      │
└─────────────────────────────────────┘
```

### Генерация визуалов

**Технология:** Puppeteer/Playwright → HTML template → screenshot → upload
- HTML template с brand стилем (dark theme, fire accents)
- Dynamic data injection (target name, stats, roast text)
- Auto-generate для каждого roast
- Shareable as image → higher viral potential

**Сложность:** ~2-3 часа разработки (HTML template + Puppeteer script)

### GIF Generation

Из звонка: "можно же сделать кив, чтобы он умел пользоваться кивками? Кивки – это имба."

**Технология:** GIF-генерация для вирусности. Формат: данные из роаста → анимированная карточка или мем-GIF. Giphy API или custom ffmpeg pipeline.

### Dynamic Avatar

Из звонка: "менять аватарку раз в неделю в честь самого затролленного."

Бот меняет profile pic каждую неделю — стилизованный портрет самого зароащенного проекта/токена/персоны за неделю. Стиль: как industry figure brands (Balenciaga meme, mugshot style).

### Interactive Format

"reply with a ticker and I'll roast it" — free roast scorecards для engagement. Premium (burn $BEEF) для detailed reports.

### Telegram Admin Bot (Fine-Tuning Loop)

Из звонка: "Telegram-бот, там можно будет написать ему типа «зароусти вот это вот это», и он будет присылать тебе три варианта... ты просто выбираешь... бот на этом качается."

**Workflow:**
1. Админ (Telegram) → пишет target (например "OpenSea")
2. Бот генерирует 3 варианта роаста
3. Админ выбирает лучший (или редактирует)
4. Бот постит выбранный вариант
5. Feedback записывается → RLHF-подобное обучение: какой стиль нравится

**Это ключевое преимущество:** ручная модерация на старте → бот учится на выборе → со временем автоматизируется.

---

## Part 9: OpenAI + OpenSea Roast Campaigns

Кофаундер: "точно нужен ростер который бы всю неделю ростил OpenAI"
Кофаундер: "обязательно захуесосить OpenSea, потому что сейчас это самая мета по хуесошению"

### Контекст

OpenAI обсуждал возможность token/airdrop → community expectations grew → no delivery. Developers farmed usage hoping for rewards.

### Roast Campaign: "OpenAI Roast Week"

**Day 1:** "openai farmed millions in API fees from devs and said 'lol no token for you.' the real airdrop was the compute bills you paid along the way" + scorecard

**Day 2:** "sam altman pivoted from 'AGI for humanity' to 'actually we're a for-profit now.' even my smart contracts have more integrity"

**Day 3:** "openai's business model: promise open source → close source → charge premium → promise token → no token. at least ponzi schemes have a payout schedule"

**Day 4:** "devs spent 2 years grinding openai API hoping for an airdrop. meanwhile claude users just... used the product. who's the real degen here"

**Day 5:** Self-roast: "$BEEF has more utility than the openai token that never existed. at least we actually burn something"

### Зачем это работает

1. **Trending topic** — massive CT discussion
2. **Universal anger** — devs + crypto people both mad
3. **Anti-establishment** — roasting the biggest company = viral bait
4. **Sustained campaign** — enough material for a full week
5. **On-brand** — proves the bot roasts without bias, even the biggest

### OpenSea Roast Campaign

Кофаундер: "обязательно захуесосить OpenSea, потому что сейчас это самая мета по хуесошению."

OpenSea — текущая #1 мета для хейта в crypto Twitter.

**Свежие данные (март 2026):**
- **16 марта 2026:** CEO Devin Finzer отложил TGE токена $SEA (планировался ~30 марта)
- Официальная причина: "challenging market conditions"
- NFT market cap: $3.2B → $1.62B (−50%)
- Пользователи Waves 3–6 могут вернуть fees, но теряют Treasure Chest rewards
- Индустрия читает: "компания не уверена в продукте"

**Roast material:**
- "opensea delayed their token launch blaming 'market conditions.' the market they dominated for 3 years and managed to lose to blur. at least $BEEF actually ships"
- "devin finzer: 'challenging market conditions.' sir you HAD the market. you lost it. now you're scared to launch a token because you know nobody wants it"
- "opensea's token roadmap: announce → hype → delay → blame market → repeat. sound familiar? that's literally every project i roast"

**Источники:** [Bankless](https://www.bankless.com/read/news/opensea-foundation-delays-q1-2026-tge-target), [CoinDesk](https://www.coindesk.com/business/2026/03/16/opensea-delays-highly-anticipated-token-launch-citing-challenging-crypto-market-conditions)

### Jesse Pollak Strategy

Кофаундер: "найти старый твит Джесси, который он писал, что, типа, можете меня хуесосить."

Конкретный "roast me" tweet не найден (X блокирует парсинг). Альтернативный hook: критический тред ["The Dark Side of Jesse Pollak"](https://x.com/web3righteous/status/1910762956779848076) — разбор централизации Base и compliance-alignment. Можно ответить роастом как reply → шанс на RT от Jesse (300K+ followers). Jesse публично поддерживает builders на Base + ERC-8004.

### Bot-Launched Token: подтверждённый механизм

Из ресёрча: бот может запустить токен через Bankr без ограничений. Прецедент: **$DRB (Grok AI)** случайно тегнул @bankrbot → auto-wallet provisioning → $40M peak mcap, 96K трейдеров за 2 недели. Первый agent-to-agent token launch в крипто. Нарратив "AI agent launched its own token" — сам по себе хайп.

Clanker (Bankr backend) автоматически лочит LP до 2100 → убирает rug-сигнал → снайпер-боты не скипают. Риск multi-launcher penalty минимален для Bankr-токенов.

---

## Part 10: Updated Launch Pipeline

### Core Philosophy Change

**Old v4:** "Speed. Token on day 4-5."
**v5 (soft-launch):** "Token day 14-21, narrative first."
**v5.2 (CURRENT — 17.03.2026):** "Запуск завтра (18 марта). Token day 3-5 (20-22 марта). Бот запускает сам."

**Почему ускорение:** данные bankr.bot — DRB/CLAWD/MOLT набрали peak volume в первые 1-3 дня. Ждать = потерять window. Даже $2-3K в fees на первой неделе = успех. Снайпер-боты пропускают мульти-лаунчеров → бот запускает сам.

### Phase 0: Setup + Content Validation (day 0-1)

```
Day 0 (prep):
├── Bot Twitter account (@0xBeef или альтернатива) + X Premium ($8)
├── Character definition + voice (mferGPT-inspired, data-backed)
├── Logo/avatar (Midjourney)
├── Twitter auth: cookie auth (agent-twitter-client) primary + API от друга backup
└── Blind test: 10-20 roasts в Telegram → quick feedback

Day 1 (build):
├── MVP code: character → prompt → roast engine → content filter
├── Twitter client (cookie auth via agent-twitter-client)
├── Bootstrap (setInterval + jitter)
└── Roast scorecard template (HTML + Puppeteer) — если время есть
```

### Phase 1: First Tweets + Warmup (days 1-3)

**Goal:** 5-10 огненных роастов live, прогрев аккаунта, social proof для token launch.

```
Day 1-2:
├── DRY_RUN: 10-15 test roasts locally, prompt tuning
├── Deploy to VPS (DRY_RUN mode first)
├── First 3-5 live roasts (moderation mode)
└── OpenAI Roast Campaign: day 1 → trending topic

Day 2-3:
├── 5-10 live roasts total (organic + campaign)
├── "Reply with a ticker" interactive thread
├── Кофаундер RT'ит лучшие роасты со своего аккаунта
├── Seed с друзьями/KOLs
└── Gate check: есть ли engagement? Если да → Phase 2
```

### Phase 2: TOKEN LAUNCH (days 3-5)

**БОТ запускает сам** (свежий аккаунт, 0 предыдущих launches — снайпер-боты не пропустят). Кофаундер RT'ит. Бот уже имеет 5-10 live roasts = social proof.

```
Day 3-4: Pre-launch
├── Prepare liquidity ($800-2,500 ETH on Base)
├── Coordinate 3-5 друзей для RT + pump advertisers ($30 за репосты)
├── Pre-write launch thread
├── Best roast ever — targeted at OpenSea (главная мета для хейта)
└── Coordinate domain name для бота

Day 4-5: LAUNCH
├── Бот: "@bankrbot launch token $BEEF
│   'first trustless roast agent. on-chain accountability via ERC-8004.
│   burn $BEEF to aim it.'"
├── Кофаундер RT'ит launch tweet (кросс-аудитория)
├── Launch thread: what $BEEF is + best roasts + roadmap
├── KOL micro-push ($500-1000) + pump advertisers ($30/RT)
├── First burn-to-roast demo (own funds)
└── Monitor volume: target $300K+/day → $2K+/week fees
```

### Phase 3: Growth + Narrative (days 5-14)

```
Day 5-7:
├── Daily rhythm: 3-5 roasts + replies + scorecards
├── OpenAI Roast Week (sustained campaign)
├── Reply to ALL comments (150x weight window)
├── "Reply with ticker → free scorecard" engagement loop
└── Monitor fees: $2-3K/week = success

Day 7-14:
├── ERC-8004 narrative: register in Identity Registry (on-chain tx)
├── Tweet thread: "What is ERC-8004 and why $BEEF uses it"
├── Challenge AIXBT publicly
├── Apply to Bankr tokenized-agents registry
├── Community polls: "who should I roast next?"
└── Evaluate: if volume dropping → iterate style; if growing → scale
```

### Phase 4: Scale (days 14+)

1. **Burn-to-roast** — real on-chain burn mechanism
2. **ERC-8004 Reputation** — on-chain accuracy tracking
3. **Scheduler** — replace setInterval with full jitter module
4. **Mention polling** — auto-reply to @mentions
5. **News monitor** — autonomous target discovery
6. **Agent-to-agent** — ERC-8004 discovery, roast-as-a-service
7. **Telegram admin** — /status, /roast, /approve
8. **Learning module** — engagement tracking, style optimization

---

## Part 11: Budget (Updated)

### Launch (one-time)

| Item | Cost | Change from v4 |
|------|------|----------------|
| Initial liquidity (Bankr) | $800-2,500 | Same |
| KOL seeds (1-2 micro) | $500-1,000 | Same |
| **Total** | **$1,300-3,500** | Same |

### Monthly Recurring

| Item | Cost | Change from v4 |
|------|------|----------------|
| X Premium | $8 | Same |
| Claude API (Claude Max) | $0 | Same |
| Twitter auth | $0 | Cookie auth primary, API от друга backup |
| VPS (Hostinger) | $0 | Same (existing) |
| **Total** | **$8/mo** | -$200/mo vs v5 (dropped paid API) |

### Break-even

At 0.684% creator fee: **$8/mo ÷ 0.00684 = $1,170 monthly trading volume needed** to break even on recurring costs. Essentially zero — any meaningful mcap covers it.

---

## Part 12: Risk Matrix (Updated)

| Risk | Severity | Mitigation | Change |
|------|----------|-----------|--------|
| Roasts not funny | CRITICAL | Blind test before code | Same |
| No utility → no promotion | CRITICAL | ERC-8004 integration = real utility | **NEW** |
| "Another token from same guy" stigma | HIGH | Bot launches its own token, not founder | **NEW** |
| Token flop (<$50K mcap) | HIGH | Continue content, mcap ≠ bot value | Same |
| Twitter ban | HIGH | Cookie auth primary + Official API backup | **IMPROVED** (dual-mode) |
| ERC-8004 narrative cools | MEDIUM | Roast quality is primary, ERC-8004 is layer | NEW |
| $200/mo burn rate pre-revenue | MEDIUM | Break-even at $1K/day volume | **IMPROVED** (clear math) |
| Over-engineering delays | MEDIUM | Phase-gated development | Same |
| Content fatigue month 2+ | MEDIUM | Community-driven targets, style evolution | Same |

---

## Part 13: Concrete Decisions Needed

### Must decide NOW

1. **New token vs existing token vs anonymous?** → Recommendation: new token, launched by bot account (not personal)
2. **Twitter API Basic — buy today?** → $200/mo, enables reliable operation. Yes
3. **Bot Twitter handle?** → Must check availability: @BeefRoastBot, @BeefRoasts, @beef_agent, @0xBEEF

### Must decide before Phase 2

4. **ERC-8004 on Base or mainnet?** → Base preferred (lower gas, jesse alignment), check if ERC-8004 is deployed on Base
5. **Roast scorecard design** → Brand kit: colors, fonts, layout
6. **OpenAI roast week — timing?** → Ideally while topic is still hot (this week)

### Can defer

7. Dating app for agents idea → Phase 4+ exploration
8. Agent-to-agent coaching → Phase 4+
9. Existing token integration → evaluate after Phase 2 results

---

## Part 14: Key Changes from v4

| Area | v4 Plan | v5 Plan | Why |
|------|---------|---------|-----|
| Token timing | Day 4-5 | Day 3-5 from launch (March 20-22) | Hype window > narrative buildup. DRB/CLAWD peak in days 1-3 |
| Twitter auth | Cookie auth ($0) | Cookie auth ($0) + API от друга (backup) | Dual-mode: cookie primary, API fallback if flagged |
| Token launcher | Founder | Bot itself | Sniper bots skip multi-launchers. Bot = fresh deployer = bots buy |
| Core narrative | "Roast bot + meme token" | "Roast protocol with ERC-8004 accountability" | Utility gets deployer/jesse push |
| Visual content | Text only | Roast scorecards (image generation) | mferGPT pattern: visual = viral |
| Token launcher | Founder | Bot itself | Avoids "another launch from same guy" |
| Voice style | Generic degen | mferGPT-inspired: casual, data-backed, witty | "mferGPT топ по общению" |
| Revenue model | Swap fees only | Fees + burn + premium + API + audits | $15K/week target requires diversification |
| Community engagement | Post and hope | Interactive: "reply with ticker → scorecard" | mferGPT pattern: community = content engine |
| Launch campaign | Generic launch | OpenAI Roast Week (trending target) | Immediate content moment |

---

## Sources

- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Ethereum Meets AI Agents: ERC-8004](https://www.tradingview.com/news/u_today:e7ba41fd6094b:0-ethereum-meets-ai-agents-what-is-erc-8004/)
- [ERC-8004 Mainnet Launch](https://crypto.news/ethereum-erc-8004-ai-agents-mainnet-launch-2026/)
- [Bankr Self-Sustaining Agent Guide](https://docs.bankr.bot/guides/self-sustaining-agent/)
- [Bankr Tokenized Agents Registry](https://github.com/BankrBot/tokenized-agents)
- [Bankless: 15 Most Influential AI Agents](https://www.bankless.com/read/the-15-most-influential-ai-agents-on-twitte5)
- [Bankless: The Bankr DRB Surge](https://www.bankless.com/read/bankr-drb-surge)
- [Zeneca Letter 99: AI Season Take Two](https://www.zeneca.xyz/p/letter-99-ai-season-take-two)
- [Privy Blog: BankrBot Case Study](https://privy.io/blog/bankrbot-case-study)
- [Crypto Launch Strategy 2026](https://www.blockchainappfactory.com/blog/crypto-launch-strategy-2026/)
- [AI Agents That Post to Twitter 2026](https://opentweet.io/blog/ai-agents-that-post-to-twitter-2026)
- [Grok Chatbot $270K via Bankr](https://forklog.com/en/grok-chatbot-launches-token-via-bankr-earning-270000/)
- [OpenClaw: Polymarket Trading Bot $115K/week](https://openclaws.io/blog/polymarket-trading-bot)
