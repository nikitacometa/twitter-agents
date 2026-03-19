import { z } from 'zod';

const envSchema = z
  .object({
    // Twitter API (Basic tier)
    TWITTER_API_KEY: z.string().optional(),
    TWITTER_API_SECRET: z.string().optional(),
    TWITTER_ACCESS_TOKEN: z.string().optional(),
    TWITTER_ACCESS_SECRET: z.string().optional(),

    // Twitter client mode
    TWITTER_CLIENT_MODE: z.enum(['api', 'scraper']).default('api'),

    // Twitter scraper credentials (cookie auth via agent-twitter-client)
    TWITTER_USERNAME: z.string().optional(),
    TWITTER_PASSWORD: z.string().optional(),
    TWITTER_PHONE: z.string().optional(),
    TWITTER_2FA_SECRET: z.string().optional(),

    // Anthropic SDK — fallback only (primary = Claude Code CLI via Claude Max)
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
    MENTION_POLL_INTERVAL_MS: z.coerce.number().int().min(60_000).default(600_000),
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

    // Monitoring
    SENTRY_DSN: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),
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
