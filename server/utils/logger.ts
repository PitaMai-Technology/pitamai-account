import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const serviceName = process.env.SERVICE_NAME ?? 'pitamai-account';

/**
 * Cloud Logging で扱いやすいように、
 * - severity を追加
 * - base に service/env を付与
 * - 本番は JSON、開発は pretty
 */
export const logger = pino({
  level: isDev ? 'debug' : 'info',
  base: {
    service: serviceName,
    env: process.env.NODE_ENV,
  },
  formatters: {
    level(label, number) {
      return {
        level: number,
        severity: label.toUpperCase(),
      };
    },
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
