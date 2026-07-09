import { json, error } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import { exploratorySession, sessionNote, user } from '$lib/server/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';
import { parseJsonBody } from '$lib/server/auth-utils';
import { validateCreateExploratorySessionPayload } from '$lib/server/exploratory-session-validation';
import {
	parseNonNegativeIntegerSearchParam,
	parsePositiveIntegerSearchParamStrict
} from '$lib/server/search-param-validation';

const VALID_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED'] as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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
		limit = parsePositiveIntegerSearchParamStrict(url.searchParams.get('limit'), 'limit', {
			defaultValue: DEFAULT_LIMIT,
			max: MAX_LIMIT
		});
		offset = parseNonNegativeIntegerSearchParam(url.searchParams.get('offset'), 'offset');
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
		let rawBody: unknown;
		try {
			rawBody = await parseJsonBody(request);
		} catch {
			error(400, 'Invalid JSON');
		}

		const payload = validateCreateExploratorySessionPayload(rawBody);
		if (payload instanceof Response) return payload;

		let created;
		try {
			[created] = await db
				.insert(exploratorySession)
				.values({
					projectId,
					title: payload.title,
					charter: payload.charter,
					environment: payload.environment,
					tags: payload.tags,
					createdBy: authUser.id
				})
				.returning();
		} catch {
			error(
				500,
				'Failed to create session. Please check that the database migration has been applied.'
			);
		}

		if (!created) error(500, 'Failed to create exploratory session');

		return json(created, { status: 201 });
	}
);
