# Twitter/X API v2 Reference для $BEEF

Исследование проведено 2026-03-24. Охватывает все аспекты, необходимые для максимального контекста при генерации roast-контента.

## Ключевые выводы

- **Basic tier ($200/mo)** даёт ~15 000 reads/month — при активном farming это жёсткое ограничение
- Один вызов `GET /2/tweets/:id` с полным набором полей возвращает исчерпывающий профиль: текст, метрики, entities, медиа, автор, referenced tweets
- `conversation_id` как search operator — лучший способ вытащить весь тред одним запросом
- `note_tweet` обязателен: без него длинные посты (>280 символов) обрезаются
- `context_annotations` — бесплатный топик/entity classifier от X; полезен для определения ниши цели

---

## 1. Tweet Fields

**Endpoint по умолчанию возвращает только:** `id`, `text`, `edit_history_tweet_ids`

### Полный список tweet.fields

| Поле | Тип | Что содержит |
|------|-----|--------------|
| `id` | string | ID твита |
| `text` | string | Текст (до 280 символов). Длинные посты могут быть обрезаны — см. `note_tweet` |
| `note_tweet` | object | Полный текст long-form постов (до 25 000 символов, добавлено Aug 2024). Содержит `note_tweet.text` |
| `author_id` | string | User ID автора — требует expansion `author_id` для получения объекта |
| `conversation_id` | string | ID исходного твита треда. У root-твита равен его собственному `id` |
| `created_at` | ISO 8601 | Время публикации |
| `in_reply_to_user_id` | string | User ID оригинального автора, если это reply |
| `referenced_tweets` | array | Связанные твиты: `[{id, type}]`, где type = `retweeted` / `quoted` / `replied_to` |
| `entities` | object | Parsed entities из текста: `hashtags`, `urls`, `mentions`, `cashtags`, `annotations` |
| `attachments` | object | Ссылки на медиа (`media_keys`) и поллы (`poll_ids`) |
| `public_metrics` | object | `retweet_count`, `reply_count`, `like_count`, `quote_count`, `impression_count` |
| `non_public_metrics` | object | `url_link_clicks`, `user_profile_clicks`, `impression_count` — только для своих постов |
| `organic_metrics` | object | Органические метрики — только для своих постов |
| `context_annotations` | array | Автоматическая разметка топиков/entities: `[{domain: {id, name}, entity: {id, name}}]` |
| `lang` | string | Определённый язык (`en`, `ru`, и т.д.) |
| `possibly_sensitive` | boolean | Флаг NSFW-контента |
| `reply_settings` | string | `everyone` / `mentioned_users` / `followers` |
| `source` | string | Приложение, с которого опубликовано (`Twitter Web App`, `TweetDeck`, и т.д.) |
| `geo` | object | Геотег (если был установлен) |
| `withheld` | object | Информация о блокировке по регионам |
| `edit_controls` | object | Оставшееся время и количество правок |
| `community_id` | string | ID сообщества (добавлено Nov 2024) |
| `card_uri` | string | URI для card-контента (превью ссылок) |
| `display_text_range` | array | `[start, end]` — диапазон отображаемого текста |
| `media_metadata` | array | Дополнительные метаданные медиавложений |

### public_metrics — детали

```json
"public_metrics": {
  "retweet_count": 142,
  "reply_count": 38,
  "like_count": 891,
  "quote_count": 21,
  "impression_count": 45200
}
```

`impression_count` находится в `public_metrics` и доступен без user context auth (Bearer Token).
`bookmark_count` в официальной документации не фигурирует как sub-field `public_metrics` (по состоянию на март 2026).

---

## 2. User Fields

**По умолчанию:** `id`, `name`, `username`

### Полный список user.fields

| Поле | Тип | Что содержит |
|------|-----|--------------|
| `id` | string | User ID |
| `name` | string | Display name |
| `username` | string | Handle без @ |
| `description` | string | Биография профиля |
| `created_at` | ISO 8601 | Дата регистрации аккаунта |
| `url` | string | Ссылка из профиля |
| `location` | string | Локация (свободный текст) |
| `profile_image_url` | string | URL аватара (добавлено Jun 2024) |
| `profile_banner_url` | string | URL баннера профиля |
| `pinned_tweet_id` | string | ID закреплённого твита — можно expand через `pinned_tweet_id` |
| `public_metrics` | object | `followers_count`, `following_count`, `tweet_count`, `listed_count` |
| `verified` | boolean | Флаг верификации (устаревший — см. `verified_type`) |
| `verified_type` | string | `blue` / `business` / `government` / `none` |
| `subscription_type` | string | `None` / `Basic` / `Premium` / `PremiumPlus` — только для OAuth user context |
| `protected` | boolean | Приватный аккаунт |
| `entities` | object | Parsed entities из bio и profile URL |
| `most_recent_tweet_id` | string | ID последнего твита |
| `is_identity_verified` | boolean | Верификация личности |
| `parody` | boolean | Аккаунт-пародия |
| `affiliation` | object | Данные об аффилиации (организация и т.п.) |
| `connection_status` | array | Статус связи с аутентифицированным юзером: `following`, `followed_by`, `blocking`, `muting` |
| `withheld` | object | Блокировка по регионам |
| `receives_your_dm` | boolean | Может ли юзер получать DM |

### user.public_metrics — детали

```json
"public_metrics": {
  "followers_count": 142800,
  "following_count": 312,
  "tweet_count": 8940,
  "listed_count": 450
}
```

---

## 3. Media Fields

Медиа — вложенный объект, **не возвращается по умолчанию**. Требует:
1. `expansions=attachments.media_keys` в запросе
2. `media.fields=...` для дополнительных полей

Объект появляется в `includes.media[]`, не в основном tweet-объекте.

### Полный список media.fields

| Поле | Тип | Что содержит |
|------|-----|--------------|
| `media_key` | string | Уникальный ID медиа |
| `type` | string | `photo` / `video` / `animated_gif` |
| `url` | string | Прямая ссылка на файл (для фото) |
| `preview_image_url` | string | URL превью (статичный thumbnail для видео/gif) |
| `width` | integer | Ширина в пикселях |
| `height` | integer | Высота в пикселях |
| `duration_ms` | integer | Длительность видео в миллисекундах |
| `alt_text` | string | Описание для screen readers (до 1000 символов) |
| `variants` | array | Массив форматов: `[{content_type, bitrate, url}]` — для видео и gif |
| `public_metrics` | object | `view_count` для видео |
| `non_public_metrics` | object | Покадровая статистика — только для своих постов |
| `organic_metrics` | object | Органические просмотры — только для своих постов |

### Как получить изображения

```
?expansions=attachments.media_keys
&media.fields=url,preview_image_url,type,width,height,alt_text,variants
```

- **Фото**: `url` содержит прямую ссылку на изображение
- **Видео**: `url` может быть пустым, `preview_image_url` — thumbnail, `variants` — список MP4/M3U8 по bitrate
- **GIF**: `preview_image_url` — thumbnail, `variants` — MP4-файл

---

## 4. Контекст треда и разговора

### conversation_id как поисковый оператор

Все реплаи в треде имеют один `conversation_id` = ID исходного твита. Это позволяет вытащить весь тред одним запросом:

```
GET /2/tweets/search/recent
  ?query=conversation_id:1234567890
  &tweet.fields=author_id,text,created_at,in_reply_to_user_id,public_metrics
  &expansions=author_id,referenced_tweets.id,referenced_tweets.id.author_id
  &sort_order=recency
```

Возвращает все реплаи в обратном хронологическом порядке с пагинацией.

### referenced_tweets для получения parent tweet

```
?tweet.fields=referenced_tweets
&expansions=referenced_tweets.id,referenced_tweets.id.author_id
&media.fields=url,preview_image_url
```

Ограничение: expansion `referenced_tweets.id` разворачивает твит на один уровень. Для получения цепочки (grandparent → parent → child) нужно делать отдельный запрос к каждому родительскому `id`.

### Что не работает напрямую

- Нет endpoint для "дать мне весь тред" в виде дерева — нужно строить самостоятельно через `conversation_id` search + `referenced_tweets`
- Media в referenced tweets может не возвращаться (известное ограничение API)

---

## 5. User Timeline

```
GET /2/users/:id/tweets
```

### Параметры

| Параметр | Значения | Описание |
|----------|----------|----------|
| `max_results` | 5–100 | По умолчанию 10 |
| `exclude` | `replies,retweets` | Фильтрация |
| `start_time` / `end_time` | ISO 8601 | Временной диапазон |
| `since_id` / `until_id` | tweet ID | Диапазон по ID |
| `pagination_token` | string | Пагинация |

- Возвращает до **3 200 последних твитов** пользователя
- Reverse-chronological order
- Поддерживает все `tweet.fields`, `user.fields`, `media.fields`, `expansions`

### Rate limit

`GET /2/users/:id/tweets` — **10 000 req/15min** per app (самый щедрый лимит среди read-эндпоинтов).

---

## 6. Rate Limits — Basic Tier ($200/mo)

### Месячный cap

| Лимит | Значение |
|-------|----------|
| Posts читать/месяц | **~15 000** |
| Posts писать/месяц | **~50 000** |

Источники расходятся: официальная документация говорит "10 000 posts/month", ряд third-party источников — 15 000. По практике: Basic tier = ~10 000–15 000 read quota/month.

### Per-15-minute limits

| Endpoint | Per App | Per User |
|----------|---------|----------|
| `GET /2/tweets` (batch lookup) | 3 500 | 5 000 |
| `GET /2/tweets/:id` | 450 | 900 |
| `GET /2/tweets/search/recent` | 450 | 300 |
| `GET /2/users/:id/tweets` | 10 000 | 900 |
| `GET /2/users/:id` | 300 | 900 |
| `GET /2/users/by/username/:username` | 300 | 900 |
| `POST /2/tweets` (write) | 10 000/24h per app | 100/15min per user |

### Важные ограничения Basic tier

- **7-day search history only** — `search/recent` работает только за последние 7 дней
- Нет Streaming (filtered stream) — только в Pro ($5 000/mo)
- Нет исторического поиска — только в Enterprise
- `non_public_metrics` и `organic_metrics` — только для собственных постов через user auth
- **Pay-as-you-go** (Feb 2026): X запустил PAYG-модель как альтернативу фиксированным тирам

---

## 7. Expansions — полный список

```
expansions=
  author_id,
  in_reply_to_user_id,
  referenced_tweets.id,
  referenced_tweets.id.author_id,
  referenced_tweets.id.attachments.media_keys,
  attachments.media_keys,
  attachments.poll_ids,
  entities.mentions.username,
  entities.note.mentions.username,
  geo.place_id,
  pinned_tweet_id,
  article.cover_media,
  article.media_entities,
  attachments.media_source_tweet
```

Расширенные объекты попадают в `includes.{}` в ответе, не в основной объект.

---

## 8. Максимальный контекст за один запрос

Оптимальный запрос для roast-генерации по URL твита:

```
GET /2/tweets/:id
  ?tweet.fields=
    text,
    note_tweet,
    author_id,
    created_at,
    conversation_id,
    in_reply_to_user_id,
    referenced_tweets,
    entities,
    attachments,
    public_metrics,
    context_annotations,
    lang,
    possibly_sensitive,
    reply_settings,
    source
  &user.fields=
    name,
    username,
    description,
    created_at,
    location,
    profile_image_url,
    profile_banner_url,
    pinned_tweet_id,
    public_metrics,
    verified_type,
    subscription_type,
    entities,
    affiliation
  &media.fields=
    type,
    url,
    preview_image_url,
    alt_text,
    width,
    height,
    duration_ms,
    variants
  &expansions=
    author_id,
    referenced_tweets.id,
    referenced_tweets.id.author_id,
    referenced_tweets.id.attachments.media_keys,
    attachments.media_keys,
    entities.mentions.username,
    in_reply_to_user_id
```

Этот запрос возвращает за **1 API call**:
- Полный текст (включая long-form через `note_tweet`)
- Автора с биографией, follower count, датой регистрации, верификацией
- Медиа-вложения с прямыми URL изображений и thumbnails видео
- Referenced tweets (retweet source, цитируемый твит, родительский реплай) с авторами
- Топики и entity-разметку через `context_annotations`
- Метрики вовлечённости (likes, RT, replies, impressions)
- Entities: hashtags, cashtags, mentions, URLs с expanded/unwound версиями

---

## 9. Малоизвестные и недавно добавленные поля

### note_tweet (Aug 2024)
Длинные посты (X Premium, до 25 000 символов). Без этого поля `text` возвращает обрезанный вариант. Всегда включать в запрос.

```json
"note_tweet": {
  "text": "Полный текст длинного поста...",
  "entities": { "urls": [], "mentions": [] }
}
```

### context_annotations
Бесплатная NLP-разметка от X. Домен + entity:

```json
"context_annotations": [
  {
    "domain": { "id": "131", "name": "Unified Twitter Taxonomy" },
    "entity": { "id": "847895936505233408", "name": "Cryptocurrency" }
  }
]
```

Полезно для определения ниши жертвы: Crypto, DeFi, NFT, VC, политик, и т.д.

### verified_type
`blue` / `business` / `government` / `none` — отличает платную верификацию от государственной.

### subscription_type
`None` / `Basic` / `Premium` / `PremiumPlus`. Требует OAuth 2.0 user context. Позволяет понять, платит ли юзер за X Premium.

### affiliation (Aug 2024)
Organizational affiliation badge. Возвращает массив `user_ids` аффилированных организаций (изменено Feb 2025).

### community_id (Nov 2024)
ID сообщества, в котором опубликован твит.

### connection_status
Статус отношений с аутентифицированным аккаунтом: `following`, `followed_by`, `blocking`, `muting`.

### entities.urls — расширенные данные
URL entities содержат не только саму ссылку, но и:
- `expanded_url` — реальный URL после редиректа
- `unwound_url` — финальный URL после всех редиректов
- `title` — заголовок страницы
- `description` — мета-описание страницы
- `images` — preview images ссылки с размерами

---

## 10. Стратегия для $BEEF: максимум контекста в рамках квоты

### Проблема с 15 000 reads/month

При farming 7–10 targets/день x 10–15 твитов на target = **70–150 reads/день** только на farming.
Плюс user timeline: 3–5 calls/target = ещё 20–50. Месячная квота уйдёт за ~2 недели активной работы.

### Рекомендации

1. **Batch lookup** `GET /2/tweets` (не одиночные `:id`) — принимает до 100 tweet IDs за раз, стоит 1 запрос из квоты вместо 100
2. **Кешировать user profiles** — bio, follower count меняются редко. Один call/user раз в неделю достаточно
3. **Conversation_id search** только для целевых тредов (когда нужен контекст реплаев), не массово
4. **User timeline**: максимум 20–30 последних твитов достаточно для паттернов, не вытаскивать 3200
5. **Приоритет полей**: `note_tweet`, `context_annotations`, `public_metrics`, `entities` — наиболее информативны для roast-генерации
6. **Pay-as-you-go** (Feb 2026): X запустил PAYG-модель как альтернативу фиксированным тирам — возможно, выгоднее при нерегулярном использовании

---

## Источники

- [X API Rate Limits](https://docs.x.com/x-api/fundamentals/rate-limits) — docs.x.com, 2026-03-24
- [X API Data Dictionary](https://docs.x.com/x-api/fundamentals/data-dictionary) — docs.x.com, 2026-03-24
- [X API Fields Reference](https://docs.x.com/x-api/fundamentals/fields) — docs.x.com, 2026-03-24
- [X API Metrics](https://docs.x.com/x-api/fundamentals/metrics) — docs.x.com, 2026-03-24
- [Conversation ID](https://docs.x.com/x-api/fundamentals/conversation-id) — docs.x.com, 2026-03-24
- [GET /2/users/:id/tweets](https://docs.x.com/x-api/users/get-posts) — docs.x.com, 2026-03-24
- [X API Changelog](https://docs.x.com/changelog) — docs.x.com, 2026-03-24
- [X API Pricing 2026](https://postproxy.dev/blog/x-api-pricing-2026/) — postproxy.dev, 2026-03-24
- [Twitter API v2 Pricing Tiers](https://www.xpoz.ai/blog/guides/understanding-twitter-api-pricing-tiers-and-alternatives/) — xpoz.ai, 2026-03-24
