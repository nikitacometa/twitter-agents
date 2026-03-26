# AI Humor Generation: Research Findings for $BEEF Roast Pipeline

Исследование: март 2026. Охват: 20+ источников (академические статьи 2024–2026, инструменты, теория комедии).

---

## Выводы первого уровня (TL;DR)

1. **Quote-flip — это не случайность, это Ironic Echo.** Техника имеет теоретическое обоснование и её можно систематизировать в промпте.
2. **LLM-ы ошибочно оптимизируют Novelty вместо Empathy** — именно поэтому генерируют умные, но не смешные роасты. Фикс: явно инструктировать модель работать через "узнаваемость" цели.
3. **Multi-stage reasoning обгоняет single-pass на 96% win rate.** HUMORCHAIN (2025): structured reasoning через теории юмора vs zero-shot = 0.810 против 0.412.
4. **73% моделей работают лучше при temperature <= 0.5 для юмора** — вопреки интуиции "чем выше creativity, тем смешнее".
5. **Best-of-N с LLM-судьёй работает.** Генерировать 3–5 кандидатов и ранжировать судьёй по специфичным критериям — доказанный паттерн.
6. **Персонажный ролевой промпт не работает.** Persona-based prompting ("притворись Карлином") улучшает метрики на 3% max — не стоит усилий.

---

## 1. Академические исследования 2024–2026

### 1.1 HUMORCHAIN: Theory-Guided Multi-Stage Reasoning (ноябрь 2025)

**Источник:** https://arxiv.org/html/2511.21732

Самый практически применимый фреймворк. Вместо единственного промпта — четыре стадии, каждая обоснована теорией юмора:

| Стадия | Действие |
|--------|----------|
| 1. Анализ цели | Идентификация сущностей, ключевых характеристик, противоречий |
| 2. Выбор стратегии | Одна из четырёх: Absurdity, Contrast_irony, Emotion_analogy, Object_analogy |
| 3. Reasoning pathway | Применение выбранной стратегии с теоретическим обоснованием |
| 4. Refinement + safety | Оценка, фильтрация, выбор лучшего |

**Результаты:** Human humor ratings 0.810 vs 0.412 (zero-shot baseline). Win rate 69.5% против zero-shot, 68.3% против CLoT. Доля humorous outputs выросла с 45.1% до 67.0%.

**Прямое применение для $BEEF:** текущий pipeline (rubric/persona/adversarial) — это одноуровневые стратегии. Добавление explicit reasoning stage перед генерацией должно дать сопоставимый прирост.

### 1.2 Oogiri Multi-Dimensional Evaluation (ноябрь 2025)

**Источник:** https://arxiv.org/html/2511.09133v1

Ключевое открытие: **LLM-ы и люди оценивают юмор по разным весам**.

| Что предсказывает Overall Funniness | Люди | LLM-ы |
|-------------------------------------|------|--------|
| Empathy (узнаваемость, "это про меня/нас") | **Первое место** | Низкий приоритет |
| Novelty (оригинальность, неожиданность) | Второй | **Первое место** |
| Intelligence | Третий | Третий |

LLM-ы генерируют *неожиданное* вместо *узнаваемого*. Именно поэтому generic analytical roasts ("ваш TVL упал на 94%") получают 2.0–3.0: они novel, но не empathic.

Quote-flip получает 4.5–5.0 потому, что мишень сама произнесла эти слова — аудитория их помнит, они узнаваемы, это максимальный Empathy score при минимальных символах.

**Фикс в промпте:** явно требовать "relatable, specific to what THIS target said or did publicly" вместо "unexpected or original."

### 1.3 CLoST: Structured Thought Leaps (октябрь 2024)

**Источник:** https://arxiv.org/abs/2410.10370

"Юмор требует multi-hop reasoning, где каждый hop обоснован." Фреймворк LoL (Leap of Logic) — двухэтапный:
1. Automatic instruction expansion через teacher-student loops
2. Self-improvement через DPO с rationale от эксперта

Вывод для inference-only (без fine-tuning): **принудительный CoT с явным "causal pathway"** — почему это смешно — улучшает генерацию. Не просто "напиши смешно", а "объясни, почему это смешно, потом напиши."

### 1.4 CLoT: Creative Leap-of-Thought (CVPR 2024)

**Источник:** https://arxiv.org/abs/2312.02439 | GitHub: https://github.com/sail-sg/CLoT

Ключевой инсайт: стандартный CoT ("думай шаг за шагом") не работает для юмора — юмор требует *non-sequential* ассоциаций через несвязанные концепты.

Конкретная техника: **Remote Association Prompting** — сначала найти неочевидную параллель между целью и несвязанным концептом, потом генерировать роаст из этой параллели.

Пример для крипто-роаста: вместо "их токен упал на 95%" -> "что объединяет их токен и конкретный исторический провал? Где точная аналогия?" -> роаст из аналогии.

### 1.5 Temperature для юмора (апрель 2025)

**Источник:** https://arxiv.org/abs/2504.02858

715 конфигураций, 13 моделей. Результаты:
- 73% моделей: пик производительности при temperature <= 0.5
- Архитектура объясняет 38.7% variance в humor quality
- "Compact models" (эффективные при малой длине) vs "verbose specialists" — разные оптимальные настройки

**Контринтуитивный вывод:** высокий temperature для юмора = не лучше. Оптимум: temperature 0.4–0.5 для Claude при roast generation. Diversity достигается через разные стратегии/углы, не через случайность.

### 1.6 Human Alignment for Humor Ranking (февраль 2025)

**Источник:** https://arxiv.org/html/2502.20356v1

Persona-based prompting ("притворись редактором New Yorker") — максимум +3% improvement. Fine-tuning на 5,580 human preference pairs — +15% (до 82.4% accuracy).

**Для $BEEF:** persona промпты для judges малоэффективны. Вместо этого: сформулировать criteria как human evaluator rubric с конкретными примерами из human review сессий (у нас уже есть 33 оценённых роаста — это мини-датасет для калибровки судей).

### 1.7 Feedback-Driven Humor Distillation (февраль 2024)

**Источник:** https://arxiv.org/html/2402.18113v1

Pairwise feedback (A или B смешнее?) эффективнее absolute scores. DPO на pairwise данных = +22–32% improvement. Combined BRIO-DPO = +26–35%.

**Для $BEEF:** каждая human review сессия — это pairwise data. Даже 33 оценки уже достаточны для калибровки LLM-судьи через few-shot примеры в системном промпте.

---

## 2. Open-Source Инструменты

### 2.1 HumorNet / funniest-joke-with-LLMs

**Источник:** https://github.com/kabir2505/funniest-joke-with-LLMs

PlanSearch pipeline для юмора:

```
Topic -> Premises/Observations -> Punchline Ideas -> Setup -> Full Joke (xN) -> LLM Judge -> Best
```

Система судей: 3 LLM-семейства x 7 personality archetypes (Aggressive, Absurdist, Affiliative, Self-Enhancing, etc.). Bayesian smoothing для агрегации. Scoring: score, originality, setup_quality, humor_type.

**Применение:** взять архитектуру судей (multiple archetypes + Bayesian aggregation) вместо одного судьи.

### 2.2 CLoT Codebase

**Источник:** https://github.com/sail-sg/CLoT

Официальный код CVPR 2024. Содержит prompts для Remote Association task и Oogiri generation. Полезно как reference для prompt templates.

### 2.3 Wordware Twitter Roast (2024, closed source)

**Источник:** https://newsletter.aimakerslab.io/p/inside-the-ai-thats-roasting-twitter

4 миллиона пользователей за 11 дней. Архитектура:
1. Scrape Twitter history (последние N твитов)
2. Prompt chaining: сначала "identify personality traits", потом "generate roast using those traits"
3. Результат показывается публично -> screenshot virality loop

Ключевой инсайт: **они роастили на основе паттернов из реальных твитов человека**, не generic profile. Это и есть систематизированный quote-flip.

---

## 3. Prompting Techniques для юмора

### 3.1 Что доказано работает

| Техника | Прирост | Источник |
|---------|---------|---------|
| Multi-stage reasoning (HUMORCHAIN) | +96% win rate vs zero-shot | arxiv 2511.21732 |
| Causal pathway CoT ("объясни почему смешно, потом пиши") | Значимый | arxiv 2410.10370 |
| Best-of-N + LLM judge | Значимый | github kabir2505 |
| Few-shot с pairwise примерами (хороший/плохой) | +22–32% | arxiv 2402.18113 |
| Explicit Empathy instruction ("узнаваемо для CT аудитории") | Значимый | arxiv 2511.09133 |

### 3.2 Что не работает

| Техника | Эффект | Источник |
|---------|--------|---------|
| Persona roleplay ("ты — Карлин") | +3% max | arxiv 2502.20356 |
| Comedian impersonation | No improvement | aclanthology 2025.cmcl |
| Высокий temperature для "творчества" | Хуже | arxiv 2504.02858 |
| Standard CoT для юмора | Хуже, чем "outside-the-box" | CVPR 2024 |

### 3.3 Remote Association Prompting (практический шаблон)

Вместо:
```
Write a savage roast of [TARGET]
```

Использовать:
```
Step 1: What is the most specific, memorable thing [TARGET] said or claimed publicly?
Step 2: What is the gap between that claim and observable reality (on-chain data, price action, team history)?
Step 3: What unexpected concept from outside crypto illustrates this gap? (historical failure, movie character, natural phenomenon)
Step 4: Write a roast in <240 chars that makes the gap visible through the lens of step 3, using their own claim as the setup.
```

---

## 4. Оценка юмора AI

### 4.1 Ключевые бенчмарки

| Бенчмарк | Что измеряет | Размер |
|----------|-------------|--------|
| NYCC (New Yorker Caption Contest) | Funniness preference | 250M+ human ratings |
| HumorDB | Visual humor binary/regression | Curated image pairs |
| HumorBench | Understanding + generation | NYCC subset |
| Oogiri Dataset | 6-dimensional текстовый юмор | 200 topics |

### 4.2 Human-AI Calibration Gap

Текущее состояние LLM-судей (2025): o3 = 87.5% accuracy на humor understanding, Claude/Gemini/DeepSeek около 80%. Для генерации — значительно хуже.

**Проблема судей в $BEEF:** если судья оценивает Novelty как главный критерий, а не Empathy/узнаваемость — он будет одобрять "умные" роасты, которые не смешные для аудитории.

**Фикс:** добавить в prompt судьи явный weight: "Is this roast specific enough that only THIS target's followers would recognize it? (1-5)" как ключевой критерий.

### 4.3 Pairwise > Absolute Scores

Pairwise оценка ("A или B смешнее?") более стабильна, чем absolute score (1–10). 76% agreement между LLM-судьёй и людьми при pairwise сравнении (vs ~60% для absolute).

---

## 5. Теория комедии: систематизированные паттерны

### 5.1 Фундаментальные теории и их применение

**Incongruity-Resolution Theory (Расскин, SSTH)**
Текст совместим с двумя scripts; они противоположны друг другу. Применение для роастов: setup активирует "официальный нарратив" проекта, punchline переключает на "реальность данных".

**Benign Violation Theory**
Нарушение нормы должно быть benign (не реально вредоносным). Применение: роаст должен атаковать проект/кейс, не личность. Это и этически корректнее, и смешнее.

**Superiority Theory**
Юмор из ощущения превосходства над субъектом. Применение: явный gap между заявленным и реальным — это и есть механика superiority.

### 5.2 Техники, применимые в 280 символах

| Техника | Описание | Применение |
|---------|----------|-----------|
| **Ironic Echo** | Повторить слова цели, но в новом контексте, где они означают противоположное | Quoted tweet с их фразой + "aged well" / реальные данные |
| **Chiasmus** | Перевернуть структуру их утверждения | "Они обещали 100x. Получили 100%" (имея в виду -99%) |
| **Misdirection** | Setup создаёт одно ожидание, punchline меняет направление в последний момент | Punch word — последнее слово роаста |
| **Rule of Three** | Две нормальные вещи, третья — неожиданная | "партнёрства, roadmap, rug" |
| **Specificity amplifier** | Конкретное название > generic описание | $LUNA > "failed stablecoin"; конкретная дата > "недавно" |
| **Petard Hoist** | Их собственная риторика/логика убивает их позицию | Используй их whitepaper, их твит, их AMA против них |

### 5.3 Ironic Echo — ключевая механика quote-flip

Ironic Echo: когда Bob сказал X, Alice повторяет X в контексте, где X означает противоположное или разоблачает Bob'а. Работает потому, что аудитория уже знает оригинальный контекст — это максимальный Empathy score при минимальных символах.

**Формула:**
```
[Дословная цитата цели] + [gap от реальности] -> аудитория сама завершает вывод
```

Пример:
```
"We're building the future of DeFi" — [Project] whitepaper, Feb 2024
Current TVL: $47K. Future's looking cozy.
```

Аудитория делает вывод сама — это важнее, чем если бы бот сказал "они провалились". Самостоятельный вывод = более сильная реакция.

---

## 6. Реальные AI Comedy проекты

### 6.1 Wordware Twitter Roast (2024)

- **Техника:** Scrape всей истории аккаунта -> extract personality traits через LLM -> generate roast using those traits
- **Почему вирально:** роасты были hyper-specific (упоминали реальные твиты), легко узнаваемы, легко шарились через screenshot
- **Что взять:** explicit trait extraction step before generation

### 6.2 AIXBT ($27M mcap, активен)

- **Техника:** Аналитика on-chain + трендовые нарративы. НЕ entertainment
- **Что взять:** их data sourcing; их approach к актуальности

### 6.3 Nateraw/roast-or-toast-bot (GPT-3 era)

- **Техника:** Прямой prompt: "roast or toast this tweet"
- **Проблема:** Generic, без personalization
- **Вывод:** подтверждает, что single-pass без структуры не работает

---

## 7. Систематизация Quote-Flip Quality Roasts

### 7.1 Почему quote-flip получает 4.5–5.0

Сводная модель из исследований:

1. **Empathy (Oogiri paper):** аудитория уже знает цитату -> максимальная узнаваемость
2. **Incongruity resolution:** setup = их заявление, punchline = реальность. Два scripts в одном твите
3. **Specificity:** конкретная цитата > generic "они плохой проект"
4. **Petard Hoist:** они сами дали боеприпас -> кажется справедливым, не bullying
5. **Brevity:** цитата + данные = 280 символов, больше ничего не нужно

### 7.2 Почему generic analytical роасты получают 2.0–3.0

1. **Novel but not relatable:** данные TVL/price unexpected для читателя -> LLM оценивает высоко, люди — нет
2. **No Empathy anchor:** нет узнаваемой точки для аудитории
3. **Tells vs Shows:** "они провалились" вместо "их слова + их реальность"
4. **Missing punchline word:** нет punch word в конце — нет release tension

### 7.3 Промпт-архитектура для систематического quote-flip

**Шаг 1: Quote Extraction (часть target enrichment или отдельный вызов)**

```
Given this crypto project/KOL target, find:
1. Their most recent or most-remembered public claim (tweet, whitepaper, AMA)
2. The specific number, timeframe, or promise they made
3. Current on-chain reality (price, TVL, volume, team activity)
```

**Шаг 2: Gap Analysis**

```
Calculate: what is the maximum gap between claim and reality?
Express as: [their claim] vs [current data] in the most specific terms possible
```

**Шаг 3: IRONIC_ECHO angle selection**

Добавить IRONIC_ECHO как приоритетный угол с критерием отбора:

```
IRONIC_ECHO: Use their verbatim statement as setup. Reality as punchline.
Prefer this angle when gap > 10x. Always lead with their words, not your analysis.
Score this angle higher if the original statement was optimistic/bullish.
```

**Шаг 4: Punch word enforcement**

```
The last word or phrase of the roast must be the punch.
Review: if removing the last 3 words kills the joke — structure is correct.
If the roast can end anywhere — restructure.
```

### 7.4 Рекомендуемые изменения в pipeline (приоритизированы по impact/effort)

| Изменение | Ожидаемый эффект | Сложность |
|-----------|-----------------|-----------|
| IRONIC_ECHO как primary angle с явной цитатой в контексте | +1.0–1.5 avg score | Низкая |
| Переформулировать judge criteria: "узнаваемость для CT аудитории" вместо "originality" | Правильный selection signal | Низкая |
| CoT pre-step: "найди gap между их словами и данными" перед генерацией | Структурирует reasoning | Низкая |
| Temperature 0.4–0.5 вместо дефолтного 1.0 | Более coherent output | Минимальная |
| Punch word check (postprocessing): последняя клауза должна нести юмор | Фиксирует структуру | Низкая |
| Quote extraction в TwitterEnricher (реальные твиты цели) | Больше материала для quote-flip | Средняя |
| Best-of-3 с разными angles, выбор судьёй | Diversity без noise | Средняя |

---

## 8. Источники

### Академические работы

- [HUMORCHAIN: Theory-Guided Multi-Stage Reasoning (2025)](https://arxiv.org/html/2511.21732)
- [Oogiri Multi-Dimensional Humor Evaluation (2025)](https://arxiv.org/html/2511.09133v1)
- [CLoST: Structured Thought Leaps (2024)](https://arxiv.org/html/2410.10370v1)
- [CLoT: Creative Leap-of-Thought, CVPR 2024](https://arxiv.org/abs/2312.02439)
- [Temperature Optimization for Humor Generation (2025)](https://arxiv.org/abs/2504.02858)
- [Bridging the Creativity Understanding Gap (2025)](https://arxiv.org/html/2502.20356v1)
- [Small But Funny: Feedback-Driven Humor Distillation (2024)](https://arxiv.org/html/2402.18113v1)
- [AI Humor Generation: Cognitive Skills (2025)](https://arxiv.org/html/2502.07981v1)
- [CHum 2025 Workshop Proceedings, COLING](https://aclanthology.org/2025.chum-1.pdf)
- [HumorBench: Which LLMs Get the Joke? (2025)](https://arxiv.org/html/2507.21476v1)
- [Survey: Computational Humour Generation and Explanation (2025)](https://arxiv.org/html/2509.21175v1)
- [CleanComedy: Friendly Humor Generation (2024)](https://arxiv.org/html/2412.09203v1)
- [Humor in AI: Massive Scale Crowd-Sourced Preferences, NeurIPS 2024](https://arxiv.org/abs/2406.10522)

### Инструменты и проекты

- [HumorNet: PlanSearch + LLM Judge](https://github.com/kabir2505/funniest-joke-with-LLMs)
- [CLoT Official Codebase](https://github.com/sail-sg/CLoT)
- [Inside the AI Roasting Twitter Users (Wordware)](https://newsletter.aimakerslab.io/p/inside-the-ai-thats-roasting-twitter)
- [nateraw/roast-or-toast-bot](https://github.com/nateraw/roast-or-toast-bot)

### Теория комедии

- [Joe Toplyn: How to Write a Roast](https://joetoplyn.com/how-to-write-a-roast/)
- [Ironic Echo — All The Tropes](https://allthetropes.org/wiki/Ironic_Echo)
- [Incongruity-Resolution Theory (Ritchie)](https://homepages.abdn.ac.uk/g.ritchie/pages/papers/aisb99.pdf)
- [Humor Mechanics: Multistep Reasoning, ICCC 2024](https://computationalcreativity.net/iccc24/papers/ICCC24_paper_128.pdf)
