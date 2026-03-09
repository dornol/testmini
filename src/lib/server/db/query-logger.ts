import type { Logger } from 'drizzle-orm/logger';

export const SLOW_QUERY_THRESHOLD_MS = 500;

export interface QueryLog {
	warn: (meta: Record<string, unknown>, msg: string) => void;
	debug: (meta: Record<string, unknown>, msg: string) => void;
}

/** Custom Drizzle logger that tracks query execution time and logs slow queries. */
export class QueryLogger implements Logger {
	private log: QueryLog;
	private isProd: boolean;

	constructor(log: QueryLog, isProd = process.env.NODE_ENV === 'production') {
		this.log = log;
		this.isProd = isProd;
	}

	logQuery(query: string, params: unknown[]): void {
		const start = performance.now();
		queueMicrotask(() => {
			const durationMs = Math.round(performance.now() - start);
			if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
				this.log.warn(
					{ durationMs, query: query.slice(0, 200), paramCount: params.length },
					'slow query'
				);
			} else if (!this.isProd) {
				this.log.debug({ durationMs, query: query.slice(0, 120) }, 'query');
			}
		});
	}
}
