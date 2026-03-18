# Prompt Optimization & Iterative Quality Improvement for AI Content Bots

Research date: 2026-03-18. Covers practical approaches for a small team using Claude Sonnet API with Telegram as a feedback interface.

---

## Краткие выводы

Для команды с Telegram-интерфейсом и Claude Sonnet API оптимальная стратегия:

1. **Немедленно:** Thumbs up/down через inline keyboard + SQLite-хранилище оценок
2. **Через 50 примеров:** DSPy BootstrapFewShot для автоматизации few-shot отбора
3. **Через 200+ примеров:** DSPy MIPROv2 для полной оптимизации инструкций
4. **Параллельно:** ELO pairwise voting для субъективного контента типа roast
5. **Не нужно:** Fine-tuning, RLHF с reward model, Constitutional AI — избыточно для текущего масштаба

---

## 1. Reactive Prompt Tuning (RLHF-Lite)

### Как работает на практике

Не требует reward model или fine-tuning. Суть: собирать оценки → фильтровать примеры → использовать как few-shot или для оптимизации промпта через LLM-in-the-loop.

**Минимальная реализация:**
1. Каждый сгенерированный output сохраняется с `trace_id` в БД
2. Пользователь ставит оценку → она записывается к `trace_id`
3. Раз в N примеров (или по расписанию): фильтруем high-rated outputs → используем как few-shot examples в системном промпте
4. Промпт обновляется вручную или через meta-prompting (LLM предлагает улучшенный промпт на основе примеров провалов)

**Feedback loop через Telegram:**
```
[Бот постит roast]
[Inline keyboard: 👍 Огонь | 👎 Слабо | 🔥 Шедевр]
[callback_data: rate:trace_id:value]
[Backend: INSERT INTO ratings (trace_id, score, ts)]
```

Инструменты: **Langfuse** ([docs](https://langfuse.com/docs/scores/user-feedback)) предоставляет готовый SDK — можно логировать traces и scores в одну строку. Для малой команды достаточно своего SQLite.

### Плюсы/минусы для Telegram-бота

| | |
|---|---|
| + | Не нужен fine-tunable model — работает с любым API |
| + | Минимальная реализация за 1–2 дня |
| + | Накапливает датасет, который позже используется в DSPy |
| - | Низкий response rate: только недовольные нажимают. Ожидать 10–20% охвата |
| - | Субъективность оценок — нужна консистентность (один-два рейтера) |
| - | Ручное обновление промпта пока данных мало (<50 примеров) |

### Implementation complexity: Low (1–3 дня)

Работает с API-only LLMs: **да, полностью**.

---

## 2. A/B Testing Prompt Variations

### Как работает на практике

**Canary deployment pattern:**
- Промпт A (control) → 90% трафика
- Промпт B (variant) → 10% трафика
- Один пользователь всегда видит одну версию (sticky sessions по `user_id`)
- Метрика: средний рейтинг / engagement rate / процент 👎

**Тулинг:**
- [Braintrust](https://www.braintrust.dev/articles/ab-testing-llm-prompts) — offline A/B на датасете перед деплоем, CI/CD gates
- [Langfuse prompt management + A/B](https://langfuse.com/docs/prompt-management/features/a-b-testing) — встроенный routing по версиям промпта
- DIY: feature flag в Redis/env + логирование в PostgreSQL

**Offline-first подход (дешевле):**
Перед деплоем запускаем оба промпта на 20–50 репрезентативных примерах, оцениваем LLM-as-judge. Деплоим победителя без live A/B.

### Плюсы/минусы для Telegram-бота

| | |
|---|---|
| + | Контролируемое сравнение без гаданий |
| + | Langfuse делает routing в 5 строк кода |
| + | Offline A/B стоит ~$0.5–2 на 50 примеров |
| - | Нужен статистически значимый объём: минимум 50–100 оценок на вариант |
| - | Риск inconsistent UX если пользователь видит разные стили |
| - | Latency differences могут влиять на восприятие |

**Важно:** тестировать одну переменную за раз. Нельзя менять одновременно тон + структуру.

### Implementation complexity: Medium (3–5 дней с Langfuse, 1–2 дня DIY)

Работает с API-only LLMs: **да**.

---

## 3. Constitutional AI / RLAIF для контент-ботов

### Как работает на практике

Полный Constitutional AI ([Anthropic, 2022](https://arxiv.org/abs/2212.08073)) требует fine-tuning — недоступен с API.

**Адаптация без fine-tuning (практически реализуемая):**

**Self-critique loop:**
```
1. Claude генерирует roast
2. Тот же Claude (или отдельный call) оценивает по чеклисту:
   - "Достаточно ли специфично про проект?"
   - "Есть ли конкретная техническая уязвимость?"
   - "Тон соответствует $BEEF personality?"
3. Если оценка ниже порога → регенерация с critique как контекст
4. Max 2–3 итерации
```

**LLM-as-judge для автоматической фильтрации:**
```python
judge_prompt = """
Rate this roast 1-10 for:
- Specificity (mentions real project details)
- Humor (genuinely funny, not generic)
- $BEEF voice (aggressive but insightful)
Output: {"score": int, "weaknesses": [...]}
"""
```

Только выходы с score >= 7 публикуются. Остальные отбрасываются или регенерируются.

Это примерно то, что делает [RLAIF self-taught evaluator](https://rlhfbook.com/c/13-cai) — но без изменения весов модели.

### Плюсы/минусы для Telegram-бота

| | |
|---|---|
| + | Работает с любым API, нет данных не нужно |
| + | Немедленный результат — фильтрует мусор до публикации |
| + | Конституция (чеклист) легко редактируется командой |
| - | +50–100% к стоимости API (доп. calls на critique) |
| - | Судья не идеален — иногда пропускает плохие выходы |
| - | Не улучшает промпт итеративно — только фильтрует |

### Implementation complexity: Low-Medium (2–4 дня)

Работает с API-only LLMs: **да**.

---

## 4. DSPy / Automated Prompt Optimization

### Как работает на практике

[DSPy](https://github.com/stanfordnlp/dspy) — фреймворк Stanford для программирования (не промптинга) LLM. Ключевая концепция: вместо ручного написания промпта, описываешь input/output signature и метрику качества — фреймворк сам оптимизирует промпт.

**Три основных оптимайзера:**

| Оптимайзер | Мин. данных | Стоимость | Что оптимизирует |
|---|---|---|---|
| **BootstrapFewShot** | ~10 примеров | $2, ~10 мин | Few-shot примеры (отбор лучших) |
| **COPRO** | ~20–30 | $5–15 | Только инструкции (coordinate ascent) |
| **MIPROv2** | 50–200+ | $2–20 | Инструкции + few-shot jointly, Bayesian opt |

**Пример с content generation (не только классификация):**
```python
import dspy

class RoastSignature(dspy.Signature):
    """Generate a crypto project roast in $BEEF style."""
    project_info: str = dspy.InputField(desc="Project name, chain, TVL, narrative")
    roast: str = dspy.OutputField(desc="Savage but insightful roast tweet, max 280 chars")

roast_module = dspy.Predict(RoastSignature)

# Метрика качества (можно LLM-as-judge)
def roast_quality(example, prediction, trace=None):
    judge = dspy.Predict("roast -> score: int, reason: str")
    result = judge(roast=prediction.roast)
    return int(result.score) >= 7

# Оптимизация
optimizer = dspy.BootstrapFewShot(metric=roast_quality)
optimized = optimizer.compile(roast_module, trainset=your_examples)
```

**Практические результаты:** в задачах классификации — рост с 35% до 78% точности. Для content generation метрика субъективнее, но улучшения задокументированы ([Langchain blog](https://blog.langchain.com/exploring-prompt-optimization/): up to 200% improvement в domain-expertise задачах).

**Ключевое ограничение:** нужны примеры с ground truth — либо human-rated, либо LLM-судья с чёткими критериями.

### Плюсы/минусы для Telegram-бота

| | |
|---|---|
| + | Полностью API-based, не нужен доступ к весам модели |
| + | BootstrapFewShot работает с 10 примерами — можно начать быстро |
| + | Автоматически перебирает комбинации — лучше ручного перебора |
| + | Воспроизводимо и версионируемо (промпт — это артефакт) |
| - | Требует написания кода (DSPy не zero-config) |
| - | Метрика должна быть чёткой: subjectivity = менее надёжная оптимизация |
| - | MIPROv2 с 200+ примерами — нужно сначала накопить данные |

### Implementation complexity: Medium (3–7 дней для рабочей интеграции)

Работает с API-only LLMs: **да, основной use case**.

Конфигурация для Claude:
```python
lm = dspy.LM('anthropic/claude-sonnet-4-5', api_key=os.environ['ANTHROPIC_API_KEY'])
dspy.configure(lm=lm)
```

---

## 5. Few-Shot Example Curation (Golden Dataset)

### Как работает на практике

**"Golden dataset"** — кураторский набор примеров (input → ideal output), который:
- Служит few-shot examples в промпте (3–7 штук)
- Используется как тренировочный набор для DSPy
- Является regression benchmark при изменении промпта

**Workflow:**
```
Накапливаем rated outputs → Фильтруем score >= 8 → Дедупликация
→ Ручной review (команда) → Добавляем в golden set
→ Periodic review (раз в неделю): удаляем устаревшие
```

**AuPair approach** ([Towards Data Science](https://towardsdatascience.com/finding-golden-examples-a-smarter-approach-to-in-context-learning/)): строим большой датасет пар → greedy selection лучших комбинаций по валидационной метрике. Не просто "хорошие примеры" — а примеры, которые в комбинации дают лучший результат.

**Практические параметры:**
- Стартовый набор: 10–20 примеров (достаточно для начала)
- Оптимальный: 50–100 для инструкции + 20 для few-shot секции
- Обновление: при значимом изменении задачи или каждые 2–4 недели

**Отбор few-shot для промпта:**
Не берём просто топ-N по рейтингу. Выбираем примеры, покрывающие разные типы проектов (DeFi, NFT, L2), разные стили roast, edge cases.

### Плюсы/минусы для Telegram-бота

| | |
|---|---|
| + | Максимальное влияние на качество при минимальных изменениях — просто меняем few-shot секцию промпта |
| + | Прозрачно и понятно — не black box |
| + | Работает с любым API, любой моделью |
| - | Требует ручного кураторства — нельзя автоматизировать полностью |
| - | "Dataset drift": примеры устаревают с изменением рынка/культуры |
| - | Контекстное окно ограничивает количество few-shot примеров |

### Implementation complexity: Low (1–2 дня для инфраструктуры, ongoing curation)

Работает с API-only LLMs: **да**.

---

## 6. Feedback UI в Telegram: Best Practices

### Архитектура inline keyboard для rating

```python
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

def rating_keyboard(trace_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("🔥 Огонь", callback_data=f"rate:{trace_id}:5"),
        InlineKeyboardButton("👍 Норм", callback_data=f"rate:{trace_id}:3"),
        InlineKeyboardButton("👎 Слабо", callback_data=f"rate:{trace_id}:1"),
    ]])

# После нажатия — редактируем сообщение (не слать новое):
await query.edit_message_reply_markup(reply_markup=None)
await query.answer("Спасибо за оценку!")
```

**Паттерны UX:**
- Максимум 3 кнопки — когнитивная нагрузка растёт нелинейно
- Убирать клавиатуру после голосования (edit_message_reply_markup)
- После 👎 — опциональный followup: "Что не так? [Слишком общо] [Не смешно] [Неточно]"
- Не просить оценивать каждый пост — только случайная выборка 20–30%

**Хранение:**
```sql
CREATE TABLE generations (
    trace_id TEXT PRIMARY KEY,
    prompt_version TEXT,
    input JSON,
    output TEXT,
    created_at TIMESTAMP
);
CREATE TABLE ratings (
    id INTEGER PRIMARY KEY,
    trace_id TEXT REFERENCES generations,
    score INTEGER,  -- 1, 3, 5 или ELO delta
    rater TEXT,     -- user_id или 'auto_judge'
    created_at TIMESTAMP
);
```

**Инструменты:** [Langfuse](https://langfuse.com/docs/scores/user-feedback) предоставляет hosted трекинг traces + scores. Минус — внешний сервис. DIY на SQLite + собственный дашборд = полный контроль.

---

## 7. ELO Rating для контент-вариантов

### Как работает

ELO — система попарных сравнений. Вместо "хороший/плохой" спрашиваем "какой из двух roast лучше?" Результат — числовой рейтинг каждого варианта/промпта.

**Алгоритм:**
```python
from multielo import MultiElo

def update_elo(winner_rating: float, loser_rating: float, k: int = 32) -> tuple:
    expected_winner = 1 / (1 + 10 ** ((loser_rating - winner_rating) / 400))
    new_winner = winner_rating + k * (1 - expected_winner)
    new_loser = loser_rating + k * (0 - (1 - expected_winner))
    return new_winner, new_loser
```

**Base rating:** 1500. K-factor: 32 для начального периода (быстрая сходимость), 16 после 30+ матчей.

**Применение для $BEEF:**
- Два варианта roast одного проекта → показываем команде side-by-side → они выбирают лучший
- Telegram inline: "Какой roast круче? [Вариант A] [Вариант B]"
- Промпт, генерирующий победителей → получает более высокий ELO → используется чаще

**Сходимость:** после ~6 сравнений появляются паттерны. Для надёжного ранжирования нужно 20–50 матчей на вариант ([Portkey](https://portkey.ai/blog/comparing-llm-outputs-with-elo-ratings/)).

### Плюсы/минусы

| | |
|---|---|
| + | Отлично работает для субъективного контента — roast сложно оценить абсолютно |
| + | Не требует обучения рейтеров — выбор из двух интуитивен |
| + | Автоматически адаптируется к изменению вкусов |
| - | Нужен интерфейс для попарного сравнения (дополнительная разработка) |
| - | Накопление достаточного числа сравнений требует времени |
| - | Transitivity нарушается: A > B, B > C не гарантирует A > C для creative content |

**Implementation complexity: Low-Medium** (алгоритм простой, UI — 1 день).

---

## 8. Как реальные crypto Twitter боты итерируют качество

На основе анализа публичных данных по [AIXBT](https://www.coindesk.com/markets/2024/12/30/ai-agents-capture-attention-as-ai-xbt-ai16z-and-virtuals-surge), [Truth Terminal](https://www.bankless.com/read/the-15-most-influential-ai-agents-on-twitte5), и [ElizaOS](https://github.com/elizaOS/eliza):

**Реальная картина:** публично задокументированных систем качества нет. Большинство агентов работают по принципу "выпустить и посмотреть" — character файлы задают личность, без автоматической итерации.

**Что реально делают:**
- ElizaOS: character.json с `lore`, `style`, `adjectives` — статичная конфигурация, ручное редактирование
- AIXBT: закрытая система, маркетинг вокруг "market intelligence" но не quality iteration
- Truth Terminal: органическая эволюция через взаимодействие (не система)

**Вывод:** рынок не решил эту задачу. Систематическая итерация качества — конкурентное преимущество, а не стандарт. Команды либо доверяют промпту, либо итерируют вручную.

---

## 9. Рекомендованный стек для $BEEF

### Фаза 1: Soft-launch (день 1–14)

**Цель:** накопить первые 50–100 rated examples.

```
Генерация roast → Langfuse trace → Публикация в Telegram канал
↓
Inline keyboard: 🔥 Шедевр (5) | 👍 Норм (3) | 👎 Слабо (1)
↓
Ratings → SQLite / Langfuse
↓
Ручной review раз в 3 дня: лучшие → golden_examples.json
↓
Обновление few-shot секции промпта вручную
```

**Стоимость:** $0 дополнительно (только API calls на генерацию)
**Команда:** 15–30 минут в день на review

### Фаза 2: После 50 примеров

```
Golden examples → DSPy BootstrapFewShot
↓
Автоматический отбор best few-shot комбинации
↓
LLM-as-judge (автоматическая оценка) параллельно с human ratings
↓
Offline A/B: тестируем новый промпт vs текущий на датасете перед деплоем
```

**Стоимость:** $2–5 за оптимизационный run
**Команда:** 2–3 часа на настройку DSPy pipeline

### Фаза 3: После 200 примеров

```
MIPROv2 full optimization: инструкции + few-shot jointly
↓
ELO pairwise comparison для спорных cases
↓
Self-critique loop перед публикацией (Constitutional-style filter)
```

**Стоимость:** $10–20 за оптимизационный run
**Команда:** semi-automated

---

## Сравнительная таблица

| Подход | Данные (мин) | Стоимость | Сложность | API-only | Эффект |
|---|---|---|---|---|---|
| Thumbs up/down collection | 0 | $0 | Low | Да | Накопление датасета |
| Few-shot curation (ручная) | 10 | $0 | Low | Да | +20–40% субъективное качество |
| LLM self-critique filter | 0 | +50% API cost | Low | Да | Фильтрация мусора pre-publish |
| Offline A/B testing | 20–50 | $1–5/run | Medium | Да | Контролируемое сравнение |
| DSPy BootstrapFewShot | 10 | $2, 10 мин | Medium | Да | Авто-отбор few-shot |
| ELO pairwise voting | 20+ | $0 (human) | Medium | Да | Субъективный рейтинг |
| DSPy MIPROv2 | 200+ | $5–20/run | High | Да | Full instruction optimization |
| RLHF с reward model | 1000+ | High | Very High | Нет | Только с fine-tunable models |
| Constitutional AI (full) | 1000+ | Very High | Very High | Нет | Только с fine-tunable models |

---

## Источники

- [DSPy documentation — Optimizers](https://dspy.ai/learn/optimization/optimizers/) (доступ 2026-03-18)
- [DSPy MIPROv2](https://dspy.ai/api/optimizers/MIPROv2/) (доступ 2026-03-18)
- [Pipelines & Prompt Optimization with DSPy — dbreunig.com](https://www.dbreunig.com/2024/12/12/pipelines-prompt-optimization-with-dspy.html) (доступ 2026-03-18)
- [Braintrust: A/B testing for LLM prompts](https://www.braintrust.dev/articles/ab-testing-llm-prompts) (доступ 2026-03-18)
- [Traceloop: Definitive Guide to A/B Testing LLMs](https://www.traceloop.com/blog/the-definitive-guide-to-a-b-testing-llm-models-in-production) (доступ 2026-03-18)
- [Langfuse: User Feedback Collection](https://langfuse.com/docs/scores/user-feedback) (доступ 2026-03-18)
- [Langfuse: A/B Testing Prompts](https://langfuse.com/docs/prompt-management/features/a-b-testing) (доступ 2026-03-18)
- [Portkey: ELO Ratings for LLM Outputs](https://portkey.ai/blog/comparing-llm-outputs-with-elo-ratings/) (доступ 2026-03-18)
- [Chatbot Arena: ELO for LLMs — LMSYS](https://lmsys.org/blog/2023-05-03-arena/) (доступ 2026-03-18)
- [Arxiv: Elo Uncovered — Robustness in LLM Evaluation](https://arxiv.org/abs/2311.17295) (доступ 2026-03-18)
- [Anthropic: Constitutional AI](https://arxiv.org/abs/2212.08073) (доступ 2026-03-18)
- [RLHF Book: Constitutional AI chapter](https://rlhfbook.com/c/13-cai) (доступ 2026-03-18)
- [Langchain: Exploring Prompt Optimization](https://blog.langchain.com/exploring-prompt-optimization/) (доступ 2026-03-18)
- [Winder AI: User Feedback in LLM Applications](https://winder.ai/user-feedback-llm-powered-applications/) (доступ 2026-03-18)
- [Towards Data Science: Golden Examples for In-Context Learning](https://towardsdatascience.com/finding-golden-examples-a-smarter-approach-to-in-context-learning/) (доступ 2026-03-18)
- [Getmaxim: Building a Golden Dataset](https://www.getmaxim.ai/articles/building-a-golden-dataset-for-ai-evaluation-a-step-by-step-guide/) (доступ 2026-03-18)
- [Bankless: 15 Most Influential Crypto AI Agents](https://www.bankless.com/read/the-15-most-influential-ai-agents-on-twitte5) (доступ 2026-03-18)
- [ElizaOS GitHub](https://github.com/elizaOS/eliza) (доступ 2026-03-18)
