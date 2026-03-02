import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`SELECT 1`);
		return new Response(JSON.stringify({ status: 'ok' }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch {
		return new Response(JSON.stringify({ status: 'error', message: 'Database connection failed' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
