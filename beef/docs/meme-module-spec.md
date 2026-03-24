# Meme Module — спецификация v2

## Суть

Модуль `src/meme/` генерирует мемы через Imgflip API. Три формата вывода: мем-как-роаст (картинка = весь пост), мем + текст (разные углы атаки), только текст (как сейчас). LLM сам выбирает формат исходя из контекста.

## Два режима генерации

### Meme-as-roast

Мем IS the tweet. Картинка несёт весь юмор. Текст поста — минимальный caption: "ser @hyperliquid", "anon pls", пустой, или хештег.

Когда работает лучше всего: драматичные события (TVL crash, rug pull), очевидные сравнения (обещания vs реальность), паттерны поведения (все делают одно и то же).

### Meme + text

Текстовый roast атакует с одного угла, мем добавляет другой. Не дублирует — дополняет. Текст про конкретные числа и факты, мем про абсурдность ситуации.

Когда работает лучше всего: сложные ситуации с несколькими точками атаки, когда roast-текст слишком "серьёзный" и мем разбавляет.

### Выбор формата

LLM решает сам внутри одного вызова. Промпт:

> "Ты можешь выбрать один из трёх форматов:
> 1. **meme_only** — мем полностью передаёт шутку, текст поста минимальный (caption ≤ 30 chars или пустой)
> 2. **meme_plus_text** — мем дополняет roast text ДРУГИМ углом атаки. Мем НЕ повторяет текст
> 3. **text_only** — мем не нужен, текст самодостаточен
>
> Выбери формат, который создаёт самый сильный и смешной пост."

Output schema:
```json
{
  "format": "meme_only" | "meme_plus_text" | "text_only",
  "roastText": "optional tweet text, required for meme_plus_text",
  "caption": "short caption for meme_only format",
  "meme": {
    "templateId": "181913649",
    "boxes": ["Shipping product", "Announcing partnerships"],
    "rationale": "Drake format — reject/embrace fits this target's behavior"
  } | null
}
```

Один LLM-вызов решает всё: формат + текст + мем. Не нужна отдельная стратегия, не нужен отдельный mode selection step.

### Когда НЕ нужна параллельная генерация трёх форматов

Три параллельных вызова (один на формат) × 3 стратегии = 9 LLM-вызовов на один пост. Это overkill. Хватает одного вызова — LLM достаточно умён, чтобы выбрать формат сам, видя target + research context.

Если при обкатке окажется, что LLM слишком часто выбирает один формат — добавим soft guidance в промпт: "последние 5 постов были text_only, попробуй мем" (через recency tracking).

## Pipeline

```
[Target + research context + roast strategies]
                    |
        ClaudeCodeProvider.run('meme-generate')
                    |
    LLM выбирает format + генерирует всё за один вызов
                    |
              format == text_only?
              /              \
           да                нет
            |                 |
     return текст       Pre-filter (длина boxes,
     как сейчас          box count, пустые)
                              |
                    Imgflip /caption_image
                              |
                    Download → tmp file
                              |
                    MemeResult + tweet text
```

## Модуль

```
src/meme/
├── imgflip-client.ts      # HTTP: captionImage + downloadToTmp
├── meme-generator.ts      # Типы, промпт, фильтр, оркестрация — всё в одном
└── meme-templates.ts      # Curated шаблоны с rich metadata
```

Три файла. Фильтр — функция внутри generator (4 проверки, не класс). Типы — в том же файле или в `common/types`.

### MemeGenerator

```typescript
class MemeGenerator {
  constructor(
    private imgflip: ImgflipClient,
    private provider: LLMProvider,
    private templates: MemeTemplate[],
    private historyRepo: MemeHistoryRepository,
  ) {}

  // Основной метод — полная генерация (format + text + meme)
  async generate(input: MemeInput): Promise<MemeOutput>

  // Несколько вариантов для Telegram review
  async generateVariants(input: MemeInput, count: number): Promise<MemeOutput[]>
}

interface MemeOutput {
  format: 'meme_only' | 'meme_plus_text' | 'text_only';
  tweetText: string;           // caption (meme_only) или roast text (meme_plus_text) или полный roast (text_only)
  meme: {
    imageUrl: string;
    localPath: string;
    templateId: string;
    templateName: string;
    boxes: string[];
    rationale: string;
  } | null;
}
```

## Библиотека шаблонов

### Структура шаблона

```typescript
interface MemeTemplate {
  id: string;                    // Imgflip ID
  name: string;                  // "Drake Hotline Bling"
  boxCount: number;              // 2
  structure: string;             // КЛЮЧЕВОЕ: нарративная роль каждого box
  tone: string[];                // ["dismissive", "sarcastic"]
  bestFor: string;               // когда использовать
  antiPatterns: string;          // когда НЕ использовать
  charLimit: number;             // рекомендуемый max chars/box для этого шаблона
  examples: MemeExample[];       // 3 крипто-примера
}

interface MemeExample {
  boxes: string[];               // ["Auditing contracts", "Aping based on a tweet"]
  context: string;               // "project skipping security for speed"
}
```

**`structure`** — самое важное поле. Не "top text / bottom text", а нарративная роль:
- Drake: "Box 1: вещь, которую отвергают. Box 2: вещь, которую предпочитают вместо неё"
- Distracted Boyfriend: "Box 1 (girlfriend): то, что должны делать. Box 2 (other woman): то, на что отвлеклись. Box 3 (boyfriend): кто именно"
- This Is Fine: "Box 1: абсурдно спокойная реакция на очевидную катастрофу"
- Expanding Brain: "Box 1: нормальное решение. Box 2: абсурдно переусложнённое решение"

**`examples`** — 3 штуки, все крипто-контекстные. Это few-shot для LLM. Абстрактные описания ("rejecting X, embracing Y") не работают — конкретные примеры работают.

**`antiPatterns`** — когда шаблон НЕ подходит. Предотвращает главную ошибку LLM: использовать Drake для всего подряд.

### Пример полного шаблона

```typescript
{
  id: "181913649",
  name: "Drake Hotline Bling",
  boxCount: 2,
  structure: "Box 1: вещь, которую отвергают/игнорируют. Box 2: то, что выбирают вместо неё (обычно хуже или абсурднее)",
  tone: ["dismissive", "sarcastic", "comparison"],
  bestFor: "Когда кто-то игнорирует очевидно правильное ради очевидно плохого",
  antiPatterns: "Не для простых фактов. Оба box-а должны иметь контраст/иронию. Не для хронологии (было/стало)",
  charLimit: 50,
  examples: [
    { boxes: ["Auditing smart contracts", "Aping based on a CT thread"], context: "project launches without audit" },
    { boxes: ["Taking profits at 10x", "Diamond handing to -95%"], context: "trader refuses to sell" },
    { boxes: ["Building actual product", "Announcing strategic partnerships"], context: "project all marketing no dev" }
  ]
}
```

### Размер библиотеки

**Tier 1 — core (20 шаблонов):** rich annotations (structure + 3 examples + antiPatterns). Рабочие лошадки — Drake, Distracted Boyfriend, This Is Fine, Expanding Brain, Clown Applying Makeup, Change My Mind, Panik/Kalm, Disaster Girl, Surprised Pikachu, Always Has Been, и т.д.

**Tier 2 — extended (20-30 шаблонов):** basic annotations (structure + 1 example). Используются когда Tier 1 exhausted по recency. Более нишевые форматы.

**Итого 40-50 шаблонов** на старте. Этого хватит на 2-3 недели без повторов при 3-5 мемов/день.

### Расширение библиотеки

**Ежемесячный refresh:** fetch Imgflip top-100, сравнить с нашим списком, flag новые trending шаблоны для ручного review.

**Engagement-driven:** после Phase 4 (метрики) — отслеживаем какие шаблоны получают лучший engagement. Шаблоны с consistently low engagement → убираем. Шаблоны с high engagement → добавляем similar.

**Крипто-специфичные моменты:** мемы из iconic CT событий (Do Kwon "I'm not worried", SBF "assets are fine") — если они есть на Imgflip. Если нет — future: custom templates.

### Recency tracking

SQLite таблица `meme_history`:

```sql
CREATE TABLE meme_history (
  id INTEGER PRIMARY KEY,
  template_id TEXT NOT NULL,
  target TEXT NOT NULL,
  boxes TEXT NOT NULL,        -- JSON
  format TEXT NOT NULL,       -- meme_only | meme_plus_text
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

При генерации: query последние N записей (N=15), передать LLM:
> "Шаблоны, использованные недавно (ИЗБЕГАЙ их): Drake (2 часа назад), This Is Fine (вчера), ..."

LLM естественно переключится на другие шаблоны. Не жёсткий запрет — LLM может повторить если реально идеально подходит, но будет стремиться разнообразить.

## LLM промпт

Claude Code Provider, профиль `meme-generate`:

| Параметр | Значение |
|----------|---------|
| Model | sonnet |
| Effort | medium |
| Tools | нет |
| Max turns | 1 |
| Timeout | 45s |

Effort `medium` (не `low`) — выбор шаблона и написание box text требуют reasoning. При `low` LLM будет выбирать первый попавшийся Drake.

### Структура промпта

```
[SYSTEM]
Ты — генератор мемов для крипто-roast бота. Создаёшь мемы, которые:
- Конкретные (не generic market commentary)
- Используют формат шаблона правильно (structure каждого описан)
- Максимально смешные и shareable

[AVAILABLE TEMPLATES]
(полный список с structure, tone, bestFor, antiPatterns, examples)

[RECENTLY USED — AVOID]
Drake (2h ago), This Is Fine (5h ago), ...

[TARGET]
Name: hyperliquid
Type: project
Research context: TVL dropped 94%, team tweeting about partnerships, ...

[ROAST TEXT — if available]
"hyperliquid tvl down 94% and you're tweeting about partnerships ser..."

[TASK]
Выбери лучший формат (meme_only / meme_plus_text / text_only).
Если мем: выбери шаблон, напиши текст для boxes.

Rules:
- Max {charLimit} chars per box (varies by template)
- Max 8 words per box
- No emoji, no hashtags in boxes
- Boxes must follow the template's STRUCTURE
- If meme_plus_text: мем должен атаковать с ДРУГОГО угла, чем roast text
- If meme_only: caption ≤ 30 chars (или пустой)

[OUTPUT — JSON]
```

## Интеграция с Twitter

### Расширение существующих методов

Не новые методы, а опциональный параметр:

```typescript
interface ITwitterClient {
  postTweet(text: string, options?: { mediaPath?: string }): Promise<PostResult | null>;
  replyToTweet(text: string, replyToId: string, options?: { mediaPath?: string }): Promise<PostResult | null>;
  // uploadMedia остаётся internal
}
```

Backward compatible. Вызывающий код не ветвится — просто передаёт `mediaPath` если есть.

Внутри реализации: если `mediaPath` передан → upload → attach media_id. Если нет → как сейчас.

### TwitterClient (Official API)

```typescript
async postTweet(text: string, options?: { mediaPath?: string }) {
  const params: SendTweetV2Params = { text };
  if (options?.mediaPath) {
    const mediaId = await this.client.v1.uploadMedia(options.mediaPath);
    params.media = { media_ids: [mediaId] };
  }
  return this.client.v2.tweet(params);
}
```

### ScraperTwitterClient (GraphQL)

Media upload через `POST https://upload.twitter.com/1.1/media/upload.json` с cookie auth. Потенциально рискованная операция (error 226 прецедент). Требует POC до полной имплементации.

## Telegram-команды

### `/meme <target>` — standalone

```
/meme hyperliquid
→ LLM генерирует (format + template + boxes)
→ Imgflip рендерит
→ Картинка в чат + metadata (template, boxes, rationale)
→ [Post] [Regenerate] [Discard]
```

Основной инструмент обкатки. Быстрый feedback loop: 30-45 секунд на цикл.

### `/meme <target> --variants 3`

3 варианта с разными шаблонами → все 3 картинки в чат → человек выбирает лучшую. Заменяет LLM quality judge на human judgment.

### `/roast` и `/farm` — мем-кнопка

После генерации roast-вариантов:
```
Roast #1 (savage, 4.2): "hyperliquid tvl down 94%..."
[Meme] [Post] [Discard]
```

"Meme" → генерирует complementary мем → показывает картинку → "Post with meme" / "Post text only".

### `/farm --meme`

Автоматически генерирует мем для каждого stockpile-варианта. В Telegram: текст + картинка парой.

## Точки интеграции

| Файл | Что меняется |
|------|-------------|
| `twitter/twitter-client.interface.ts` | `postTweet` и `replyToTweet` + `options?: { mediaPath? }` |
| `twitter/twitter-client.ts` | `v1.uploadMedia` + `media` в `v2.tweet` params |
| `twitter/scraper-twitter-client.ts` | Upload через upload.twitter.com + `media_entities` |
| `queue/queue-manager.ts` | `postGeneratedRoast()` + `mediaPath` |
| `admin/bot.ts` | `/meme` команда, inline buttons, `--meme` в farm |
| `agent/agent.types.ts` | `TaskProfile 'meme-generate'` |
| `agent/claude-code.provider.ts` | Пресет: sonnet, medium, 1 turn, 45s |
| `common/config/env.validation.ts` | `IMGFLIP_USERNAME`, `IMGFLIP_PASSWORD` |
| `storage/` | `meme_history` таблица + repository |

## Тестирование

### Unit tests

- **ImgflipClient:** HTTP-вызов mock, парсинг ответа, ошибка API (success/error body), download tmp file
- **MemeGenerator:** filter отсекает длинный текст, filter отсекает wrong box count, filter пропускает валидный, null при Imgflip ошибке, recency list передаётся в промпт, format=text_only → null meme
- **Templates:** все шаблоны имеют обязательные поля, все examples соответствуют boxCount, charLimit > 0

### Integration tests

- Imgflip real call: `captionImage` → URL доступен, картинка скачивается
- LLM real call: structured output парсится, templateId из curated списка, boxes ≤ charLimit
- Full pipeline: target → LLM → Imgflip → файл на диске → cleanup

### Manual testing

`/meme <target>` и `/meme <target> --variants 3` в Telegram. Калибровка через ручной review:
- Какие шаблоны LLM выбирает чаще? Разнообразен ли выбор?
- Качество box text: специфичный или generic?
- Format distribution: как часто LLM выбирает каждый формат?
- Какие шаблоны consistently bad → удалить из библиотеки

## Что нужно от тебя

### Imgflip

1. Зарегаться на [imgflip.com](https://imgflip.com) (email + пароль)
2. Дать мне `IMGFLIP_USERNAME` и `IMGFLIP_PASSWORD`
3. Free tier хватит для обкатки. Premium ($9.99/мес) — для прода (без watermark)

## Декомпозиция

### Phase 0: De-risk Twitter media upload

| # | Задача |
|---|--------|
| 0 | POC: загрузить картинку через ScraperTwitterClient cookie auth. Если не работает — только Official API для media |

Один день. Критический гейт: если upload не работает через scraper, вся Phase 3 меняется.

### Phase 1: Ядро

| # | Задача |
|---|--------|
| 1 | `ImgflipClient` — captionImage + downloadToTmp + тесты |
| 2 | `meme-templates.ts` — fetch top-100 Imgflip, отобрать 40-50, аннотировать Tier 1 (20) с rich metadata |
| 3 | `MemeGenerator` — промпт, фильтр, оркестрация, типы + тесты |
| 4 | `meme-generate` task profile в ClaudeCodeProvider |
| 5 | Env validation: IMGFLIP_USERNAME, IMGFLIP_PASSWORD |
| 6 | `meme_history` таблица + repository + recency tracking |

### Phase 2: Telegram

| # | Задача |
|---|--------|
| 7 | `/meme <target>` команда (standalone) |
| 8 | `/meme <target> --variants N` (multiple для review) |
| 9 | Inline button "Meme" в /roast и /farm |
| 10 | `--meme` флаг в /farm для auto-generation |

### Phase 3: Twitter media

| # | Задача |
|---|--------|
| 11 | `postTweet` / `replyToTweet` + `options.mediaPath` в interface |
| 12 | TwitterClient: v1.uploadMedia + media в v2.tweet |
| 13 | ScraperTwitterClient: upload.twitter.com + media_entities (если POC прошёл) |
| 14 | QueueManager: mediaPath через pipeline |
| 15 | Integration tests: upload + post с картинкой |

### Phase 4: Autonomous + метрики

| # | Задача |
|---|--------|
| 16 | Meme в autonomous pipeline (config: `MEME_RATE = 0.3`) |
| 17 | Engagement tracking: posts with meme vs without в learning pipeline |
| 18 | Template performance tracking: какие шаблоны = лучший engagement |
| 19 | Recency soft-guidance в промпте ("последние 5 постов были text_only") |
| 20 | Monthly template refresh workflow |
