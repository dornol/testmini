import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { redis } from '$lib/server/redis';

export const GET: RequestHandler = async () => {
	const components: Record<string, { status: string; message?: string }> = {};

	// Database check
	try {
		await db.execute(sql`SELECT 1`);
		components.database = { status: 'healthy' };
	} catch {
		components.database = { status: 'unhealthy', message: 'Connection failed' };
	}

	// Redis check (optional)
	try {
		if (redis) {
			await redis.ping();
			components.redis = { status: 'healthy' };
		} else {
			components.redis = { status: 'not_configured', message: 'Using in-memory fallback' };
		}
	} catch {
		components.redis = { status: 'unhealthy', message: 'Connection failed' };
	}

	// Database is the only hard dependency; Redis is optional
	const dbHealthy = components.database.status === 'healthy';
	const redisOk = components.redis.status !== 'unhealthy';
	const status = dbHealthy ? (redisOk ? 'ok' : 'ok_degraded') : 'unhealthy';

	return json(
		{
			status,
			timestamp: new Date().toISOString(),
			components
		},
		{ status: dbHealthy ? 200 : 503 }
	);
};
