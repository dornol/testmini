import { json, error } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import { exploratorySession, sessionNote, user } from '$lib/server/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';
import { parseJsonBody } from '$lib/server/auth-utils';

const VALID_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED'] as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseNonNegativeIntegerParam(value: string | null, label: string): number {
	if (value === null || value === '') return 0;

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`Invalid ${label}`);
	}

	return parsed;
}

function parsePositiveIntegerParam(
	value: string | null,
	label: string,
	defaultValue: number
): number {
	if (value === null || value === '') return defaultValue;

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`Invalid ${label}`);
	}

	return parsed;
}

function parseStatus(value: string | null): (typeof VALID_STATUSES)[number] | null {
	if (value === null || value === '') return null;
	if (!VALID_STATUSES.includes(value as (typeof VALID_STATUSES)[number])) {
		throw new Error('Invalid status');
	}
	return value as (typeof VALID_STATUSES)[number];
}

export const GET = withProjectAccess(async ({ projectId, url }) => {
	let status: (typeof VALID_STATUSES)[number] | null;
	let limit: number;
	let offset: number;

	try {
		status = parseStatus(url.searchParams.get('status'));
		limit = Math.min(
			parsePositiveIntegerParam(url.searchParams.get('limit'), 'limit', DEFAULT_LIMIT),
			MAX_LIMIT
		);
		offset = parseNonNegativeIntegerParam(url.searchParams.get('offset'), 'offset');
	} catch (err) {
		return badRequest(err instanceof Error ? err.message : 'Invalid session query');
	}

	const conditions = [eq(exploratorySession.projectId, projectId)];
	if (status) {
		conditions.push(eq(exploratorySession.status, status));
	}

	const where = and(...conditions);

	const [sessions, totalResult] = await Promise.all([
		db
			.select({
				id: exploratorySession.id,
				title: exploratorySession.title,
				charter: exploratorySession.charter,
				status: exploratorySession.status,
				startedAt: exploratorySession.startedAt,
				pausedDuration: exploratorySession.pausedDuration,
				completedAt: exploratorySession.completedAt,
				environment: exploratorySession.environment,
				tags: exploratorySession.tags,
				createdBy: user.name,
				createdById: exploratorySession.createdBy,
				noteCount:
					sql<number>`(select count(*)::int from session_note where session_id = ${col(exploratorySession.id)})`.as(
						'note_count'
					)
			})
			.from(exploratorySession)
			.innerJoin(user, eq(exploratorySession.createdBy, user.id))
			.where(where)
			.orderBy(desc(exploratorySession.startedAt))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(exploratorySession).where(where)
	]);

	return json({
		sessions,
		total: totalResult[0]?.total ?? 0
	});
});

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, user: authUser, projectId }) => {
		let body: { title?: string; charter?: string; environment?: string; tags?: string[] };
		try {
			body = (await parseJsonBody(request)) as typeof body;
		} catch {
			error(400, 'Invalid JSON');
		}

		const title = (body.title ?? '').trim();
		if (!title) return badRequest('Title is required');
		if (title.length > 500) return badRequest('Title must be 500 characters or less');

		let created;
		try {
			[created] = await db
				.insert(exploratorySession)
				.values({
					projectId,
					title,
					charter: body.charter?.trim() || null,
					environment: body.environment?.trim() || null,
					tags: body.tags ?? [],
					createdBy: authUser.id
				})
				.returning();
		} catch {
			error(
				500,
				'Failed to create session. Please check that the database migration has been applied.'
			);
		}

		return json(created, { status: 201 });
	}
);
