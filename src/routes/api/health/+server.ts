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

	const allHealthy = Object.values(components).every(
		(c) => c.status === 'healthy' || c.status === 'not_configured'
	);

	return json(
		{
			status: allHealthy ? 'ok' : 'degraded',
			timestamp: new Date().toISOString(),
			components
		},
		{ status: allHealthy ? 200 : 503 }
	);
};
