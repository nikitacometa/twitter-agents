import pino from 'pino';

export function createFarmLogger() {
  return pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  });
}
