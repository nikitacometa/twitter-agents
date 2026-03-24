# Visual Card Generation for Twitter Bots

Research date: 2026-03-24. Focus: Node.js/TypeScript, VPS (2 vCPU / 8 GB RAM), crypto/DeFi context.

---

## Вердикт

**Рекомендованный стек: Satori + resvg-js + sharp.**

Puppeteer — жизнеспособная альтернатива только если нужен pixel-perfect рендеринг сложных CSS (flexbox с `gap`, `grid`, градиенты через `background` shorthand). Для stat-карточек и roast-карточек CSS-подмножества Satori достаточно, а RAM-footprint в 10x меньше.

---

## 1. Сравнение подходов

| Критерий | Satori + resvg-js | Puppeteer screenshot | node-canvas |
|---|---|---|---|
| **Время генерации** | ~50–150 ms (full pipeline) | 300–800 ms (с warm browser) | 20–80 ms |
| **RAM на инстанс** | ~30–60 MB Node process | 150–250 MB Chromium process | ~40 MB |
| **Зависимости** | Pure JS + Rust WASM/NAPI | Chromium binary (~300 MB) | libcairo, libpango (native) |
| **CSS поддержка** | Subset: flex, basic box model | Full browser CSS | Programmatic только |
| **Шрифты** | TTF / OTF / WOFF (не WOFF2) | Любые системные | TTF через `registerFont` |
| **Надёжность на VPS** | Высокая, нет zombie-процессов | Средняя (memory leaks, zombie Chrome) | Высокая |
| **Кривая обучения** | JSX / HTML-like | HTML + CSS (знакомо) | Canvas 2D API |
| **Брендинг / темплейты** | JSX компоненты | HTML файлы | Программный код |

### Почему не Puppeteer на VPS

Chromium: 150–250 MB RAM на инстанс. При конкурентных запросах (3–5 страниц) VPS на 8 GB начинает свапать. Критическая проблема — zombie-процессы: если `browser.close()` не вызван (краш, таймаут), Chrome процессы накапливаются до OOM. В production требует внешнего pool-менеджера (например, `puppeteer-cluster`) и watchdog.

### Почему не node-canvas

`node-canvas` — обёртка над libcairo через N-API. Быстрая (~20–80 ms), но шаблоны пишутся как программный код Canvas 2D API — сложно поддерживать дизайн. Нет JSX-like декларативного синтаксиса. Подходит для генерации графиков (Chart.js SSR), не для brand-карточек с текстом.

---

## 2. Satori — детали реализации

### Pipeline

```
JSX/HTML string → satori() → SVG string → new Resvg(svg) → .render().asPng() → Buffer
```

### Npm пакеты

```json
{
  "satori": "^0.12.x",
  "satori-html": "^0.3.2",
  "@resvg/resvg-js": "^2.6.x",
  "sharp": "^0.33.x"
}
```

`sharp` не участвует в самом рендеринге — используется для post-processing: ресайз, конвертация в JPEG, оптимизация размера файла перед загрузкой в Twitter.

### Базовый пример (TypeScript)

```typescript
import { html } from 'satori-html';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';

const fontData = readFileSync('./fonts/Inter-Bold.ttf');

export async function generateCard(data: RoastCardData): Promise<Buffer> {
  const markup = html(`
    <div style="display: flex; width: 1200px; height: 630px; background: #0d0d0d; padding: 48px; font-family: Inter;">
      <div style="display: flex; flex-direction: column; gap: 24px; color: #fff;">
        <div style="font-size: 48px; font-weight: 700; color: #ff4444;">
          ${data.targetHandle}
        </div>
        <div style="font-size: 28px; line-height: 1.4; color: #e0e0e0;">
          ${data.roastText}
        </div>
      </div>
    </div>
  `);

  const svg = await satori(markup, {
    width: 1200,
    height: 630,
    fonts: [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }],
  });

  const resvg = new Resvg(svg);
  return resvg.render().asPng();
}
```

### Ограничения CSS в Satori

Не поддерживается: `display: grid`, `gap` (в старых версиях), `background` shorthand с несколькими слоями, `position: fixed`, CSS-переменные, `overflow: scroll`, HTML-теги `<table>`, `<input>`. Все layouts строятся на `display: flex`.

Поддерживается: линейные и радиальные градиенты (`backgroundImage`), `border-radius`, `box-shadow`, `opacity`, `transform`, emoji (через внешний resolver), inline SVG.

### Шрифты — критично

Satori требует, чтобы шрифт был передан явно. Системные шрифты не используются. Для кириллицы нужен TTF/OTF с кириллическим charset. Рекомендуется загружать шрифт один раз при старте сервиса и держать в памяти — повторная загрузка с диска на каждый запрос добавляет I/O.

### Кэширование

Для stat-карточек с одинаковыми данными — простой `Map<string, Buffer>` по хэшу параметров. Для динамического контента (roast-карточки уникальны) кэш не нужен.

---

## 3. Производительность

### Satori + resvg-js

- resvg-js рендеринг SVG → PNG: **~56 ms** на тестовом SVG (данные из resvg-js README)
- Satori SVG generation: обычно **~20–80 ms** в зависимости от сложности layout
- **Итого full pipeline: ~80–150 ms** на карточку 1200×630
- resvg-js опережает sharp (12 vs 9 ops/sec) и svg2img (12 vs 6 ops/sec) на SVG рендеринге

### sharp для оптимизации

После получения PNG-буфера из resvg-js:
```typescript
const optimized = await sharp(pngBuffer)
  .resize(1200, 630)
  .jpeg({ quality: 85, progressive: true })
  .toBuffer();
// Типичный результат: PNG 1200x630 ~800KB → JPEG ~120-180KB
```

Twitter лимиты: изображения до **5 MB**, GIF до **15 MB**. PNG 1200×630 укладывается, но JPEG предпочтительнее — меньше размер, быстрее upload.

---

## 4. Форматы визуального контента в крипто-Twitter

### Что постят успешные боты

**Whale Alert / tracker-боты:**
- Большой заголовок: `🚨 $X,XXX,XXX` или адрес кошелька
- Подзаголовок: направление транзакции (from/to)
- Фон: тёмный (#0d0d0d или navy), акцент — красный/зелёный
- Логотип токена или сети (Base, ETH)
- Timestamp

**DeFi dashboard боты (DeFiLlama-style):**
- "Protocol Revenue Today: $X.XX M"
- Мини-бар-чарт за 7 дней (canvas или SVG)
- Топ-5 протоколов списком с цветными индикаторами
- Watermark бота в углу

**Roast / accountability форматы (релевантно для $BEEF):**

| Формат | Описание | Элементы |
|---|---|---|
| **Quote card** | Цитата из твита цели + score | Аватар, хэндл, оригинальный текст (truncated), roast score / grade |
| **Receipt** | "Evidence" — скриншот или данные в виде чека | Монохромный, шрифт monospace, строки "PROMISES: X / DELIVERED: 0" |
| **Stats card** | Числовые данные о проекте | TVL, holders, price change 30d, подпись "Roasted by @0xBeefer" |
| **Comparison** | Side-by-side два проекта | "SAID vs REALITY" в два столбца |
| **Tier list** | Ранжирование | S/A/B/C/D тайлы с логотипами |

### Рекомендованные размеры

- **1200 × 630 px** — стандарт OG image, хорошо отображается в превью
- **1080 × 1080 px** — квадрат, для standalone постов
- **1500 × 500 px** — горизонтальный баннер (для thread-заголовков)

---

## 5. Twitter API — загрузка медиа

### Текущий статус (март 2025 — актуально)

v1.1 endpoint `/media/upload` **депрекирован** с 31 марта 2025. Мигрировать на `/2/media/upload`.

### `/2/media/upload` — rate limits

| Endpoint | Free tier | Basic tier |
|---|---|---|
| `POST /2/media/upload` | 85 req/24h per app+user | Higher |
| `POST /2/media/upload/initialize` | 34 req/24h | Higher |
| `POST /2/media/upload/:id/append` | 170 req/24h | Higher |
| `POST /2/media/upload/:id/finalize` | 34 req/24h | Higher |

Для бота с несколькими постами в день Free tier достаточен.

### Требования аутентификации

Обязательно: **user context OAuth 2.0** с scope `media.write`. App-only auth (Bearer token) → 403. Это значит нужен access token конкретного аккаунта (@0xBeefer).

### Chunked upload

Для файлов > 5 MB (GIF, видео) — chunked upload через INIT → APPEND → FINALIZE. Для PNG/JPEG карточек (< 1 MB) — simple upload достаточен.

### Alt text

```typescript
// После upload, перед tweet
await client.v2.createMediaMetadata(mediaId, {
  alt_text: { text: 'Roast card for @ProjectName — generated by @0xBeefer' }
});
```

Максимум 1000 символов. Twitter рекомендует, алгоритм учитывает.

---

## 6. agent-twitter-client (cookie auth) — постинг с изображением

Библиотека поддерживает медиа нативно:

```typescript
import { Scraper } from 'agent-twitter-client';

const scraper = new Scraper();
await scraper.login(username, password);
// или через cookies

const imageBuffer: Buffer = await generateCard(data); // satori pipeline

await scraper.sendTweet(
  'Roast text here',
  undefined, // replyToTweetId
  [
    {
      data: imageBuffer,
      mediaType: 'image/png', // или 'image/jpeg'
    }
  ]
);
```

Ограничения: макс. 4 изображения на твит, 1 видео, макс. размер видео 512 MB.

Важно: cookie auth — это обход официального API. При Playwright-постинге (текущий режим $BEEF) изображения можно прикрепить через `page.setInputFiles()` на input[type=file] в compose-окне.

---

## 7. Puppeteer — когда всё же имеет смысл

Если нужно рендерить HTML-шаблоны с полным CSS (сложные layout, web fonts через Google Fonts CDN, CSS custom properties) — Puppeteer оправдан, но с обязательными митигациями:

**Рекомендуемые аргументы запуска:**
```typescript
const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',  // критично для VPS с малым /dev/shm
    '--disable-gpu',
    '--no-zygote',
    '--single-process',          // снижает RAM ценой надёжности
  ],
});
```

**Паттерн с пулом и keep-alive браузером:**
```typescript
// Не закрывать browser после каждого screenshot
// Переиспользовать browser, создавать новый page для каждого запроса
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });
const screenshot = await page.screenshot({ type: 'jpeg', quality: 85 });
await page.close(); // page закрывать, browser — нет
```

**Типичное потребление RAM на VPS:**
- 1 Chromium инстанс: ~150–250 MB
- 5 параллельных page: ~400–600 MB
- На 8 GB RAM: safe limit ~10–15 параллельных страниц

---

## 8. Рекомендуемая архитектура для $BEEF

### Стек

```
satori + satori-html   → SVG generation (JSX templates)
@resvg/resvg-js        → SVG → PNG (Rust, ~56ms)
sharp                  → PNG → JPEG optimization (~10ms)
agent-twitter-client   → media upload + tweet post
```

### Структура модуля

```
beef/src/
  images/
    generator.ts       # generateCard(data): Promise<Buffer>
    templates/
      roast-card.ts    # JSX template для roast
      stats-card.ts    # JSX template для stats
      receipt.ts       # "Receipt" format
    fonts.ts           # Загрузка шрифтов при старте (singleton)
```

### Шрифты — singleton паттерн

```typescript
// fonts.ts
import { readFileSync } from 'fs';
import path from 'path';

export const fonts = [
  {
    name: 'Inter',
    data: readFileSync(path.join(__dirname, '../../assets/fonts/Inter-Bold.ttf')),
    weight: 700 as const,
    style: 'normal' as const,
  },
  {
    name: 'Inter',
    data: readFileSync(path.join(__dirname, '../../assets/fonts/Inter-Regular.ttf')),
    weight: 400 as const,
    style: 'normal' as const,
  },
];
```

Загружается один раз при старте процесса. Satori получает `fonts` массив при каждом вызове — это ссылки на уже загруженные Buffer, не повторное I/O.

### PFP интеграция

Для добавления аватара бота на карточку:

```typescript
// Fetch аватар при старте, кэшировать как base64 data URL
const avatarUrl = 'https://pbs.twimg.com/profile_images/.../photo.jpg';
const response = await fetch(avatarUrl);
const buffer = await response.arrayBuffer();
const base64 = Buffer.from(buffer).toString('base64');
export const BOT_AVATAR_DATA_URL = `data:image/jpeg;base64,${base64}`;

// В шаблоне:
// <img src={BOT_AVATAR_DATA_URL} style="border-radius: 50%; width: 48px; height: 48px;" />
```

Satori поддерживает `data:` URL для изображений. Внешние URL (`https://`) — поддерживаются, но требуют fetch во время рендеринга, что добавляет latency и точку отказа.

---

## 9. Источники

- [satori npm](https://www.npmjs.com/package/satori) — версии, описание
- [resvg-js GitHub](https://github.com/thx/resvg-js) — бенчмарки (12 ops/s vs 9 ops/s sharp), timing 56ms
- [Generate Image From HTML Using Satori and Resvg — DEV Community](https://dev.to/anasrin/generate-image-from-html-using-satori-and-resvg-46j6) — полный code example
- [satori-node — пример standalone Node сервера](https://github.com/yusufff/satori-node) — Fastify + in-memory кэш
- [Bannerbear — 8 Tips for Faster Puppeteer Screenshots](https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/) — production оптимизации
- [X Dev Community — /2/media/upload Free Tier](https://devcommunity.x.com/t/what-are-the-rate-limits-for-media-upload-when-used-with-twitter-api-v2-free-tier/245725) — rate limits
- [X Dev Community — OAuth 2.0 для media upload](https://devcommunity.x.com/t/how-to-upload-media-to-twitter-api-v2-using-oauth-2-0/238518) — user context requirement
- [agent-twitter-client-mod](https://github.com/Shrey00/agent-twitter-client-mod) — sendTweet с media buffer API
- [sharp npm](https://www.npmjs.com/package/sharp) — image optimization
