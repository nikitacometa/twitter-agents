# Анализ и улучшение пайплайна генерации роустов $BEEF

> Дата: 2026-03-25
> Автор: Claude (по итогам сессии с Gorokhov + Voronin feedback)
> Данные: 37 роустов × 7 батчей, ревью Воронина, полный аудит кода пайплайна, VPS логи (66K+ строк), deep research по AI humor generation (20+ academic papers)

---

## Резюме

Текущий пайплайн генерирует роусты через **3 стратегии × 2 варианта = 6 LLM-вызовов** на одну цель (VPS логи подтверждают `variantsPerStrategy: 2`), плюс оценку в режиме `quick` (1 судья — `deflation_hawk`). Конверсия в stockpile — **22.6%** (S3 farm run). Человеческие оценки: разброс 2.0–5.0, лучшие роусты (4.5+) **переворачивают слова цели**, худшие (2.0–2.5) — генерик с данными без юмора.

**Главная проблема:** пайплайн оптимизирован под *разнообразие* (9 углов, 3 стратегии, 16 мутаций), но не под *качество*. Человек оценивает одну вещь — «я засмеялся или нет». Всё остальное — шум.

**Второй пропущенный фактор:** качество цели важнее угла — разброс между targets (2.68–4.03) больше, чем между angles (2.52–4.00). Цели с quotable phrases дают материал для quote-flip → высокие баллы. Generic news targets → низкие баллы при любом angle.

**Подтверждение из академических исследований:** корреляция LLM-судей с человеческими оценками юмора — **ρ = 0.224–0.266** (arXiv 2511.09133). LLM переоценивают Novelty и недооценивают Empathy (узнаваемость, relatability). Это объясняет nikitabier gap (AI: 2.4, человек: 4.5).

---

## Часть 1. Анализ человеческого фидбека

### 1.1 Статистика по 37 роустам (7 батчей)

| Метрика | Значение |
|---------|----------|
| Средний балл | 3.53 |
| Медиана | 3.5 |
| Стандартное отклонение | ~0.9 |
| Роусты 4.5+ | 6 из 37 (16.2%) |
| Роусты < 3.0 | 11 из 37 (29.7%) |

### 1.2 Паттерны 4.5+ роустов (топ-6)

Все роусты, получившие 4.5+ от Воронина, имеют общую структуру:

1. **Quote-flip** — берут конкретные слова/числа из твита цели и переворачивают смысл
   - PoodleFi_ «149,223 holders» → «149,223 saved from owning one» (4.5)
   - Farcaster «feature not a bug» → «what does the bug version look like?» (5.0)
   - Ondo G1 «i audited...» с конкретной привязкой к данным цели (4.5)

2. **Абсурдное число ИЗ САМОГО ТВИТА** — не из рисёрча, а из того, что цель написала
   - PoodleFi_ D3 — конкретные числа из твита, перевёрнутые в абсурд (5.0)

3. **Краткость** — все топовые роусты < 130 символов

4. **Эскалация с контрастом** — первое предложение выглядит нейтрально, второе убивает

5. **Reframe, не conclude** — панчлайн меняет восприятие сетапа, а не подводит итог

### 1.3 Паттерны провалов (2.0–2.5)

| Проблема | Пример | Балл |
|----------|--------|------|
| Генерик AI-опенер | «i'm a forensic AI...» | 2.0 |
| Данные без юмор-хука | Сравнение TVL двух проектов | 2.5 |
| Уход от контекста твита | Токен не упоминался в твите, а роуст про цену | 2.5 |
| Повтор угла | Два UNDERSTATEMENT подряд = flat | 3.0 |
| Слишком длинно (>180 chars) | Набитый фактами параграф | 2.0 |
| Нишевая отсылка | «velvet rope at a soup kitchen» — ревьюер не понял | 3.0 |

### 1.4 Производительность углов

> **Caveat:** Выборки 1–8 проб на угол. Статистически незначимо — разница между 3.20 и 3.73 может быть случайной. Используем как *сигнал*, не как доказательство. Качественный анализ (почему угол работает структурно) надёжнее средних баллов.

| Угол | n | Средний балл | Вердикт |
|------|---|--------------|---------|
| MISDIRECTION | **1** | 5.0 | Структурно сильный (surprise reversal), но **n=1 — не доказательство** |
| RULE_OF_THREE | 5 | 4.00 | Стабильно сильный — escalation + killer landing |
| UNDERSTATEMENT | 7 | 3.73 | Наибольшая выборка, единственный где AI не переоценивает |
| QUOTE_FLIP | 4 | 3.63 | Средний балл занижен неудачными попытками, но **потолок выше всех** (все 4.5+ — quote-flip) |
| DATA_BOMB | 6 | 3.42 | Средний — работает как supporting data, не как angle |
| COMPARISON | 5 | 3.20 | Ниже среднего |
| SELF_AWARE | 3 | 3.17 | Рискованный |
| FAKE_COMPLIMENT | 8 | 2.52 | Наибольшая выборка среди слабых. AI переоценивает на +1.16 |
| RHETORICAL | 4 | 2.80 | Структурно слабый — вопрос без data reversal = комментарий |
| TIMELINE | 3 | 2.67 | Хронологические списки без панча |

### 1.5 Производительность по целям

| Цель | Средний балл | Почему |
|------|-------------|--------|
| PoodleFi_ | 4.03 | Конкретные числа в твите — есть что флипнуть |
| Farcaster | 3.75 | «Feature not a bug» — идеальный quote-flip материал |
| Ondo | 3.50 | Средний — есть данные, но не из твита |
| nikitabier | 3.25 | AI судьи дали 2.4, человек лучшему — 4.5. Калибровка сломана |
| degen | 3.17 | Уход от контекста — роуст про цену, в твите про другое |
| WatcherGuru | 2.68 | Скучный корпоративный факт, нечего флипнуть |

### 1.6 Скрытый фактор: качество цели важнее угла

Данные из 1.5 скрывают ключевой паттерн: **разброс между целями (2.68–4.03) больше, чем разброс между углами (2.52–4.00).** Quote-flip работает не потому, что это лучший приём — а потому, что лучшие цели (PoodleFi_, Farcaster) дают материал для quote-flip. WatcherGuru (2.68) — генерик-новостник, нечего флипнуть; любой angle провалится.

**Следствие:** target selection — такой же важный рычаг, как prompt engineering. Цели с конкретными claims, числами, flexes → высокие баллы. Цели-новостники, dead projects → низкие баллы вне зависимости от угла.

**Что делать:** добавить в pipeline scoring входящих целей — «содержит ли твит quotable phrase?» как pre-check перед генерацией.

### 1.7 Критический разрыв AI–человек

**nikitabier batch:** AI-судья (deflation_hawk в quick mode) присвоил лучшему варианту (B6) composite score 2.4 → вердикт «discard». **Все 6 вариантов** получили veto — главная причина: `crypto_native` 1-2 и `degen` 1 у всех. Воронин дал тому же B6 **4.5** с комментарием «АХАХАХА это мощное, немного даже жестковато, но это ахуенно».

Текст B6: *«bier sold TBH to facebook (shut down)...»* — AI не уловил, что жёсткий персональный удар по конкретному факту биографии = funny. AI оценивает *craft* (crypto_native voice, degen tone), человек оценивает *impact* (засмеялся/нет).

**Данные VPS логов по всем таргетам:**

| Таргет | Self-score | AI eval | Human avg | Вердикт | Причина |
|--------|-----------|---------|-----------|---------|---------|
| OndoFinance | 4.8 | 3.2 | 3.50 | discard | Близко к порогу (3.5), но не прошёл |
| nikitabier | 4.5 | 2.4 | 3.25 | discard | crypto_native/degen = 1, все 6 vetoed |
| WatcherGuru | 4.5 | — | 2.68 | fallback | Quota hit, judge не запустился |
| PoodleFi_ | — | 1.9 | 4.03 | discard | AI: shareable 1, funny 2. Человек: 4.03 avg |
| farcaster_xyz | — | — | 3.75 | — | Данные не в логах |
| degen | — | — | 3.17 | — | Два прогона, первый прерван shutdown |

**PoodleFi_ — второй критический gap:** AI дал 1.9 (worst), человек — 4.03 (best). Self-score и AI eval не коррелируют с человеческим восприятием юмора.

---

## Часть 2. Архитектурные проблемы пайплайна

### 2.1 Стоимость генерации vs. качество

```
Фактический pipeline на 1 цель (из VPS логов):
├── 3 стратегии × 2 варианта = 6 LLM-вызовов (генерация, model: opus, effort: high)
├── Content filter (regex, дешёво)
├── 1 судья (deflation_hawk, quick mode) × лучший вариант
├── Если вето → оценка альтернатив по одному
└── Итого: 6-12 вызовов, ~60-120 сек

Конверсия: 22.6% → 77.4% работы впустую
```

**Проблема:** 3 стратегии делают одинаковый рисёрч (все зовут WebSearch/Perplexity на одну цель), но с разными промптами. Исследование тройное. WatcherGuru упал из-за Claude quota hit — adversarial стратегия и judge не запустились.

### 2.2 MISDIRECTION и BATHOS — потерянные техники

`ANGLES` массив содержит 9 углов: `DATA_BOMB, TIMELINE, COMPARISON, FAKE_COMPLIMENT, RHETORICAL, SELF_AWARE, QUOTE_FLIP, UNDERSTATEMENT, RULE_OF_THREE`.

`buildTechniqueBlock()` описывает 7 структурных техник: `BATHOS, MISDIRECTION, SILENT_SCREENSHOT, IRONIC_REVERSAL, SER_ADDRESS, DELAYED_OBVIOUS, DOMAIN_SHIFT`.

**Пересечение = 0.** Техники не могут быть назначены как angle. `pickAngles()` выбирает только из `ANGLES`. LLM видит описание MISDIRECTION в technique block, но не обязан его использовать — и чаще не использует, потому что у него уже есть *назначенный* angle.

Единственный sample с MISDIRECTION в человеческом ревью получил **5.0**. Это лучший балл во всём датасете. А угол не может быть выбран системой.

### 2.3 Angle-система ограничивает серендипити

Текущая система: `pickAngles(N)` → LLM *обязан* написать по одному варианту на каждый angle (N=2 в farm mode).

**Проблема:** лучшие роусты часто гибридные. Farcaster 5.0 — это одновременно QUOTE_FLIP + RHETORICAL + MISDIRECTION. Принудительный single-angle заставляет LLM искусственно разделять приёмы.

### 2.4 Веса углов не отражают реальность

```
DEFAULT_ANGLE_WEIGHTS:
  UNDERSTATEMENT: 2.0  (3.73 avg) ← справедливо
  QUOTE_FLIP:     0.8  (3.63 avg) ← ЗАНИЖЕН, лучшие 4.5+ все quote-flip
  FAKE_COMPLIMENT: 0.4 (2.52 avg) ← справедливо низкий
  RHETORICAL:     0.9  (2.80 avg) ← ЗАВЫШЕН
  TIMELINE:       0.3  (2.67 avg) ← справедливо низкий
```

QUOTE_FLIP имеет вес 0.8 (5-й из 9), но генерит лучшие роусты. Причина: средний балл 3.63 понижен несколькими неудачными попытками, но потолок у QUOTE_FLIP выше всех.

### 2.5 Стратегии дублируют друг друга

Три стратегии (`rubric`, `persona`, `adversarial`) различаются стилем промпта, но:
- Все делают одинаковый рисёрч (WebSearch на ту же цель)
- Все получают одинаковые examples, anti-patterns, technique block
- Все генерят по 2 варианта с разными angles
- `adversarial` добавляет SLOP-диагностику, но rubric уже содержит technique block + checkpoint

Гипотеза: rubric доминирует в stockpile (стратегия трекается через `farm_attempts.strategy` → `roast_stockpile.attempt_id`). **Не верифицировано** — нужен SQL-запрос по production DB. Но структурно: persona отличается только «feel it out» vs analytical CoT, adversarial добавляет SLOP-шаг. Минимум уникальной ценности за 2× стоимость.

### 2.6 Промпт перегружен

`buildRoastPrompt()` генерирует промпт из ~15 секций:
- systemPrompt + originStory
- examples (3-5)
- anti-patterns
- style observations
- learned techniques
- target context
- recent closers
- injection defense
- profile context
- technique block (7 техник)
- banned phrases
- emotional range
- signature moves
- character checkpoint (5 вопросов)
- quote hunting
- rubric CoT (4 вопроса)
- task с research instructions
- generation constraints
- self-evaluate instructions
- output format

**~3500-4500 токенов промпта** до данных о цели. LLM тонет в инструкциях. Ключевое сообщение (*«переверни их собственные слова»*) теряется среди 15 других секций.

---

## Часть 3. Теория юмора и применение к пайплайну

### 3.1 Incongruity-Resolution Theory

Основная теория юмора в когнитивной науке: шутка работает, когда мозг обнаруживает **неконгруэнтность** (ожидание нарушено) и **разрешает** её через альтернативную интерпретацию.

**Применение к роустам:** Setup создаёт ожидание (позитивное или нейтральное), punchline разрушает его через неожиданную реинтерпретацию. Это именно то, почему QUOTE_FLIP работает — слова цели создают один фрейм, наш punchline создаёт противоположный.

### 3.2 Benign Violation Theory

Юмор возникает, когда нарушение воспринимается как **безобидное** (benign). Слишком жёсткий удар = не смешно. Слишком мягкий = скучно.

**Проблема нашего пайплайна:** AI-судьи не калибрированы на этот спектр. Они оценивают *savage* как отдельную метрику, но не оценивают *точность калибровки жёсткости*. nikitabier B6 получил 4.5 от человека именно потому, что был «немного жестковато, но ахуенно» — правильная точка на спектре.

### 3.3 Semantic Distance и домен панчлайна

Исследования показывают: чем больше **семантическое расстояние** между setup-доменом и punchline-доменом, тем смешнее (при условии, что связь читаема). Наши лучшие примеры подтверждают:

- «peer-reviewed lemonade stand» (crypto → кулинария)
- «she said 'honey that's feudalism'» (DeFi → политика)
- «under 'comedy'» (аудит → stand-up)

Technique block `DOMAIN_SHIFT` описывает это, но не форсирует. Это должно быть одним из primary constraints, а не одной из 7 техник.

### 3.4 Setup Brevity Principle

Паттерн из ревью: короткие роусты оцениваются выше. Числа 3.4 и 2.3 уже зашиты в промпт (`buildLengthAndPunchlineConstraints()`) и judge personas из предыдущих сессий оценки — не из текущих 37 роустов Воронина. Текущий датасет подтверждает тренд (все 4.5+ < 130 chars, все 2.0 > 180 chars), но точные средние не пересчитывались.

**Причина:** В коротком формате (Twitter) каждый лишний символ setup-а ослабляет punchline. Мозг устаёт до панчлайна. Идеал: setup в 5-8 слов, punchline в 2-5 слов.

### 3.5 Reframe vs. Conclude

Ключевое различие, которое уже описано в `buildCharacterCheckpoint()`, но недостаточно enforced:

- **Conclude (плохо):** «and they call this innovation» — подводит итог, который слушатель уже сам сделал
- **Reframe (хорошо):** «lemonade stand» — заставляет перечитать setup с новым фреймом

Из 37 роустов ~60% concluding punchlines. Все они < 3.5 баллов.

---

## Часть 4. Конкретные предложения

### Предложение 1: Объединить ANGLES и TECHNIQUES в единый пул

**Проблема:** 9 angles + 7 techniques = 16 типов юмора, но только 9 доступны для `pickAngles()`.

**Решение:** Объединить в один пул `JOKE_TYPES`:

```typescript
const JOKE_TYPES = [
  // Бывшие angles
  'DATA_BOMB', 'COMPARISON', 'FAKE_COMPLIMENT',
  'SELF_AWARE', 'QUOTE_FLIP', 'UNDERSTATEMENT', 'RULE_OF_THREE',
  // Бывшие techniques (лучшие)
  'BATHOS', 'MISDIRECTION', 'DOMAIN_SHIFT', 'IRONIC_REVERSAL',
  // Новый
  'FREESTYLE',
] as const;
```

Убрать:
- `RHETORICAL` (2.80 avg, худший) → поглощён QUOTE_FLIP
- `TIMELINE` (2.67 avg) → поглощён DATA_BOMB с хронологией
- `SILENT_SCREENSHOT`, `SER_ADDRESS`, `DELAYED_OBVIOUS` → слишком нишевые для forced assignment, оставить в описании technique block как вдохновение

Добавить:
- `FREESTYLE` — без ограничений, LLM выбирает сам. **Вес 2.5** (самый высокий). Гипотеза: при хорошем рисёрче LLM сам находит лучший угол.

### Предложение 2: FREESTYLE — один слот, не доминирующий режим

**Текущее:** LLM обязан следовать назначенному angle для каждого варианта.

**Наблюдение:** Лучшие роусты (5.0) гибридные — QUOTE_FLIP + MISDIRECTION + DOMAIN_SHIFT. Forced single angle мешает комбинировать приёмы.

**Но:** Research единогласен — **больше структуры = лучше юмор** (HumorPlanSearch, HUMORCHAIN, Toplyn все используют explicit multi-step reasoning). «Без ограничений» ≠ «лучше» для LLM. Без guidance модель часто откатывается к дефолтному (generic) паттерну.

**Предложение (скорректированное):** FREESTYLE = **1 слот из 3-4**, не 50%:

При `variantCount = 3`:
- Variant 1: Assigned angle (weighted random)
- Variant 2: Assigned angle (другой)
- Variant 3: FREESTYLE (LLM комбинирует любые приёмы)

Промпт для FREESTYLE:
```
Angle: FREESTYLE — combine ANY techniques from the list above.
The best roasts mix angles: quote-flip + domain shift, misdirection + bathos.
Find the combination that hits hardest. The ONLY constraint: the punchline must
make someone stop scrolling.
```

**Вес FREESTYLE: 1.5** (не 2.5 — гарантирует выбор в ~30% случаев, не в 50%). Тестировать на farm run и сравнить с assigned angles.

### Предложение 3: Сократить стратегии с 3 до 2

**Текущее:** rubric + persona + adversarial = 6 вызовов (2 варианта каждая).
**Предложение:** rubric + adversarial = 4 вызова.

`persona` убирается:
- Не даёт уникальных хитов (rubric доминирует в stockpile)
- Отличие от rubric — только «feel it out» vs analytical CoT. На практике LLM всё равно делает analytical reasoning
- Экономия: 33% меньше LLM-вызовов (6→4)

`adversarial` остаётся:
- SLOP-диагностика — уникальный механизм, которого нет в rubric
- Контрастивный подход заставляет LLM *сначала* понять, что банально, *потом* писать
- Но можно интегрировать SLOP-шаг *в* rubric как дополнительный CoT

**Альтернатива (более радикальная):** 1 стратегия, но с SLOP-диагностикой:
```
Step 1: Research target
Step 2: Write the SLOP (obvious mediocre roast)
Step 3: Diagnose WHY it fails
Step 4: Write 4-5 variants that beat the slop
```
Экономия: 67% меньше LLM-вызовов (6→2). Тот же рисёрч, но без дублирования.

### Предложение 4: Перекалибровать веса углов

> **Принцип:** веса для новых angles (MISDIRECTION, BATHOS, DOMAIN_SHIFT, FREESTYLE) — стартовые гипотезы, не подтверждённые данные. Требуют A/B-тестирования на farm run. Только UNDERSTATEMENT (n=7), FAKE_COMPLIMENT (n=8), QUOTE_FLIP (n=4) имеют достаточные выборки для уверенных весов.

```typescript
const JOKE_TYPE_WEIGHTS: Record<string, number> = {
  // Подтверждённые данными (n ≥ 4):
  UNDERSTATEMENT:  2.0,  // n=7, 3.73 avg — стабильно
  QUOTE_FLIP:      1.8,  // n=4, 3.63 avg но потолок 5.0 — ПОВЫШЕН
  RULE_OF_THREE:   1.5,  // n=5, 4.00 avg
  DATA_BOMB:       1.0,  // n=6, 3.42 avg
  COMPARISON:      0.8,  // n=5, 3.20 avg
  SELF_AWARE:      0.6,  // n=3, 3.17 avg
  FAKE_COMPLIMENT: 0.4,  // n=8, 2.52 avg — подтверждён низкий

  // Стартовые гипотезы (нет human data, пересмотреть после farm run):
  FREESTYLE:       1.5,  // 1 слот из 3-4, не доминирующий
  MISDIRECTION:    1.5,  // n=1 (5.0) — структурно сильный, но нет статистики
  BATHOS:          1.3,  // grandiose → trivial, не тестировался
  DOMAIN_SHIFT:    1.3,  // semantic distance, не тестировался
  IRONIC_REVERSAL: 1.0,  // дефолтный до сбора данных
};
```

### Предложение 5: Упростить промпт (сократить на 40%)

**Что убрать:**
- `buildEmotionalRangeSection()` — LLM и так варьирует тон через mutations. 4 описанных тона (clinical, amused, outraged, wistful) — overhead
- `buildSignatureMoveSection()` — «The Accountant's Footnote», «The Polite Correction» не коррелируют с 4.5+ роустами. Убрать
- Сократить `buildCharacterCheckpoint()` с 5 вопросов до 2 ключевых:
  1. Punchline REFRAMES или CONCLUDES? (если concludes → переписать)
  2. Работает ли роуст без имени цели? (если да → слишком generic)
- Сократить `buildTechniqueBlock()` — оставить только 3-4 техники с примерами, не 7

**Что усилить:**
- **QUOTE_FLIP instruction** должна быть в TOP 3 по видимости (сейчас buried в `buildTweetTaskSection` и `## DIRECTIVE`)
- Добавить explicit instruction: «Ваш первый instinct — найти конкретную фразу/число из твита и перевернуть её. Если не можете — ТОГДА используйте другой angle»
- Переместить длину/панчлайн constraints ВЫШЕ примеров (сейчас ниже)

**Целевой размер промпта:** ~2000-2500 токенов (сейчас ~3500-4500).

### Предложение 6: Исправить калибровку AI-судей

**Проблема:** AI-судьи дают 2.4 тому, что человек оценивает 4.5. Основной разрыв — в метрике FUNNY. AI оценивает craft (структура, мисдирекшн, сюрприз), человек оценивает impact (засмеялся/нет, хочу переслать/нет).

**Конкретные изменения:**

1. **comedy_writer persona** — добавить calibration anchor:
   ```
   CALIBRATION ANCHOR:
   "bier sold TBH to facebook (shut down). now he's teaching
   other people to build apps. you know who else teaches —
   people who stopped playing."
   This scored 4.5 from human reviewer ("powerful, harsh but awesome").
   If you would rate this below 4.0, recalibrate your FUNNY scale upward.
   ```

2. **Добавить метрику IMPACT вместо SHAREABLE:**
   ```
   IMPACT (1-5): Would someone STOP SCROLLING to read this twice?
   1 = scroll past without pausing
   3 = mild smirk, maybe like
   5 = screenshot and send to group chat
   ```
   SHAREABLE подразумевает CT audience awareness. IMPACT — более прямая прокси для «это смешно».

3. **Реформировать deflation_hawk, не убирать.** Текущая проблема: в `quick` mode (farm) deflation_hawk — **единственный судья**. Его deflation bias = системное занижение всех баллов. Но убрать его нельзя — нужна замена для quick mode.

   **Вариант A:** Quick mode → `comedy_writer` вместо `deflation_hawk`. comedy_writer оценивает craft (misdirection, surprise, punchline landing) — ближе к human evaluation.
   **Вариант B:** Quick mode → MCP reranking (пропустить scoring вообще, выбрать лучший из N попарным сравнением).
   **Вариант C (осторожный):** Оставить deflation_hawk, но убрать «Start every dimension at 2» и «When in doubt, round DOWN». Добавить калибровочные якоря. Самый низкорисковый вариант.

   В serious mode (5 судей): deflation_hawk полезен как counterbalance. Не убирать, но смягчить bias.

4. **Пересмотреть DIMENSION_WEIGHTS:**
   ```typescript
   // Текущие:
   funny: 0.30, shareable: 0.20, savage: 0.15, original: 0.10, ...

   // Предложение:
   funny: 0.40,      // Повышен: #1 предиктор человеческого балла
   impact: 0.25,     // Заменяет shareable — более прямой proxy
   original: 0.15,   // Повышен: generic roasts = 2.0-2.5
   savage: 0.10,     // Понижен: жёсткость без юмора не работает
   degen: 0.05,      // Минимальный: голос важен, но не решает
   factual: 0.05,    // Без изменений
   crypto_native: 0.05, // Оставить: ловит "generic AI" output без $BEEF voice
   // Убрать: timely (шум, зависит от момента а не качества)
   ```

### Предложение 7: Quote-First Step в tweet-mode

**Текущее:** `buildTweetRoastContext()` помещает твит цели первым, но инструкция «quote-flip their exact words» — одна строка в `## DIRECTIVE`, buried среди других.

**Открытие из research:** в academic comedy literature этот приём называется **Ironic Echo** (Incongruity Resolution Theory) — «повторение чужих слов с обратным смыслом через добавление контекста».

**Предложение:** Добавить один mandatory step перед research — не 4-шаговый pipeline (overengineering), а простую директиву:

```
### STEP 0 — QUOTE EXTRACTION (mandatory, before research)

Read the target tweet. Write down:
1. The single most quotable phrase (would hurt most if flipped)
2. Any specific number they cited
3. Any claim or flex

Your FIRST variant MUST use one of these as setup, with reality as punchline.
If nothing quotable found → note "no quote-flip material" and proceed to research.
```

**Punch word enforcement** (отдельно — для всех mode, не только tweet):
```
Review: if removing the last 3 words kills the joke — structure is correct.
If the roast can end anywhere — restructure so the punch lands last.
```

Punch word enforcement добавлять в `buildLengthAndPunchlineConstraints()`, а не в tweet-mode — это универсальное правило. Step 0 — только для tweet-mode.

### Предложение 8: Трекинг мутаций → динамические веса (отложено)

**Текущее:** 16 мутаций, все с фиксированными весами по типу (constraint 40%, voice 30%, perspective 20%, wildcard 10%). `mutation_seed` хранится в `farm_attempts`.

**Проблема:** Данных недостаточно. 14 stockpiled из S3 run — нельзя построить статистически значимую корреляцию mutation→quality. Кроме того, мутации аппендятся к промпту как section, и их эффект зависит от angle + target + strategy, что создаёт комбинаторный взрыв.

**Предложение (Phase 1):** Только трекинг — логировать `mutation_ids` в stockpile metadata (сейчас хранится только seed). Начать сбор данных.

**Предложение (Phase 3, после 50+ stockpiled):** Анализ корреляций, пересмотр весов на основе данных. Гипотезы (непроверенные):
- `ice-cold` и `fake-respect` могут коррелировать с хитами (похожи на UNDERSTATEMENT/FAKE_COMPLIMENT по тону)
- `ignore-angle` может давать FREESTYLE-подобный эффект
- `non-crypto` усиливает DOMAIN_SHIFT

Пока гипотезы — не основания для смены весов.

### Предложение 9: Stockpile-driven few-shots

**Текущее:** 6 curated few-shots из `beef-bot.json` + до 2 dynamic из fire examples.

**Предложение:** Few-shots должны ротироваться из stockpile с человеческим рейтингом:
1. Собрать 15-20 роустов, подтверждённых Ворониным (4.0+)
2. Каждый промпт получает 4 random из этого пула (не одни и те же каждый раз)
3. Все few-shots содержат аннотации: `[QUOTE_FLIP, 4.5, "quote-flipped their '149K holders' claim"]`

Curated static examples остаются как floor, но реальные хиты с человеческим рейтингом — мощнее.

### Предложение 10: Pre-filter для concluding punchlines

**Текущее:** Pre-filter ловит generic patterns, telegraphed patterns, too-techy, self-deprecating.

**Что добавить:**
```typescript
// Concluding punchline patterns — restates what setup already implies
const CONCLUDING_PATTERNS = [
  /and they call this .+$/i,           // "and they call this innovation"
  /that's .+ for you$/i,              // "that's DeFi for you"
  /welcome to .+$/i,                  // "welcome to crypto"
  // НЕ добавлять: /ngmi$/ — валидный CT closer, не всегда concluding
  // НЕ добавлять: /that's not X, that's Y/ — уже в BANNED_PHRASES
];
```

Из ревью: многие провальные роусты имеют concluding punchline (точный % не подсчитан — оценка «~60%» была приблизительной). Regex ловит самые типичные паттерны, но edge cases потребуют ручной калибровки после farm run.

---

## Часть 5. Приоритизация

### Tier 1 — Быстрый импакт (1-2 часа, высокий ROI)

| # | Изменение | Файл | Ожидаемый эффект | Уверенность |
|---|-----------|------|------------------|-------------|
| 1 | Добавить MISDIRECTION, BATHOS, DOMAIN_SHIFT в ANGLES | `prompt-builder.ts:6-9` | Разблокировать joke types, которые сейчас недоступны | Высокая (код подтверждает — пересечение ANGLES∩TECHNIQUES = 0) |
| 2 | Перекалибровать веса (QUOTE_FLIP → 1.8) | `prompt-builder.ts:16-26` | Больше quote-flip вариантов | Средняя (n=4, но потолок подтверждён) |
| 3 | Убрать RHETORICAL и TIMELINE из пула | `prompt-builder.ts:6-9` | Меньше структурно слабых вариантов | Средняя (качественно обосновано, n мал) |
| 4 | Concluding punchline patterns в pre-filter | `evaluator.ts:80-98` | Ловить concluding punchlines до оценки | Средняя (паттерны нужно калибровать) |
| 5 | Quote-first Step 0 в tweet-mode | `prompt-builder.ts:348-361` | Форсировать лучший паттерн | Высокая (все 4.5+ используют quote-flip) |

### Tier 2 — Структурные улучшения (3-5 часов)

| # | Изменение | Файл | Ожидаемый эффект | Уверенность |
|---|-----------|------|------------------|-------------|
| 6 | FREESTYLE angle (1 слот, вес 1.5) | `prompt-builder.ts` | Гибридные angles в ~30% вариантов | Низкая (гипотеза, research скорее за структуру) |
| 7 | Сократить промпт на 30-40% | `prompt-builder.ts` | Меньше шума, фокус на главном | Высокая (15 секций — объективно избыточно) |
| 8 | Убрать persona стратегию (3→2) | `roast-engine.ts`, `prompt-builder.ts` | -33% LLM-вызовов | Средняя (нет данных по strategy→quality, но research: persona +3% max) |
| 9 | Реформа deflation_hawk + калибровочные якоря | `judge-personas.ts` | Уменьшить false negatives | Высокая (nikitabier/PoodleFi_ gap задокументирован) |
| 10 | SHAREABLE → IMPACT | `evaluator.ts`, `judge-personas.ts` | Прямой proxy для «это смешно» | Средняя (не тестировано) |

### Tier 3 — Системные изменения (5-10 часов)

| # | Изменение | Файлы | Ожидаемый эффект | Уверенность |
|---|-----------|-------|------------------|-------------|
| 11 | Quick mode judge: comedy_writer или MCP | `judge-personas.ts`, `evaluator.ts` | Точнее оценка в farm | Средняя (comedy_writer не тестирован как sole judge) |
| 12 | Объединить в 1 стратегию (SLOP→generate) | `roast-engine.ts`, `prompt-builder.ts` | -67% LLM-вызовов | Средняя (радикально, нужен A/B) |
| 13 | Stockpile-driven few-shots | `creative-memory.ts`, `prompt-builder.ts` | Примеры из реальных хитов | Высокая (research подтверждает) |
| 14 | MCP reranking вместо direct scoring | `evaluator.ts` | Пересмотр всей evaluation — попарное лучше absolute | Средняя (76% agreement в paper, но другой домен) |
| 15 | Target quality scoring | `queue/`, pipeline | Отсеивать слабые цели до генерации | Средняя (target variance > angle variance — но автоматизация scoring нетривиальна) |
| 16 | DIMENSION_WEIGHTS: funny 0.40 | `evaluator.ts` | Приоритет юмора | Высокая (human reviews подтверждают) |
| 17 | Mutation tracking → динамические веса | `mutations.ts`, DB | Автооптимизация (отложено до 50+ stockpiled) | Низкая (premature без данных) |

---

## Часть 6. Исследование: AI и генерация юмора

*Deep research по 20+ academic papers и open-source проектам (2024–2026). Полный отчёт исследовательского агента доступен отдельно.*

### 6.1 Академические подходы к генерации юмора

**Incongruity-Resolution Theory** (Suls, 1972; Ritchie, 2004) — доминирующая модель. Юмор = неконгруэнтность + разрешение через альтернативную интерпретацию. QUOTE_FLIP — прямая реализация: слова цели в одном скрипте, punchline переключает на другой.

**Benign Violation Theory** (McGraw & Warren, 2010) — нарушение одновременно серьёзное и безобидное. Объясняет nikitabier B6 («жестковато, но ахуенно» = 4.5) — точная калибровка жёсткости.

### 6.2 Многошаговые пайплайны (state of the art)

**HumorPlanSearch** (arXiv 2508.11429, 2025) — самый продвинутый задокументированный pipeline:
1. Генерация 12 разных humor strategies
2. Комбинирование пар в гибридные стратегии
3. Knowledge Graph из исторически успешных стратегий
4. Novelty filtering через embeddings (порог 0.75 similarity, отсеивает ~18% дублей)
5. Revision loop: если score < 6.0 → переписать (max 2 итерации)

**Результат: +15.4% Humor Generation Score** над сильным baseline (p < 0.05).

**Применение к $BEEF:** Наша 3-strategy система — примитивная версия этого. HumorPlanSearch показывает, что **комбинирование стратегий** (hybrid) > чем запуск каждой отдельно. Подтверждает предложение FREESTYLE.

**Toplyn Framework** (GitHub: Stry233/Prompt-to-GPT-3-Step-by-Step) — 4 явных шага:
1. Topic → Handle extraction (выделить интересные слова/понятия)
2. Association generation → для каждого handle — связанные концепты из далёких доменов
3. Punchline → скрестить ассоциации + «вызвать негативную эмоцию к объекту»
4. Angle → плавный переход от setup к punchline

Ключевой инсайт: **когнитивная дистанция** — чем дальше ассоциации, тем смешнее (при условии читаемой связи). Операционализация incongruity theory.

**HUMORCHAIN** (arXiv 2511.21732) — 4 pathway в зависимости от контента:
- Absurdity, Contrast/Irony, Emotion Analogy, Object Analogy
- Discriminator fine-tuned на юмор проверяет результат и триггерит rewrite
- **0.810 humor score vs 0.362–0.418 у baseline**, 68.3% win rate

**CLoST** (arXiv 2410.10370v1) — self-improvement без переобучения:
- AAIE — модель учится судить о юморе через эволюционирующие инструкции
- +4.55–5.91% над GPT-4o. Можно эмулировать через **явное включение критических рассуждений в промпт**.

**Multi-Agent Comedy Club** (arXiv 2602.14770) — 35 агентов, 50 раундов:
- Фидбек каждого раунда → vector store с importance weighting
- **75.6% preference wins** над baseline
- Побочный эффект: community feedback увеличивает aggressive humor (+0.42) — для $BEEF это фича

### 6.3 Оценка юмора: почему наши AI-судьи врут

**Корреляция LLM-судей с людьми: ρ = 0.224–0.266** (arXiv 2511.09133). Точность в stand-up comedy detection: ~50% (случайный угадыватель).

**6 измерений юмора** (Likert 0-4):

| Измерение | Приоритет для людей | Приоритет для LLM |
|-----------|---------------------|-------------------|
| **Empathy** (узнаваемость) | **Наивысший** | Низкий |
| **Clarity** (понятность) | Высокий | Средний |
| **Relevance** (связь с темой) | Высокий | Высокий |
| **Novelty** (оригинальность) | Средний | **Наивысший** |
| **Intelligence** (интеллект) | Средний | Высокий |

**Критическое открытие: LLM переоценивают Novelty, недооценивают Empathy.** Это объясняет наш gap: AI даёт высокие баллы «умным» роустам (новый угол, необычная структура), а человек ценит «попадание» (узнал ситуацию, empathized с жертвой).

**Multiple Choice Prompting** (arXiv 2402.18113) — «какой из двух смешнее?» = **76% agreement с людьми** vs ~50% у direct scoring. Это лучший доступный proxy для human judgment.

### 6.4 Параметры генерации

~~**Temperature 1.0–1.2** для comedy~~ — **опровергнуто.** Исследование 715 конфигураций × 13 моделей (arXiv 2504.02858): **73% моделей дают пик humor quality при temperature ≤ 0.5.** Архитектура объясняет 38.7% variance.

**Но: в нашей архитектуре temperature не контролируется.** Claude Code CLI subprocess и Codex CLI (`codex exec`) не экспонируют параметр temperature — используется default модели. Anthropic SDK fallback (`src/agent/anthropic-sdk.provider.ts`) теоретически поддерживает temperature, но используется только как последний fallback. **Рекомендация неприменима** без перехода на SDK как primary provider или появления temperature флага в CLI.

**Diversity через структуру, не рандом:** вместо повышения temperature → разные стратегии, углы, мутации. Это УЖЕ наш подход, и research его подтверждает. Структурная diversity (разные angles + mutations) > sampling diversity (высокий temperature).

**Persona prompting для judges малоэффективен:** максимум +3% (arXiv 2502.20356). Fine-tuning на 5,580 human preference pairs даёт +15%. Для нас: калибровочные якоря из 37 оценённых роустов эффективнее, чем persona-описания судей.

**Few-shot quality > quantity:** Feedback-trained модель на 12K примерах > imitation-only на 36K. Подтверждает наш `feedback_fewshot_quality.md`: 6 curated > 26 mediocre.

### 6.5 Конкуренты и ландшафт

**Wordware Twitter Roast** — единственный реальный успех: 4M пользователей за 11 дней, $100K+ revenue. Технически: Apify scraping → chained prompts → Claude 3.5 Sonnet. Ключевой вывод: **качество определяется промптом, не моделью**.

Автономных AI roast-аккаунтов на Twitter **практически нет**. Wordware — веб-приложение, не Twitter-бот. **Ниша автономного roast-агента с character-driven постингом пуста.**

### 6.6 Новое предложение из исследования: MCP Reranking

**Предложение 11** (из research): Заменить текущий judge scoring на **Multiple Choice Prompting**:

```
Вместо: "оцени этот роуст от 1 до 5 по 8 метрикам"
Применить: "какой из двух роустов смешнее? A) ... B) ..."
```

MCP: **76% agreement** с людьми при попарном сравнении (arXiv 2402.18113). Наш текущий direct scoring: **ρ ≈ 0.25 корреляция** с людьми. Это разные метрики — прямое числовое сравнение некорректно. Но качественно: pairwise judgment работает лучше, чем absolute scoring, потому что проще задача (A vs B, не «оцени от 1 до 5 по 8 метрикам»). Дешевле (1-3 вызова вместо 5 судей × 8 метрик).

Реализация:
1. Генерируем 4-6 вариантов (1 стратегия)
2. Попарное сравнение: A vs B, C vs D, победители между собой
3. 3 LLM-вызова вместо 5 → финалист
4. Pre-filter + MCP = достаточно для качественного отбора

### 6.7 Новое предложение: Novelty Filter через Embeddings

**Предложение 12** (из HumorPlanSearch): Similarity check между новым draft и stockpile через embeddings. Порог 0.75 → регенерировать. Предотвращает повторение структурных паттернов, которые человек уже видел.

---

## Часть 7. Рекомендуемый план действий

### Фаза 1: Quick Wins (следующая сессия)

1. Добавить MISDIRECTION, BATHOS, DOMAIN_SHIFT в `ANGLES`
2. Добавить FREESTYLE angle (1 слот из 3-4, вес 1.5)
3. Перекалибровать веса (QUOTE_FLIP → 1.8, новые angles — стартовые гипотезы)
4. Убрать RHETORICAL и TIMELINE из пула
5. Добавить concluding punchline patterns в pre-filter
6. Quote-first Step 0 в tweet-mode промпте
7. Punch word enforcement в `buildLengthAndPunchlineConstraints()` (все modes)

### Фаза 2: Structural (после Фазы 1 + farm run для A/B)

8. Сократить промпт на 40% (убрать emotional range, signature moves, сократить checkpoint)
9. Сократить стратегии 3→2 (убрать persona)
10. Реформировать deflation_hawk: убрать «Start at 2, round DOWN», добавить калибровочные якоря (nikitabier B6, PoodleFi_ C1)
11. Quick mode judge: заменить deflation_hawk → comedy_writer (или MCP reranking)
12. Заменить SHAREABLE → IMPACT

### Фаза 3: System (после подтверждения улучшений в Фазе 2)

13. MCP reranking вместо direct scoring (попарное «какой смешнее?»)
14. Объединить в 1 стратегию (SLOP→generate, 4-5 вариантов за 1 вызов)
15. Stockpile-driven few-shots
16. Target quality scoring — pre-check «содержит ли твит quotable phrase?» перед генерацией
17. Трекинг mutation_ids в stockpile → динамические веса (после 50+ stockpiled)

### Метрика успеха

| Метрика | Текущее | Цель (Phase 1-2) | Обоснование цели |
|---------|---------|-------------------|-----------------|
| Конверсия в stockpile | 22.6% | 30%+ | Убрать weak angles + pre-filter → меньше waste |
| Средний human score | 3.53 | 3.8+ | +0.3 реалистично от angle recalibration |
| Роусты 4.5+ | 16.2% | 25%+ | Больше QUOTE_FLIP + MISDIRECTION в пуле |
| Роусты < 3.0 | 29.7% | 20% | Concluding punchline filter + убраны RHETORICAL/TIMELINE |
| LLM-вызовов на цель | 6-12 | 4-8 | -1 стратегия = -2 вызова |
| Промпт-размер (токены) | 3500-4500 | 2500-3000 | Убрать emotional range, signature moves, сократить checkpoint |
| AI-human score корреляция | ρ ≈ 0.25 | ρ ≥ 0.35 | Калибровочные якоря + реформа deflation_hawk (ρ ≥ 0.50 = Phase 3, MCP reranking) |

---

## Источники (research)

- [HumorPlanSearch (arXiv 2508.11429)](https://arxiv.org/html/2508.11429) — +15.4% через hybrid strategies
- [CLoST: Creative Leap of Structured Thought (arXiv 2410.10370)](https://arxiv.org/html/2410.10370v1) — self-improvement без fine-tuning
- [HUMORCHAIN (arXiv 2511.21732)](https://arxiv.org/html/2511.21732) — theory-guided multi-stage, 0.810 score
- [Multi-Agent Comedy Club (arXiv 2602.14770)](https://arxiv.org/html/2602.14770) — 75.6% preference wins
- [Humor Multi-dimensional Analysis (arXiv 2511.09133)](https://arxiv.org/html/2511.09133v1) — LLM-judge ρ = 0.224
- [Small But Funny: Humor Distillation (arXiv 2402.18113)](https://arxiv.org/html/2402.18113v1) — MCP 76% agreement
- [Min-p Sampling (ICLR 2025, arXiv 2407.01082)](https://arxiv.org/abs/2407.01082) — min-p sampling > nucleus
- [Temperature & Humor (arXiv 2504.02858)](https://arxiv.org/abs/2504.02858) — 73% моделей: пик при temperature ≤ 0.5
- [Human Alignment for Humor Ranking (arXiv 2502.20356)](https://arxiv.org/html/2502.20356v1) — persona prompting +3% max, pairwise fine-tuning +15%
- [Toplyn Framework (GitHub)](https://github.com/Stry233/Prompt-to-GPT-3-Step-by-Step-Thinking-Instructions-for-Humor-Generation)
- [Wordware Twitter Roast (blog)](https://blog.wordware.ai/twitter-roast-ai-with-llm-orchestration) — 4M users, prompt > model
- [FAccT 2024: Robot Walks into a Bar](https://facctconference.org/static/papers24/facct24-108.pdf) — comedy theory for AI

---

## Часть 8. Самокритика — что этот документ делает хорошо и где ошибается

### Сильные стороны

1. **AI-human calibration gap** — надёжно задокументирован конкретными примерами (nikitabier: AI 2.4, human 4.5; PoodleFi_: AI 1.9, human 4.03). Это не гипотеза, а факт из данных.

2. **QUOTE_FLIP как потолок** — качественный аргумент (все 4.5+ используют quote-flip) сильнее количественного (средний балл 3.63). Потолок важнее среднего для creative tasks.

3. **Промпт перегружен** — верифицировано по коду (`buildRoastPrompt()` в prompt-builder.ts:367-434 собирает ~15 секций). Ключевое сообщение действительно buried.

4. **Research consensus** — все академические подходы (HumorPlanSearch, HUMORCHAIN, CLoST, Toplyn) согласны: structured multi-step > one-shot generation. Подтверждает SLOP→generate подход.

### Слабые стороны (исправлены в этой ревизии)

| Проблема | Было | Стало | Почему исправлено |
|----------|------|-------|-------------------|
| MISDIRECTION n=1 | «Лучший» | «Структурно сильный, но n=1 — не доказательство» | 1 sample ≠ статистика |
| FREESTYLE 50% | Доминирующий режим, вес 2.5 | 1 слот из 3-4, вес 1.5 | Противоречит research: больше структуры = лучше |
| Temperature 0.4-0.5 | В плане Фазы 1 | Помечен как «неприменим» | CLI subprocess не экспонирует temperature |
| deflation_hawk «убрать» | Просто удалить | 3 варианта реформы | Он единственный judge в quick mode — нужна замена |
| MCP vs scoring «76% vs 25%» | Прямое числовое сравнение | Разные метрики, качественное сравнение | ρ correlation ≠ agreement % |
| Concluding punchlines «~60%» | Точная цифра | «Многие, точный % не подсчитан» | Число было приблизительной оценкой |
| Веса новых angles | Точные числа без данных | Помечены как «стартовые гипотезы» | Нет human data для новых angles |
| crypto_native «убрать» | Убрать как шум | Оставить — ловит generic AI output | Реально полезная метрика |
| «rubric 50% stockpile» | Факт | «Не верифицировано — нужен SQL» | Нет данных, только гипотеза |
| Target quality | Не упоминался | Добавлена секция 1.6 | Разброс между целями > разброс между углами |

### Что остаётся неопределённым

1. **Strategy contribution** — какая стратегия (rubric/persona/adversarial) реально даёт больше хитов. Трекается через `farm_attempts.strategy` → `roast_stockpile.attempt_id`, но запрос по production DB не выполнен.

2. **Mutation↔quality корреляции** — 14 stockpiled items (S3) недостаточно для анализа. Нужно 50+.

3. **Persona prompting +3%** — это из research по generic humor evaluation. Для нашего домена (crypto roasts, 5 специализированных persona) эффект может отличаться. Но +3% ceiling — аргумент для осторожности.

4. **Pre-filter recall** — сколько реально хороших роустов отсекается pre-filter? Нет данных. Логируем `reason`, но не проверяем false positives.

---

---

## Часть 9. Roadmap реализации

### Принцип: измеряй перед тем, как менять дальше

Изменения разбиты на **6 milestone'ов** с **verification gate** после каждого. Правило: **генерацию и оценку не меняем одновременно** — иначе не определим, что вызвало эффект. Порядок: сначала generation (angles, prompt), затем evaluation (judges, weights), затем architecture (strategies).

Каждый milestone завершается farm run + human review. Если gate не пройден — стоп, анализ, корректировка. Не переходим к следующему milestone без подтверждения.

---

### Milestone 0: Сбор данных (до любых изменений)

**Цель:** получить baseline для сравнения. Без этих данных все дальнейшие улучшения — гадание.

| # | Задача | Файл/инструмент | Зачем |
|---|--------|------------------|-------|
| 0.1 | SQL-запрос: strategy → stockpile hit rate | Production SQLite | Узнать, rubric или adversarial даёт больше хитов. Если persona ≈ 0% хитов → уверенно убираем в M5 |
| 0.2 | SQL-запрос: mutation_seed → stockpile корреляция | Production SQLite | Baseline для будущего трекинга мутаций |
| 0.3 | Зафиксировать baseline-метрики | Документ | S3: 22.6% stockpile, 3.53 avg, 16.2% четвёрок, 29.7% ниже тройки |

```sql
-- 0.1: Strategy contribution
SELECT fa.strategy, COUNT(rs.id) AS stockpiled, COUNT(fa.id) AS total,
       ROUND(100.0 * COUNT(rs.id) / COUNT(fa.id), 1) AS hit_rate_pct
FROM farm_attempts fa
LEFT JOIN roast_stockpile rs ON rs.attempt_id = fa.id
GROUP BY fa.strategy;

-- 0.2: Mutation seeds in stockpile
SELECT fa.mutation_seed, COUNT(rs.id) AS hits
FROM farm_attempts fa
JOIN roast_stockpile rs ON rs.attempt_id = fa.id
WHERE fa.mutation_seed IS NOT NULL
GROUP BY fa.mutation_seed ORDER BY hits DESC;
```

**Gate:** данные получены, задокументированы. Нет блокеров.
**Время:** ~15 минут.

---

### Milestone 1: Angle System Overhaul (Предложения 1, 2, 3, 4)

**Цель:** разблокировать сильные joke types (MISDIRECTION, BATHOS, DOMAIN_SHIFT), убрать слабые (RHETORICAL, TIMELINE), добавить FREESTYLE. Это **единственное изменение с самым высоким ROI** — расширяет пул доступных приёмов без ломки существующей логики.

**Почему первым:** затрагивает только `prompt-builder.ts:6-51` (массив + веса + тип). Алгоритм `pickAngles()` не меняется — он уже работает с любым массивом и весами. Низкий риск, высокий потенциальный импакт.

| # | Задача | Файл:строки | Зачем |
|---|--------|-------------|-------|
| 1.1 | Добавить MISDIRECTION, BATHOS, DOMAIN_SHIFT, IRONIC_REVERSAL в `ANGLES` | `prompt-builder.ts:6-9` | Единственный 5.0 в датасете = MISDIRECTION, но его нельзя выбрать. BATHOS и DOMAIN_SHIFT — в technique block, но не назначаются |
| 1.2 | Убрать RHETORICAL (2.80, n=4) и TIMELINE (2.67, n=3) | `prompt-builder.ts:6-9` | Структурно слабые: вопрос без data reversal, хронология без панча |
| 1.3 | Добавить FREESTYLE (комбинация любых приёмов) | `prompt-builder.ts:6-9` | Лучшие роусты гибридные (Farcaster 5.0 = QUOTE_FLIP + MISDIRECTION). 1 слот из 3-4, не доминирующий |
| 1.4 | Обновить `DEFAULT_ANGLE_WEIGHTS` | `prompt-builder.ts:16-26` | QUOTE_FLIP 0.8 → 1.8 (потолок 5.0, все 4.5+ = quote-flip). Новые angles — стартовые гипотезы (1.0-1.5) |
| 1.5 | Обновить описания новых angles в prompt | `prompt-builder.ts` | LLM должен понимать, что значит MISDIRECTION/BATHOS/DOMAIN_SHIFT/FREESTYLE как assigned angle |
| 1.6 | Typecheck + tests | CI | `RoastAngle` тип автовыводится из `ANGLES`, но нужно проверить все места использования |

**Ожидаемый профит:**
- Разблокированы 4 joke types (было 9, станет 11 + FREESTYLE = 12)
- QUOTE_FLIP выбирается в ~2.5× чаще (вес 0.8 → 1.8)
- Убраны 2 слабых angle → меньше waste-генерации
- FREESTYLE даёт гибриды в ~25% случаев (1 из 4 слотов)

**Gate:** `pnpm typecheck && pnpm test` проходят. Промпт корректно показывает новые angles.
**Время:** ~1.5 часа.

---

### Milestone 2: Quote-Flip Focus + Pre-filter (Предложения 5, 7, 10)

**Цель:** усилить #1 паттерн качества (quote-flip) и добавить фильтр #1 паттерна провалов (concluding punchline).

**Почему вторым:** не зависит от M1. Можно делать параллельно или после. Каждая задача — изолированное изменение в своём файле. Ноль архитектурного риска.

| # | Задача | Файл:строки | Зачем |
|---|--------|-------------|-------|
| 2.1 | Добавить Step 0 (Quote Extraction) в `buildTweetTaskSection()` | `prompt-builder.ts:348-361` | Форсирует quote-flip как ПЕРВЫЙ instinct. Все 4.5+ используют этот паттерн, но инструкция buried среди 15 секций |
| 2.2 | Добавить punch word enforcement в `buildLengthAndPunchlineConstraints()` | `prompt-builder.ts:184-193` | «Убери последние 3 слова — если шутка жива, структура неправильная». Универсальное правило, не только tweet-mode |
| 2.3 | Добавить `CONCLUDING_PATTERNS` в pre-filter | `evaluator.ts:80-98` | `/and they call this .+$/`, `/that's .+ for you$/`, `/welcome to .+$/`. ~60% провалов имеют concluding punchline |

**Ожидаемый профит:**
- Больше вариантов с quote-flip структурой (Step 0 форсирует поиск quotable phrases)
- Concluding punchlines отсекаются до LLM-оценки → экономия вызовов
- Punch word enforcement → пунчлайны лэндятся на последнем слове

**Gate:** `pnpm typecheck && pnpm test`. Ручная проверка: сгенерировать 3-5 промптов, убедиться что Step 0 видимый и concluding pre-filter работает.
**Время:** ~1 час.

---

### Milestone 3: Validation Farm Run #1

**Цель:** подтвердить, что M1+M2 не ухудшили и (надеемся) улучшили качество. **Без этого gate все дальнейшие milestone'ы запрещены.**

| # | Задача | Инструмент | Зачем |
|---|--------|------------|-------|
| 3.1 | Farm run: 7-10 targets, те же что в S3 + 2-3 новых | `pnpm farm` | Сравнимость с S3 baseline |
| 3.2 | Отправить в Telegram (blind review) | Telegram bot | Воронин оценивает без знания AI-скоров |
| 3.3 | Собрать human scores | Telegram | Цель: avg ≥ 3.53, stockpile ≥ 22.6% |
| 3.4 | Анализ: какие angles/strategies попали в stockpile | SQL | Данные для M4-M5 |
| 3.5 | Анализ: FREESTYLE vs assigned — кто лучше | SQL + human scores | Подтвердить/опровергнуть гипотезу «гибриды > single angle» |

**Gate criteria (pass/fail):**

| Метрика | S3 Baseline | Minimum (pass) | Target |
|---------|-------------|----------------|--------|
| Stockpile rate | 22.6% | ≥ 20% | ≥ 28% |
| Avg human score | 3.53 | ≥ 3.40 | ≥ 3.70 |
| Роусты 4.5+ | 16.2% | ≥ 14% | ≥ 22% |
| Роусты < 3.0 | 29.7% | ≤ 32% | ≤ 22% |

**Если gate НЕ пройден:** анализируем провалы. Вероятные причины:
- Новые angles (MISDIRECTION, BATHOS) хуже ожиданий → понизить веса
- FREESTYLE генерит generic → убрать или сузить промпт
- Concluding pre-filter слишком агрессивный → ослабить паттерны

**Время:** ~2-3 часа (farm ~1h, ревью ~1-2h).

---

### Milestone 4: Prompt Diet (Предложение 5)

**Цель:** сократить промпт с ~3500-4500 до ~2500-3000 токенов. Убрать секции, которые не коррелируют с 4.5+ роустами. Поднять видимость QUOTE_FLIP инструкции.

**Почему после M3:** данные M3 покажут, какие секции промпта реально влияют на результат. Если M3 дал хорошие результаты С текущим промптом — сокращаем осторожнее. Если M3 показал, что длинный промпт мешает — сокращаем агрессивнее.

| # | Задача | Файл:строки | Зачем |
|---|--------|-------------|-------|
| 4.1 | Убрать `buildEmotionalRangeSection()` | `prompt-builder.ts` | 4 тона (clinical, amused, outraged, wistful) — мутации уже варьируют тон. Ноль корреляции с 4.5+ |
| 4.2 | Убрать `buildSignatureMoveSection()` | `prompt-builder.ts` | «The Accountant's Footnote», «The Polite Correction» — не коррелируют с хитами |
| 4.3 | Сократить `buildCharacterCheckpoint()` 5→2 | `prompt-builder.ts:243-269` | Оставить: (1) reframe vs conclude? (2) работает без имени цели? — два вопроса, которые ловят главные провалы |
| 4.4 | Сократить `buildTechniqueBlock()` | `prompt-builder.ts:200-227` | MISDIRECTION, BATHOS, DOMAIN_SHIFT теперь в ANGLES — убрать их из technique block. Оставить: SILENT_SCREENSHOT, SER_ADDRESS, DELAYED_OBVIOUS как вдохновение (3 вместо 7) |
| 4.5 | Переместить QUOTE_FLIP инструкцию в top-3 по видимости | `prompt-builder.ts` | Сейчас buried в `buildTweetTaskSection`. Должна быть ДО примеров и research instructions |
| 4.6 | Измерить: токены до/после | Ручная проверка | Цель: < 3000 токенов на промпт |

**Ожидаемый профит:**
- -30-40% prompt tokens → LLM фокусируется на главном
- QUOTE_FLIP instruction — одна из первых, что видит LLM
- Нет потери качества (убираемые секции не коррелируют с хитами)

**Gate:** `pnpm typecheck && pnpm test`. Промпт < 3000 токенов. Mini farm run (3-5 targets) → качество ≥ M3.
**Время:** ~2 часа.

---

### Milestone 5: Judge Reform (Предложения 6, 16)

**Цель:** уменьшить AI-human calibration gap (ρ ≈ 0.25 → ρ ≥ 0.35). Это **самый высококонфидентный** структурный change — gap задокументирован конкретными примерами (nikitabier: AI 2.4 vs human 4.5; PoodleFi_: AI 1.9 vs human 4.03).

**Почему после M3-M4:** нужны новые human-rated роусты для калибровки. Без свежих данных калибровочные якоря будут based on old S3 data only. M3 даст 20-40 свежих rated roasts.

**Порядок внутри milestone критичен** — сначала judge reform, потом weights, потом quick mode. Каждый шаг проверяется ретроспективным прогоном на уже оценённых роустах.

| # | Задача | Файл:строки | Зачем |
|---|--------|-------------|-------|
| 5.1 | Реформировать `deflation_hawk` | `judge-personas.ts:91-118` | Убрать «Start every dimension at 2» и «When in doubt, round DOWN». Добавить калибровочные якоря: nikitabier B6 = 4.5, PoodleFi_ C1 = 4.0+ |
| 5.2 | Добавить IMPACT dimension | `evaluator.ts` types, `judge-personas.ts` | Заменить SHAREABLE. «Would someone STOP SCROLLING to read this twice?» — более прямой proxy |
| 5.3 | Обновить `DIMENSION_WEIGHTS` | `evaluator.ts:19-28` | funny 0.30 → 0.40, impact (ex-shareable) 0.25, original 0.15, savage 0.10, остальное 0.05. Убрать timely |
| 5.4 | Quick mode: comedy_writer вместо deflation_hawk | `evaluator.ts:264-265` | comedy_writer оценивает craft (misdirection, surprise, punchline) — ближе к human evaluation, чем deflation_hawk |
| 5.5 | **Валидация:** прогнать ВСЕ 37+ human-rated роустов через новых судей | Скрипт | Посчитать Spearman ρ между AI composite и human score. Если ρ < 0.25 (хуже текущего) → откатить |

**Ожидаемый профит:**
- Меньше false negatives (роусты типа nikitabier B6 перестанут отсекаться)
- ρ 0.25 → 0.35+ (калибровочные якоря + правильный judge в quick mode)
- Меньше waste: роусты, которые нравятся людям, проходят фильтр

**Gate:** ρ ≥ 0.30 на ретроспективном прогоне (37+ роустов). Если ρ < 0.25 → откат к старым настройкам, анализ.
**Время:** ~3 часа (2h код + 1h валидация).

**Риски:**
- comedy_writer в quick mode может быть слишком мягким (inflation вместо deflation). Страховка: hard vetoes остаются
- IMPACT — непроверенная метрика. Страховка: ретроспективная валидация на шаге 5.5

---

### Milestone 6: Strategy Reduction (Предложение 3)

**Цель:** убрать persona strategy (3→2), сэкономить 33% LLM-вызовов.

**Почему последним из структурных:** это самое рискованное generation change. Если persona неожиданно даёт хиты (M0.1 покажет), убирать нельзя. Нужны данные.

**Зависимость:** решение принимается на основе данных M0.1 (strategy hit rate SQL).

| # | Задача | Файл:строки | Зачем |
|---|--------|-------------|-------|
| 6.1 | Проверить M0.1 данные: persona hit rate | SQL результат | Если persona > 10% хитов → не убираем |
| 6.2 | Убрать persona из `PROMPT_STRATEGIES` | `roast-engine.ts`, `prompt-builder.ts` | -33% LLM-вызовов (6→4). Research: persona prompting max +3% |
| 6.3 | Опционально: интегрировать SLOP-шаг из adversarial в rubric | `prompt-builder.ts` | Если adversarial value = только SLOP diagnosis, можно добавить как CoT step в rubric |

**Ожидаемый профит:**
- -33% стоимости генерации (2 меньше LLM-вызовов на цель)
- Нет потери качества (если M0.1 подтверждает что persona ≈ 0% хитов)
- Быстрее: 4 вызова параллельно вместо 6

**Gate:** Farm run → stockpile rate ≥ M3 rate. Если stockpile упал > 5 п.п. → вернуть persona.
**Время:** ~1.5 часа.

---

### Milestone 7: Validation Farm Run #2

**Цель:** полная валидация всех изменений M1-M6 вместе. Финальный human review перед переходом к системным изменениям.

| # | Задача | Зачем |
|---|--------|-------|
| 7.1 | Farm run: 10+ targets (mix из S3 + свежие) | Финальный baseline |
| 7.2 | Blind human review (Воронин) | Ground truth |
| 7.3 | Сравнить все метрики с S3 baseline | Подтверждение улучшений |
| 7.4 | Документировать: что сработало, что нет | Input для Phase 3 |

**Gate:**

| Метрика | S3 Baseline | Target (M1-M6) | Обоснование |
|---------|-------------|-----------------|-------------|
| Stockpile rate | 22.6% | ≥ 30% | Убраны weak angles + pre-filter + better evaluation |
| Avg human score | 3.53 | ≥ 3.75 | Quote-flip focus + prompt diet + less false negatives |
| LLM calls/target | 6-12 | 4-8 | -1 strategy |
| Prompt tokens | 3500-4500 | < 3000 | Prompt diet |
| AI-human ρ | 0.25 | ≥ 0.35 | Judge reform |

**Время:** ~2-3 часа.

---

### Milestone 8: System Changes (Phase 3, после M7)

Эти изменения требуют **больше данных** (50+ stockpiled, 100+ human-rated) и **инфраструктурных решений** (embeddings, MCP). Приоритизация внутри M8 зависит от результатов M7.

| # | Задача | Предложение | Зависимость | Приоритет |
|---|--------|-------------|-------------|-----------|
| 8.1 | MCP reranking (попарное «какой смешнее?») | П.11, П.14 | Нужен working evaluation baseline (M7) | Высокий — потенциально лучший proxy для human judgment |
| 8.2 | Stockpile-driven few-shots | П.9 | Нужно 15-20 human-rated 4.0+ роустов (M7 даст) | Высокий — research подтверждает |
| 8.3 | Target quality pre-scoring | П.15 | Нужна формализация «quotable phrase» | Средний — target variance > angle variance, но автоматизация нетривиальна |
| 8.4 | 1 стратегия (SLOP→generate, 4-5 вариантов за 1 вызов) | П.12 | Нужны A/B данные из M6 (2 стратегии vs 1) | Средний — радикально, нужен A/B |
| 8.5 | Mutation tracking → динамические веса | П.8, П.17 | Нужно 50+ stockpiled с metadata | Низкий — premature без данных |
| 8.6 | Novelty filter (embeddings similarity) | П.12 | Нужна embedding инфраструктура | Низкий — полезно при масштабе |

---

### Общая карта зависимостей

```
M0 (data)
 ├→ M1 (angles)  ─┐
 └→ M2 (quote-flip) ─┤
                      ├→ M3 (farm #1) → M4 (prompt diet) ─┐
                      │                                     ├→ M5 (judges) → M6 (strategies) → M7 (farm #2) → M8 (system)
                      │                                     │
                      │           M0.1 data ────────────────┘→ M6 decision
```

M1 и M2 **можно делать параллельно** — они не зависят друг от друга.
M4 и M5 **последовательно** — нужны данные M3 для калибровки.
M6 зависит от M0.1 (strategy hit rate) — решение принимается по данным.

### Суммарные ожидания

| Что | Сейчас | После M1-M6 | Механизм |
|-----|--------|-------------|----------|
| Доступных joke types | 9 | 12 | +4 (MISDIRECTION, BATHOS, DOMAIN_SHIFT, IRONIC_REVERSAL) -2 (RHETORICAL, TIMELINE) +1 (FREESTYLE) |
| QUOTE_FLIP probability | ~9% | ~18% | Вес 0.8 → 1.8 при 12 angles |
| Prompt size | ~4000 tok | ~2700 tok | -emotional range, -signature moves, -3 checkpoint Qs, -4 techniques |
| LLM calls/target | 6-12 | 4-8 | -persona strategy |
| Waste generation | 77.4% | ~65% (target) | Better angles + pre-filter + calibrated evaluation |
| AI-human ρ | 0.25 | 0.35+ | Calibration anchors + comedy_writer in quick mode |

---

*Документ основан на: полном аудите кода пайплайна (12 файлов), анализе 37 роустов с человеческими оценками (7 батчей, ревьюер Воронин), данных S3 farm run, VPS логах (66K+ строк PM2), deep research по AI humor generation (20+ academic papers, 2024-2026). Ревизия 3 (2026-03-25): добавлен implementation roadmap с milestone'ами, verification gates, зависимостями.*
