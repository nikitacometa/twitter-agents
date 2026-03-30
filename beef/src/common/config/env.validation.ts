import { z } from 'zod';

const envSchema = z
  .object({
    // Bot environment: test (Euphoria AI) or production (0xBeefer)
    BEEF_ENV: z.enum(['test', 'production']).default('test'),

    // Twitter API (Official API v2)
    TWITTER_API_KEY: z.string().optional(),
    TWITTER_API_SECRET: z.string().optional(),
    TWITTER_ACCESS_TOKEN: z.string().optional(),
    TWITTER_ACCESS_SECRET: z.string().optional(),

    // Twitter client mode: api (API v2), scraper (cookie auth), hybrid (API reads + Playwright writes)
    TWITTER_CLIENT_MODE: z.enum(['api', 'scraper', 'hybrid']).default('api'),

    // Proxy (ISP residential SOCKS5 for anti-detection)
    PROXY_URL: z
      .string()
      .transform((val) => (val.trim() === '' ? undefined : val))
      .refine((val) => val === undefined || /^(https?|socks[45]):\/\/.+/.test(val), {
        message: 'PROXY_URL must start with http://, https://, socks4://, or socks5://',
      })
      .optional(),

    // Playwright browser automation
    CHROME_PROFILE_PATH: z.string().optional(),

    // Twitter bot handle (without @) — used for mention filtering in API mode
    TWITTER_BOT_USERNAME: z.string().optional(),

    // Twitter scraper credentials (cookie auth via agent-twitter-client)
    TWITTER_USERNAME: z.string().optional(),
    TWITTER_PASSWORD: z.string().optional(),
    TWITTER_PHONE: z.string().optional(),
    TWITTER_2FA_SECRET: z.string().optional(),

    // Codex CLI — secondary fallback (ChatGPT Plus subscription)
    CODEX_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    // Anthropic SDK — tertiary fallback (pay-per-token)
    ANTHROPIC_API_KEY: z.string().optional(),

    // Database
    DB_PATH: z.string().default('./data/beef.db'),

    // Base chain
    BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),
    BEEF_TOKEN_ADDRESS: z.string().optional(),

    // Bot config
    BOT_NAME: z.string().default('0xBeef'),
    ROASTS_PER_DAY: z.coerce.number().int().min(1).max(20).default(10),
    MENTION_REPLIES_PER_DAY: z.coerce.number().int().min(1).max(100).default(20),
    MIN_FOLLOWER_THRESHOLD: z.coerce.number().int().min(0).default(250),
    MENTION_POLL_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
    DRY_RUN: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    ENABLE_AUTONOMOUS_POSTING: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    ENABLE_MENTION_REPLIES: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    ENABLE_TWITTER: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    // Monitoring
    SENTRY_DSN: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),
    TELEGRAM_MONITOR_CHAT_ID: z.string().optional(),
    TELEGRAM_ADMIN_IDS: z
      .string()
      .optional()
      .transform((v) =>
        v
          ? v
              .split(',')
              .map((id) => parseInt(id.trim(), 10))
              .filter((id) => !isNaN(id))
          : [],
      ),
    TELEGRAM_OPEN_ACCESS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // OpenAI (Whisper transcription for feedback)
    OPENAI_API_KEY: z.string().optional(),

    // Imgflip (meme generation)
    IMGFLIP_USERNAME: z.string().optional(),
    IMGFLIP_PASSWORD: z.string().optional(),

    // Activity feed
    ACTIVITY_FEED_PATH: z.string().default('./data/activity-feed.json'),
    ACTIVITY_FEED_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    // API server (dashboard & monitoring, OpenClaw bridge)
    API_PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
    API_AUTH_TOKEN: z.string().optional(),

    // Autonomy
    ENABLE_AUTO_FARM: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    AUTO_FARM_INTERVAL_HOURS: z.coerce.number().int().min(1).max(24).default(6),
    AUTO_FARM_TARGET_COUNT: z.coerce.number().int().min(1).max(10).default(5),

    ENABLE_AUTO_POST: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    AUTO_POST_INTERVAL_HOURS: z.coerce.number().int().min(1).max(12).default(3),
    MAX_AUTO_POSTS_PER_DAY: z.coerce.number().int().min(1).max(10).default(3),
    AUTO_POST_MIN_SCORE: z.coerce.number().min(1).max(5).default(4.0),
    AUTO_POST_MIN_BUFFER: z.coerce.number().int().min(1).max(20).default(5),

    ENABLE_REPLY_GUY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    REPLY_GUY_DRY_RUN: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    REPLY_GUY_DAILY_CAP: z.coerce.number().int().min(5).max(100).default(40),
    REPLY_GUY_MIN_ROASTABILITY: z.coerce.number().int().min(1).max(10).default(5),
    REPLY_GUY_MAX_AGE_MINUTES: z.coerce.number().int().min(10).max(180).default(60),
    REPLY_GUY_MAX_PER_CYCLE: z.coerce.number().int().min(1).max(10).default(3),
    REPLY_GUY_MAX_DAILY: z.coerce.number().int().min(0).max(20).default(7),

    ENABLE_LEARNING_LOOP: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // Environment
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.TELEGRAM_BOT_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'TELEGRAM_BOT_TOKEN is required in production',
          path: ['TELEGRAM_BOT_TOKEN'],
        });
      }
    }
    if (data.TWITTER_CLIENT_MODE === 'hybrid') {
      if (!data.PROXY_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PROXY_URL is required in hybrid mode (Playwright needs residential proxy)',
          path: ['PROXY_URL'],
        });
      }
      if (!data.CHROME_PROFILE_PATH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CHROME_PROFILE_PATH is required in hybrid mode (Playwright persistent profile)',
          path: ['CHROME_PROFILE_PATH'],
        });
      }
    }
    if (data.BEEF_ENV === 'production' && (data.TWITTER_CLIENT_MODE === 'api' || data.TWITTER_CLIENT_MODE === 'hybrid')) {
      const apiCreds = [data.TWITTER_API_KEY, data.TWITTER_API_SECRET, data.TWITTER_ACCESS_TOKEN, data.TWITTER_ACCESS_SECRET];
      if (apiCreds.some((c) => !c)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `All Twitter API credentials required in production ${data.TWITTER_CLIENT_MODE} mode (TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET)`,
          path: ['TWITTER_API_KEY'],
        });
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function validateEnv(): AppConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  // Warn about optional monitoring vars
  if (result.data.NODE_ENV === 'production') {
    const warnings: string[] = [];
    if (!result.data.SENTRY_DSN) warnings.push('SENTRY_DSN not set — error tracking disabled');
    if (!result.data.TELEGRAM_CHAT_ID)
      warnings.push('TELEGRAM_CHAT_ID not set — proactive alerts disabled');

    const hasTwitter =
      result.data.TWITTER_API_KEY ||
      result.data.TWITTER_USERNAME;
    if (!hasTwitter) warnings.push('No Twitter credentials — Twitter features disabled');

    if (warnings.length > 0) {
      console.warn(`[env] Production warnings:\n${warnings.map((w) => `  ⚠ ${w}`).join('\n')}`);
    }
  }

  return result.data;
}
