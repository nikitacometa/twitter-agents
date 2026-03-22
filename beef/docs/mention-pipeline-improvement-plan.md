# Mention Pipeline: анализ и план улучшений

## Текущие проблемы (по приоритету)

### P1: Mention roasts получают урезанный CreativeMemory

В `queue-manager.ts` вызов `generateRoasts()` для mentions передаёт `undefined` вместо `configRepo`, `exampleRepo`, `patternRepo`. Farm pipeline передаёт все четыре. Результат — mention roasts генерируются **без**:
- Style supplement (из `/analyze`)
- Внешних curated examples
- Learned techniques из pattern repo
- Worst farm attempts как reject examples

**Fix:** передать все 4 репозитория. Одна строка на параметр.

### P2: Scenario 1 ("roast @X") — профиль цели не загружается

`buildProfileContext()` работает для S2 (parent tweet) и S3 (tagged handle), но для S1 (explicit "roast @bitcoin") — нет. `extractHandleFromContext()` ищет `|handle:@(\w+)` в context string, но S1 не кодирует handle в этом формате.

**Fix:** добавить `|handle:@target` в context string при enqueue S1, или распознавать `@`-prefix в `targetName`.

### P3: Контекст запроса не доходит до LLM

LLM не знает:
- Кто попросил роаст и с какой тональностью
- Полный текст mention (что написал requester)
- Что это вообще mention-triggered, а не autonomous roast

Если кто-то пишет `@0xBeefer this guy @vitalik just said X is NGMI`, LLM не видит "said X is NGMI" как готовый angle.

### P4: Parent tweet обрезается до 120 символов

`enqueueParentTweetRoast` → `targetName = tweet by @author: "first 120 chars"`. Полный текст (280 chars) теряется. Это главный roast material для S2.

### P5: Единый `approveMode` для всех типов постов

Нет возможности автоматически постить mention-replies, но вручную модерировать feed-посты.

---

## Approve mode split: `approveMode` + `approveMentions`

### Маппинг источников к флагам

| RoastSource | Тип поста | Флаг |
|---|---|---|
| `autonomous` | Feed (оригинальный твит) | `approveMode` |
| `burn_request` | Feed | `approveMode` |
| `mention` | Reply на чужой твит | `approveMentions` |
| `reply_guy` | Reply в чужом треде | `approveMentions` |
| `casual_reply` | Reply на упоминание | `approveMentions` |

### Изменения

1. **`common/types/index.ts`** — добавить `approveMentions: boolean` в `RuntimeConfig`
2. **`config.repository.ts`** — добавить `approveMentions` в `getRuntime()`, метод `setApproveMentions()`
3. **`queue-manager.ts`** — заменить `isApproveMode()` на `requiresApproval(source: RoastSource)`:
   ```
   feed sources (autonomous, burn_request) → runtime.approveMode
   reply sources (mention, reply_guy, casual_reply) → runtime.approveMentions
   ```
   Передать `source` в `postOrSkip()`.
4. **`admin/bot.ts`** — команда `/approve_mentions on|off`, обновить `/status` и `/help`
5. **Backward compatibility:** если `approve_mentions` не задан в DB, наследовать значение `approve_mode`

### Нотификации

- `approveMentions = on` → текущее поведение (Post/Skip кнопки)
- `approveMentions = off` → авто-пост + статусное сообщение `Posted reply to @X: [text]` без кнопок

---

## Data enrichment: что добавить

### Quick wins (существующая инфраструктура)

| # | Что | Impact | Effort |
|---|-----|--------|--------|
| QW-1 | Полный CreativeMemory для mentions (передать 4 repo) | Высокий | 4 строки кода |
| QW-2 | Profile enrichment для scenario 1 | Средний | ~20 строк |
| QW-3 | Requestor context в промпт (кто попросил, follower count) | Средний | ~30 строк |
| QW-4 | Полный parentTweetText (280 chars вместо 120) | Средний | ~15 строк |

### Medium effort (новые API calls)

| # | Что | Impact | Effort |
|---|-----|--------|--------|
| ME-1 | Thread context depth-2 (grandparent tweet) | Средний | ~50 строк |
| ME-2 | URL extraction из tweets → передать агенту для WebFetch | Высокий | ~40 строк |
| ME-3 | Enriched TwitterProfile (followingCount, joined, pinnedTweet) | Средний | ~30 строк |
| ME-4 | Quote tweet enrichment | Низкий | ~40 строк |

### Отложить (high effort, low ROI сейчас)

- Engagement-weighted response (разные модели для KOL vs аноним)
- Requester profiling (история запросов конкретного юзера)
- Conversation history awareness (не повторять углы в треде)

---

## Approval UI improvement

Текущий approval в Telegram не показывает:
- Кто попросил роаст
- Текст оригинального mention
- Ссылку на твит, на который будет reply

**Добавить** в `notifyQueueResult`:
- Маркер типа (feed / reply)
- Текст mention / parent tweet
- Ссылку на reply target tweet

---

## Декомпозиция задач

### Phase 1: Approve split + quick wins (приоритет)

| Task | Файлы | Описание |
|------|-------|----------|
| T1 | types, config.repo, queue-manager | `approveMentions` флаг: тип, DB, routing logic |
| T2 | admin/bot | Команда `/approve_mentions`, обновить `/status`, `/help` |
| T3 | queue-manager, roast-generator | Передать все 4 repo в `generateRoasts` для mentions |
| T4 | mention-handler, queue-manager | Profile enrichment для scenario 1 (добавить `\|handle:` в context) |
| T5 | mention-handler, queue-manager | Полный parentTweetText через context string |
| T6 | queue-manager, prompt-builder | Requestor context в промпт (by, follower count) |
| T7 | admin/bot, index.ts | Улучшить approval UI: маркер типа, context |
| T8 | database.spec.ts, tests | Обновить тесты |

### Phase 2: Data enrichment (после Phase 1)

| Task | Файлы | Описание |
|------|-------|----------|
| T9 | scraper-client, mention-handler | URL extraction из tweets для передачи агенту |
| T10 | scraper-client, queue-manager | Thread depth-2 (grandparent tweet fetch) |
| T11 | scraper-client, twitter-client.interface | Enriched TwitterProfile (followingCount, joined, pinnedTweet) |

---

## Оценка эффекта

**Phase 1** закрывает главный quality gap: mention roasts получают ту же богатую CreativeMemory и profile data, что и farm roasts. Плюс операционная гибкость с раздельным approve.

**Phase 2** добавляет contextual intelligence: ссылки из твитов, thread context, enriched profiles — это данные, которые делают roasts ситуативными и невозможными без бота (конкурентное преимущество).
