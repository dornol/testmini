import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Root pino logger instance.
 *
 * - Development: pretty-printed output via pino-pretty transport.
 * - Production: newline-delimited JSON written to stdout.
 *
 * Standard fields included on every log line:
 *   timestamp (ISO 8601), level, message, pid, hostname.
 */
export const logger = pino(
	{
		level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
		timestamp: pino.stdTimeFunctions.isoTime,
		formatters: {
			level(label) {
				return { level: label };
			}
		}
	},
	isDev
		? pino.transport({
				target: 'pino-pretty',
				options: {
					colorize: true,
					translateTime: 'SYS:HH:MM:ss.l',
					ignore: 'pid,hostname'
				}
			})
		: undefined
);

/**
 * Factory that returns a child logger pre-populated with a `module` field.
 * Use this in individual modules so every log line is tagged with its origin.
 *
 * @example
 * const log = childLogger('redis');
 * log.warn({ err }, 'Connection error');
 */
export function childLogger(module: string, extra?: Record<string, unknown>) {
	return logger.child({ module, ...extra });
}
