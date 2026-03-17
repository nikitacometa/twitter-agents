# Farcaster Integration — $BEEF Bot

**Дата:** 16 марта 2026
**Статус:** Design document
**Цель:** кросс-постинг роастов Twitter → Farcaster + reply на mentions в Farcaster

---

## Зачем

1. **Insurance при Twitter бане** — Farcaster становится primary мгновенно
2. **Crypto-native аудитория** — 40K DAU, боты = first-class citizens, нет bot-detection
3. **Бесплатный охват** — $5/год за 5000 cast'ов. 10 постов/день = 500 дней
4. **Каналы** — `/crypto`, `/base`, `/ai` — встроенная таргетированная дистрибуция
5. **Катализаторы** — Jesse Pollak RT, challenge AIXBT, Clanker/Bankr ecosystem

---

## Stack

| Компонент | Выбор | Почему |
|-----------|-------|--------|
| SDK | `@neynar/nodejs-sdk` v3.137+ | Official, 98.9% TypeScript, MIT |
| Auth | Neynar managed signer | Проще чем on-chain вручную |
| Mentions | Neynar webhooks | Не считается в rate limit, real-time |
| Альтернатива | — | Self-hosted Hubble = 4 CPU + 16GB RAM, overkill |

---

## Одноразовые затраты

| Статья | Сумма |
|--------|-------|
| Farcaster аккаунт (Warpcast) | $5 |
| Signer approval (OP ETH gas) | ~$2 |
| **Итого** | **~$7** |

## Регулярные затраты

| Статья | Сумма |
|--------|-------|
| Neynar API (free tier или Starter) | $0–100/мес |
| Farcaster storage (5K casts/год) | $5/год |
| **Итого** | **$5–105/мес** |

---

## Архитектура

```
                    ┌─────────────────────┐
                    │    Roast Engine      │
                    │  (generates roast)   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Content Filter    │
                    │  (TOS, length, etc) │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Post Dispatcher   │
                    │                     │
                    ├──────────┬──────────┤
                    │          │          │
             ┌──────▼───┐ ┌───▼──────┐   │
             │ Twitter   │ │ Farcaster│   │
             │ Client    │ │ Client   │   │
             │ (primary) │ │ (mirror) │   │
             └───────────┘ └──────────┘   │
                                          │
                    ┌─────────────────────┘
                    │
             ┌──────▼──────┐
             │  Farcaster   │
             │  Webhook     │
             │  Listener    │
             │ (mentions)   │
             └─────────────┘
```

**Post Dispatcher** — единая точка публикации. Получает готовый roast, отправляет в Twitter + Farcaster параллельно. Если один канал падает — второй продолжает.

---

## Код: FarcasterClient

```typescript
// src/farcaster/farcaster.client.ts

import type { Logger } from 'pino';

interface FarcasterConfig {
  apiKey: string;
  signerUuid: string;
  defaultChannelId?: string; // e.g. "crypto"
}

interface CastResult {
  hash: string;
  url: string;
}

export class FarcasterClient {
  private readonly client: NeynarAPIClient;
  private readonly signerUuid: string;
  private readonly defaultChannel: string | undefined;

  constructor(
    config: FarcasterConfig,
    private readonly logger: Logger,
  ) {
    const neynarConfig = new Configuration({ apiKey: config.apiKey });
    this.client = new NeynarAPIClient(neynarConfig);
    this.signerUuid = config.signerUuid;
    this.defaultChannel = config.defaultChannelId;
  }

  async postCast(text: string, options?: {
    imageUrl?: string;
    channelId?: string;
    idempotencyKey?: string;
  }): Promise<CastResult> {
    // Farcaster limit: 320 chars
    const trimmed = text.length > 317 ? text.slice(0, 317) + '...' : text;

    const embeds: Array<{ url: string }> = [];
    if (options?.imageUrl) {
      embeds.push({ url: options.imageUrl });
    }

    const result = await this.client.publishCast({
      signerUuid: this.signerUuid,
      text: trimmed,
      embeds: embeds.length > 0 ? embeds : undefined,
      channelId: options?.channelId ?? this.defaultChannel,
      idem: options?.idempotencyKey,
    });

    this.logger.info(
      { hash: result.cast.hash, channel: options?.channelId },
      'Cast published to Farcaster',
    );

    return {
      hash: result.cast.hash,
      url: `https://warpcast.com/~/conversations/${result.cast.hash}`,
    };
  }

  async replyCast(parentHash: string, text: string): Promise<CastResult> {
    const trimmed = text.length > 317 ? text.slice(0, 317) + '...' : text;

    const result = await this.client.publishCast({
      signerUuid: this.signerUuid,
      text: trimmed,
      parent: parentHash,
    });

    return {
      hash: result.cast.hash,
      url: `https://warpcast.com/~/conversations/${result.cast.hash}`,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Lightweight check — fetch bot's own profile
      await this.client.lookupUserByFid({ fid: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
```

---

## Код: PostDispatcher

```typescript
// src/common/post-dispatcher.ts

interface PostResult {
  twitterId?: string;
  farcasterHash?: string;
  errors: string[];
}

export class PostDispatcher {
  constructor(
    private readonly twitter: TwitterClient,
    private readonly farcaster: FarcasterClient | null,
    private readonly logger: Logger,
  ) {}

  async publish(text: string, options?: {
    imageUrl?: string;
    farcasterChannel?: string;
    tweetId?: string; // for idempotency
  }): Promise<PostResult> {
    const errors: string[] = [];
    let twitterId: string | undefined;
    let farcasterHash: string | undefined;

    // Post to both in parallel
    const [twitterResult, farcasterResult] = await Promise.allSettled([
      this.twitter.postTweet(text),
      this.farcaster?.postCast(text, {
        imageUrl: options?.imageUrl,
        channelId: options?.farcasterChannel,
        idempotencyKey: options?.tweetId,
      }),
    ]);

    if (twitterResult.status === 'fulfilled') {
      twitterId = twitterResult.value;
    } else {
      errors.push(`Twitter: ${twitterResult.reason}`);
      this.logger.error({ err: twitterResult.reason }, 'Twitter post failed');
    }

    if (farcasterResult.status === 'fulfilled' && farcasterResult.value) {
      farcasterHash = farcasterResult.value.hash;
    } else if (farcasterResult.status === 'rejected') {
      errors.push(`Farcaster: ${farcasterResult.reason}`);
      this.logger.error({ err: farcasterResult.reason }, 'Farcaster post failed');
    }

    return { twitterId, farcasterHash, errors };
  }
}
```

---

## Env переменные (добавить в env.validation.ts)

```typescript
// Farcaster (optional — enabled when both present)
NEYNAR_API_KEY: z.string().optional(),
NEYNAR_SIGNER_UUID: z.string().optional(),
FARCASTER_DEFAULT_CHANNEL: z.string().default('crypto'),
```

---

## Webhook для mentions (Phase 2)

Для MVP кросс-постинг достаточен. Webhook для отслеживания mentions на Farcaster — добавить когда бот будет отвечать на запросы.

**Setup:** dev.neynar.com → Webhooks → filter `cast.created` с `mentioned_fids: [BOT_FID]`

**На VPS:** отдельный Express/Bun endpoint на порту 3001, или интеграция в основной процесс.

---

## Зависимости

```bash
pnpm add @neynar/nodejs-sdk
```

Нет дополнительных зависимостей. SDK использует fetch (Node 18+).

---

## Каналы для постинга

| Канал | Аудитория | Когда постить |
|-------|-----------|--------------|
| `/crypto` | Общий крипто | Каждый роаст |
| `/base` | Base ecosystem | Роасты Base-проектов |
| `/ai` | AI/ML | Роасты AI-проектов |
| Без канала | Лента подписчиков | Controversial роасты |

**Рекомендация MVP:** все роасты в `/crypto`. Целевые роасты Base-проектов дублировать в `/base`.
