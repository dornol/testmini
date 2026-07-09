import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote, user } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { validateUpdateExploratorySessionPayload } from '$lib/server/exploratory-session-validation';

async function findSession(projectId: number, sessionId: number) {
	return db.query.exploratorySession.findFirst({
		where: and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
	});
}

export const GET = withProjectAccess(async ({ projectId, params }) => {
	const sessionId = parseId(params.sessionId, 'session ID');

	const session = await findSession(projectId, sessionId);
	if (!session) return notFound('Session not found');

	const notes = await db
		.select()
		.from(sessionNote)
		.where(eq(sessionNote.sessionId, sessionId))
		.orderBy(asc(sessionNote.timestamp));

	const creator = await db.query.user.findFirst({
		where: eq(user.id, session.createdBy),
		columns: { id: true, name: true, email: true }
	});

	return json({ ...session, notes, creator });
});

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, projectId, params }) => {
		const sessionId = parseId(params.sessionId, 'session ID');

		const session = await findSession(projectId, sessionId);
		if (!session) return notFound('Session not found');

		let rawBody: unknown;
		try {
			rawBody = await parseJsonBody(request);
		} catch {
			error(400, 'Invalid JSON');
		}
		const body = validateUpdateExploratorySessionPayload(rawBody);
		if (body instanceof Response) return body;

		const updates: Record<string, unknown> = {};

		if (body.action === 'pause') {
			if (session.status !== 'ACTIVE') return badRequest('Session is not active');
			updates.status = 'PAUSED';
		} else if (body.action === 'resume') {
			if (session.status !== 'PAUSED') return badRequest('Session is not paused');
			updates.status = 'ACTIVE';
		} else if (body.action === 'complete') {
			if (session.status === 'COMPLETED') return badRequest('Session is already completed');
			updates.status = 'COMPLETED';
			updates.completedAt = new Date();
			if (body.summary !== undefined) {
				updates.summary = body.summary;
			}
		}

		if (body.action === 'pause' || body.action === 'resume') {
			// Calculate pausedDuration update on pause/resume
			// On pause: snapshot current time (client tracks elapsed)
			// On resume: no-op on server (client tracks elapsed)
		}

		if (body.summary !== undefined && body.action !== 'complete') {
			updates.summary = body.summary;
		}
		if (body.title !== undefined) {
			updates.title = body.title;
		}
		if (body.charter !== undefined) {
			updates.charter = body.charter;
		}
		if (body.environment !== undefined) {
			updates.environment = body.environment;
		}
		if (body.tags !== undefined) {
			updates.tags = body.tags;
		}
		if (body.action === 'pause' || body.action === 'resume' || body.action === 'complete') {
			// Accept pausedDuration from client to keep server in sync
			if (body.pausedDuration !== undefined) {
				updates.pausedDuration = body.pausedDuration;
			}
		}

		if (Object.keys(updates).length === 0) {
			return badRequest('No fields to update');
		}

		const [updated] = await db
			.update(exploratorySession)
			.set(updates)
			.where(and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId)))
			.returning();
		if (!updated) return notFound('Session not found');

		return json(updated);
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ projectId, params }) => {
		const sessionId = parseId(params.sessionId, 'session ID');

		const session = await findSession(projectId, sessionId);
		if (!session) return notFound('Session not found');

		const [deleted] = await db
			.delete(exploratorySession)
			.where(and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId)))
			.returning({ id: exploratorySession.id });
		if (!deleted) return notFound('Session not found');

		return json({ success: true });
	}
);
