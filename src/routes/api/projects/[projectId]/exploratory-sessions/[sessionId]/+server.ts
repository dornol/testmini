import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote, user } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';

async function findSession(projectId: number, sessionId: number) {
	return db.query.exploratorySession.findFirst({
		where: and(
			eq(exploratorySession.id, sessionId),
			eq(exploratorySession.projectId, projectId)
		)
	});
}

export const GET = withProjectAccess(async ({ projectId, params }) => {
	const sessionId = Number(params.sessionId);
	if (!Number.isFinite(sessionId)) error(400, 'Invalid session ID');

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
		const sessionId = Number(params.sessionId);
		if (!Number.isFinite(sessionId)) error(400, 'Invalid session ID');

		const session = await findSession(projectId, sessionId);
		if (!session) return notFound('Session not found');

		let body: {
			action?: 'pause' | 'resume' | 'complete';
			summary?: string;
			title?: string;
			charter?: string;
			environment?: string;
			tags?: string[];
		};
		try {
			body = await request.json();
		} catch {
			error(400, 'Invalid JSON');
		}

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
				updates.summary = body.summary.trim() || null;
			}
		}

		if (body.action === 'pause' || body.action === 'resume') {
			// Calculate pausedDuration update on pause/resume
			// On pause: snapshot current time (client tracks elapsed)
			// On resume: no-op on server (client tracks elapsed)
		}

		if (body.summary !== undefined && body.action !== 'complete') {
			updates.summary = body.summary.trim() || null;
		}
		if (body.title !== undefined) {
			const title = body.title.trim();
			if (!title) return badRequest('Title cannot be empty');
			updates.title = title;
		}
		if (body.charter !== undefined) {
			updates.charter = body.charter.trim() || null;
		}
		if (body.environment !== undefined) {
			updates.environment = body.environment.trim() || null;
		}
		if (body.tags !== undefined) {
			updates.tags = body.tags;
		}
		if (body.action === 'pause' || body.action === 'resume' || body.action === 'complete') {
			// Accept pausedDuration from client to keep server in sync
			const pausedDuration = (body as Record<string, unknown>).pausedDuration;
			if (typeof pausedDuration === 'number' && pausedDuration >= 0) {
				updates.pausedDuration = Math.floor(pausedDuration);
			}
		}

		if (Object.keys(updates).length === 0) {
			return badRequest('No fields to update');
		}

		const [updated] = await db
			.update(exploratorySession)
			.set(updates)
			.where(eq(exploratorySession.id, sessionId))
			.returning();

		return json(updated);
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ projectId, params }) => {
		const sessionId = Number(params.sessionId);
		if (!Number.isFinite(sessionId)) error(400, 'Invalid session ID');

		const session = await findSession(projectId, sessionId);
		if (!session) return notFound('Session not found');

		await db.delete(exploratorySession).where(eq(exploratorySession.id, sessionId));

		return json({ success: true });
	}
);
