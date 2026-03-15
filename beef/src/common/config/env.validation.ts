import { z } from 'zod';

const envSchema = z
  .object({
    // Twitter API (Basic tier)
    TWITTER_API_KEY: z.string().optional(),
    TWITTER_API_SECRET: z.string().optional(),
    TWITTER_ACCESS_TOKEN: z.string().optional(),
    TWITTER_ACCESS_SECRET: z.string().optional(),

    // Twitter cookie auth (fallback)
    TWITTER_USERNAME: z.string().optional(),
    TWITTER_PASSWORD: z.string().optional(),
    TWITTER_EMAIL: z.string().optional(),

    // Anthropic
    ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),

    // Base chain
    BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),
    BEEF_TOKEN_ADDRESS: z.string().optional(),

    // Bot config
    BOT_NAME: z.string().default('0xBeef'),
    ROASTS_PER_DAY: z.coerce.number().int().min(1).max(20).default(5),
    MENTION_POLL_INTERVAL_MS: z.coerce.number().int().min(60_000).default(600_000),
    POST_JITTER_PERCENT: z.coerce.number().int().min(0).max(50).default(30),

    // Monitoring
    SENTRY_DSN: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),

    // Environment
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((data, ctx) => {
    const hasApiKeys =
      data.TWITTER_API_KEY &&
      data.TWITTER_API_SECRET &&
      data.TWITTER_ACCESS_TOKEN &&
      data.TWITTER_ACCESS_SECRET;

    const hasCookieAuth =
      data.TWITTER_USERNAME && data.TWITTER_PASSWORD && data.TWITTER_EMAIL;

    if (!hasApiKeys && !hasCookieAuth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Either Twitter API credentials (TWITTER_API_KEY + SECRET + ACCESS_TOKEN + ACCESS_SECRET) or cookie auth (TWITTER_USERNAME + PASSWORD + EMAIL) must be provided',
        path: ['TWITTER_API_KEY'],
      });
    }

    if (data.NODE_ENV === 'production') {
      if (!data.SENTRY_DSN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SENTRY_DSN is required in production',
          path: ['SENTRY_DSN'],
        });
      }
      if (!data.TELEGRAM_BOT_TOKEN || !data.TELEGRAM_CHAT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Telegram alerts (BOT_TOKEN + CHAT_ID) required in production',
          path: ['TELEGRAM_BOT_TOKEN'],
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
  return result.data;
}
