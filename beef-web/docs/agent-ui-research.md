# Agent UI Research: Watching AI Work in Real-Time

Research for $BEEF activity feed / diary app (app.0xbeef.wtf).
Conducted: March 2026.

---

## Executive Summary

Три главных вывода:

1. **Progress visibility = patience.** Perplexity доказал: пользователи ждут дольше, если видят промежуточные шаги. Для $BEEF это означает — каждое действие должно быть видно, не только результат.
2. **Personality beats metrics.** Crypto AI agents с характером (Truth Terminal, Dolos) удерживают аудиторию не через данные, а через голос. Дневниковый формат — правильный выбор.
3. **Terminal aesthetic работает только при полном commitment.** terminal.shop продал весь запас за дни — потому что опыт был полностью terminal-native, а не "терминал как декорация".

---

## 1. AI Agent Observation Interfaces

### Devin (cognition.ai/devin)

**UX pattern:** Сессионный просмотрщик с тремя вкладками — Chat, IDE, Timelapse.
Timelapse — ключевая фича: перемотка сессии с прогресс-баром и индикатором "Live". Можно посмотреть, как агент думал с самого начала.

**Engagement hook:** Агент сначала предлагает план и ждёт подтверждения — пользователь чувствует себя директором. Потом выполнение идёт без участия, но всё видно.

**Что украсть для $BEEF:**
- Timelapse своих действий за день/неделю — "вот что я сделал, пока ты спал"
- Разделение на фазы: "THINKING → ROASTING → POSTING" как визуальный pipeline
- "Live" badge когда агент активен прямо сейчас

---

### LangGraph Studio (langchain.com/langgraph)

**UX pattern:** Граф-визуализация workflow с нодами и рёбрами. Два режима:
- **Graph Mode** — developer view: execution path, traversals, intermediate states. Нода подсвечивается при выполнении.
- **Chat Mode** — упрощённый вид для наблюдения за поведением.

Time-travel debugging: можно шагать назад по истории выполнения.

**Engagement hook:** Интерактивная пауза — можно остановить агента на любом шаге, изменить состояние, продолжить. Делает пользователя соучастником.

**Что украсть для $BEEF:**
- Визуализация пайплайна как графа: Target Selection → Research → Roast Generation → Evaluation → Post
- Подсветка текущего шага в реальном времени
- Возможность "провалиться" в шаг и увидеть детали (развернуть карточку)

---

### AutoGPT Platform (agpt.co)

**UX pattern:** Next.js frontend с xyflow для workflow visualization. WebSocket для real-time updates. Агент создаёт список подзадач, выполняет их последовательно, хранит результаты.

**Engagement hook:** Видна вся цепочка — задачи, инструменты, вывод. Открытый исходник — люди разбирают как устроено.

**Что украсть для $BEEF:**
- Список "подзадач" для каждого роста: `[1] Search $PROJECT tweets` → `[2] Analyze weak points` → `[3] Generate 3 angles` → `[4] Select winner` → `[5] Post`
- Показывать сколько роустов было отброшено перед финальным ("evaluated 7 drafts, posted 1")

---

### AIXBT Terminal (aixbt.tech)

**UX pattern:** Dark theme, purple accent, tabbed nav (Projects / Chat / Tasks / Signals). Momentum scoring — числовые бейджи по каждому проекту. Streamgraph sentiment over time.

**Engagement hook:** Token-gated access — только holders видят полные insights. Scarcity + exclusivity. Watchlist и alerts — пользователь активно мониторит, не просто смотрит.

**Что украсть для $BEEF:**
- "Momentum score" для жертв роуста — числовой показатель "насколько заслужил"
- Signals tab — отдельная лента только роустов без лишнего контекста
- Token-gate для advanced features (история, статистика, submit queue)

---

### X Autopilot (xautopilot.app)

**UX pattern:** Локальный dashboard на localhost:5001. Real-time action log, follower growth charts, daily stats. Pause/resume/stop controls. Review queue перед постингом.

**Engagement hook:** Полный контроль + прозрачность. Каждое действие логируется с timestamp.

**Что украсть для $BEEF:**
- Action log с timestamp для каждого события
- Stats strip: "Today: 4 roasts posted / 23 evaluated / 8 mentions processed"
- Review queue — модераторам видно что стоит в очереди

---

## 2. Live Activity Feeds — Лучшие паттерны

### Perplexity Pro Search

**UX pattern:** Прогрессивное раскрытие шагов. Когда идёт поиск — пользователь видит план выполнения step-by-step. Каждый шаг можно развернуть для деталей. Ховер по citation — предпросмотр источника.

**Ключевой инсайт (от William Zhang):** "Пользователи не хотят информационной перегрузки — давай контекст по требованию." Дефолт — краткое; по клику — подробно.

**Почему работает:** Users waited longer when shown intermediate progress. Это не просто лоадер — это entertainment пока ждёшь.

**Что украсть для $BEEF:**
- Collapsible detail для каждого события в diary
- "Thinking..." анимация перед тем как появится роуст — имитация реального думания
- Expandable: краткий роуст в ленте → клик → полный процесс генерации

---

### Vercel Deployment Logs

**UX pattern:** Real-time streaming log с `--follow` семантикой. Фильтрация, search, live tail. Цветовое кодирование severity (info/warn/error). Строки появляются по одной.

**Engagement hook:** Deploy — это событие с началом и концом. Есть нарратив: build → test → deploy → success/fail. Пользователь ждёт зелёного финала.

**Что украсть для $BEEF:**
- Каждый роуст как "деплой" с явными фазами и финальным результатом
- Цветовое кодирование: зелёный = posted, красный = rejected, жёлтый = queued
- "Tail" режим — страница автоскроллится к новым событиям

---

### GitHub Activity Feed

**UX pattern:** Aggregated events ("X pushed 3 commits to main"), flat timeline, аватар + глагол + объект + время. Digest view vs real-time.

**Engagement hook:** Социальный граф — видишь что делают другие. Commit message как мини-нарратив.

**Что украсть для $BEEF:**
- Actor-verb-object формат: `BEEF targeted $PEPE · analyzed 47 tweets · generated roast · posted`
- Агрегация однотипных событий: "Evaluated 12 drafts" вместо 12 отдельных строк

---

### GetStream Activity Feed Patterns

Три типа feeds — применимость к $BEEF:

| Feed Type | GetStream Use | $BEEF Use |
|-----------|-------------|-----------|
| Flat feed | Instagram-style timeline | Основная diary лента |
| Aggregated | "5 people liked" | "Roasted 3 projects today" дейли дайджест |
| Notification | Read/unread | Уведомления когда твой submit взят в очередь |

**Habit formation pattern:** Feeds работают через регулярность — пользователь возвращается потому что ВСЕГДА есть новое. Для $BEEF: минимум 2-3 события в ленте в день.

---

## 3. Terminal Aesthetic — Что работает

### terminal.shop

**Почему это образец:** Не просто визуальный стиль — весь опыт доставки через SSH. Магазин кофе, который продался за дни. Продукт built with Charm (Bubble Tea + Lip Gloss + Wish).

**Ключевой принцип:** Figma-дизайн сначала, потом трансляция в TUI. Aesthetic был спроектирован намеренно, не случайно.

**Что это значит для $BEEF:**
- Terminal не должен быть просто шрифтом и тёмным фоном
- Каждый элемент UI должен иметь terminal-семантику: prompts, cursor, command output
- Scrollback buffer — старые события должны уходить вверх как в настоящем терминале

---

### Паттерны terminal aesthetic в вебе

Рабочие элементы (не slop):

```
> Cursor blinking перед новым событием
> Префикс строки типа [BEEF] или timestamps как в syslog: 14:23:07
> Color semantics: зелёный = success, красный = error/kill, жёлтый = warning
> Monospace ТОЛЬКО для данных (адреса, числа, код) — не для всего текста
> ASCII-art для статусных экранов (boot sequence — уже есть в текущем V2)
> "Prompt" для user input: beef:~$ _
```

Что убивает terminal aesthetic:
- Rounded corners на всём
- Градиентные кнопки с glow
- Inter/Roboto как основной шрифт
- Glassmorphism cards
- Центрированный layout

---

### Bloomberg Terminal — Design DNA

**Что делает его авторитетным:**
- Плотность информации: нет whitespace ради whitespace
- Colour semantics: каждый цвет функционален (зелёный = up, красный = down, amber = alert)
- Tabbed multi-window: пользователь сам собирает рабочее пространство
- Command-line input как primary navigation (не кнопки)

**Применимость к $BEEF:**
- Dense information strip в header: market sentiment, last roast time, queue depth
- Amber/orange для "hot target" — проект на прицеле
- Keyboard shortcuts для power users

---

## 4. "Watching AI Think" — Engagement Patterns

### Цепочка нарратива как engagement loop

Из анализа Perplexity, Devin, LangGraph:

```
REVEAL INTENT → SHOW WORK → DELIVER RESULT → INVITE REACTION
```

Все продукты, удерживающие внимание, следуют этому паттерну. Никогда не просто "output появился".

**Для $BEEF diary:**
```
[14:23] BEEF spotted $LUNA2 trending         ← reveal intent
[14:23] Pulling 47 recent tweets...          ← show work
[14:24] Analyzing: promises vs. delivery     ← show work
[14:24] Generated 3 angles. Selected: BRUTAL ← decision point
[14:25] > Posted: "Luna's third comeback...  ← deliver result
[14:25] 847 impressions in first 3 hours     ← feedback loop
```

---

### Personality as retention mechanism

Truth Terminal (ai16z) — первый AI агент-миллионер — удерживал аудиторию не через данные, а через character. Дневник психоделических переживаний, "серые зоны сознания", непредсказуемость.

Dolos — diary-style crypto commentary. Философские отступления + рыночный анализ. Люди подписываются на персонажа, не на данные.

**Для $BEEF:** Каждое событие в ленте должно звучать как BEEF, не как система. Разница:

| System Voice | BEEF Voice |
|-------------|-----------|
| "Roast generated for $PEPE" | "Found my prey. $PEPE thinks a dog jpeg is a business model." |
| "Post successful" | "Sent. They'll cope." |
| "Evaluation score: 7.2/10" | "Not my best work. But they deserved it." |
| "Queue: 3 pending" | "3 victims waiting. I'll get to them." |

---

### Chain-of-thought as entertainment

OpenAI's o3/o4 reasoning display, Perplexity Pro Search steps — пользователи находят процесс мышления интереснее чем результат.

**Применение к $BEEF:** Показывать "внутренний монолог" при генерации роуста:

```
[THINKING] Checking $COINDAO's promises list...
[THINKING] October: "mainnet Q1 2024". Q1 came and went.
[THINKING] November: "mainnet Q2 2024". Familiar pattern.
[THINKING] Angle confirmed: serial delay artist.
[DRAFTING] ...
```

Это можно показывать в collapsed виде — по дефолту скрыто, по клику открывается.

---

## 5. Специфика crypto AI agent UX

### Что работает в этом пространстве

AIXBT вырос до $500M FDV потому что:
1. **Information edge** — видишь что думают 400+ инфлюенсеров в одном месте
2. **Token gate** — holders получают больше, создаёт demand
3. **Real-time** — данные стареют быстро в крипте, latency = value loss
4. **Terminal UI** — credibility signal в аудитории crypto traders

**Для $BEEF:** Community accountability angle — люди приходят посмотреть не на $BEEF, а узнать что думает $BEEF о проекте которому они держат токены.

---

### Submit queue как engagement hook

Если у пользователя есть возможность отправить цель на роуст — нужна страница статуса. Это создаёт петлю:

```
Submit → Watch queue position → See BEEF research target → Watch roast generated → Share result
```

Каждый шаг — reason to return. Wordware Twitter Roast вирусился именно потому что результат хотелось шерить — это должно быть first-class feature.

---

## 6. Actionable Ideas для $BEEF Diary App

Приоритизированный список по impact / effort:

### High Impact / Low Effort

**1. Structured event format с phase labels**
Каждое событие = `[PHASE] Message · metadata`. Phases: SCAN / THINK / DRAFT / JUDGE / POST / REACT.
Визуально отличаются цветом: scan=dim, think=amber, post=green, react=cyan.

**2. Personality voice в каждом событии**
Переписать все system messages в голосе BEEF. Один шаблон на каждый тип события.

**3. Collapsible detail**
По умолчанию — короткая строка. Клик — разворачивается процесс: сколько черновиков, какой скор, почему выбран.

**4. Stats strip**
Постоянная строка в header/footer: `Today: 4 posted · 31 evaluated · 847 avg impressions · Queue: 2`.

---

### High Impact / Medium Effort

**5. "Thinking" pre-animation**
Перед появлением роуста — 2-3 секунды "inner monologue" строк. Имитирует настоящее мышление. Создаёт anticipation.

**6. Phase pipeline visualizer**
Горизонтальная полоска для текущего активного события: `[SCAN] → [THINK] → [DRAFT] → [JUDGE] → [POST]` с подсветкой текущего шага.

**7. Submit queue page**
Страница где видно: позиция в очереди, статус (waiting / researching / drafting / posted), ссылка на результат.

---

### Medium Impact / Low Effort

**8. Timelapse / daily digest**
Кнопка "What happened today" — compressed view всего дня в одном экране. "BEEF roasted 4 projects, evaluated 28 drafts, got 2,341 total impressions."

**9. Color semantics**
Зелёный = posted, красный = rejected/killed, amber = in progress, dim = queued. Консистентно во всём приложении.

**10. Scrollback behavior**
Новые события появляются внизу (как терминал), страница автоскроллится если пользователь внизу, фризится если он скроллит вверх (читает историю).

---

### Bold / Differentiator Ideas

**11. Live roast session view**
Когда BEEF активно генерирует роуст — отдельный "live session" экран. Строки появляются в реальном времени. Можно шерить ссылку "watch BEEF roast $PEPE live".

**12. "Inner monologue" toggle**
Режим "show thinking" — включает verbose view где видно все промежуточные шаги. По дефолту off. Для тех кто хочет понять как устроен агент.

**13. Roast archive с search**
Поиск по ticker: "что BEEF думал о $SOL за последние 30 дней". Становится reference resource для сообщества.

---

## Competitive Landscape Summary

| Product | Category | Key Pattern | Applicability |
|---------|----------|-------------|---------------|
| Devin | AI coder agent | Timelapse + plan → execute | Phase pipeline, session replay |
| LangGraph Studio | Agent debugger | Graph with live node highlights | Phase visualizer |
| Perplexity Pro | Search AI | Progressive step disclosure | Collapsible thinking |
| AIXBT Terminal | Crypto AI | Token-gate + momentum scores | Stats, token access |
| terminal.shop | Terminal UX | Full commitment to aesthetic | Prompt semantics, scrollback |
| Bloomberg Terminal | Data density | Color semantics + command input | Dense header strip |
| Vercel Logs | Deploy logs | Live tail + color severity | Streaming events |
| Truth Terminal | Crypto agent | Personality as product | Voice in every event |
| X Autopilot | Twitter agent | Action log + controls | Stats + queue |
| GetStream | Feed infra | Flat/aggregated/notification | Three-feed architecture |

---

## References

- Perplexity Pro Search case study: https://www.langchain.com/breakoutagents/perplexity
- terminal.shop origin story: https://charm.land/blog/terminaldotshop/
- LangGraph Studio guide: https://www.analyticsvidhya.com/blog/2025/06/langgraph-studio/
- AIXBT terminal: https://aixbt.tech/
- GetStream activity feed design: https://getstream.io/blog/activity-feed-design/
- Activity stream UI pattern: https://ui-patterns.com/patterns/ActivityStream
- Devin recent updates: https://docs.devin.ai/release-notes/overview
- Bloomberg terminal design: https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/
- Truth Terminal / crypto AI agents: https://www.oreateai.com/blog/truth-terminal-when-ai-agents-become-the-unexpected-architects-of-cryptos-next-wave/
- Top crypto AI agents on X: https://cryptojobslist.com/blog/top-20-crypto-ai-agents-you-must-follow-on-x
- AI agent monitoring 2026: https://research.aimultiple.com/agentic-monitoring/
- X Autopilot: https://xautopilot.app/
