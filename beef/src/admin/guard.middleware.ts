import type { Context, NextFunction } from 'grammy';
import type { Logger } from 'pino';

export function createAdminGuard(adminIds: number[], logger: Logger) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;
    if (!userId || !adminIds.includes(userId)) {
      logger.warn({ userId, username: ctx.from?.username }, 'Unauthorized access attempt');
      await ctx.reply('⛔ Access denied.');
      return;
    }
    await next();
  };
}
