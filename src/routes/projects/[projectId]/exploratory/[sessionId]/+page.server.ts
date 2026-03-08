import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote, user } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = Number(params.projectId);
	const sessionId = Number(params.sessionId);

	if (isNaN(sessionId)) error(400, 'Invalid session ID');

	const session = await db.query.exploratorySession.findFirst({
		where: and(
			eq(exploratorySession.id, sessionId),
			eq(exploratorySession.projectId, projectId)
		)
	});

	if (!session) error(404, 'Session not found');

	const [notes, creator] = await Promise.all([
		db
			.select()
			.from(sessionNote)
			.where(eq(sessionNote.sessionId, sessionId))
			.orderBy(asc(sessionNote.timestamp)),
		db.query.user.findFirst({
			where: eq(user.id, session.createdBy),
			columns: { id: true, name: true, email: true }
		})
	]);

	return {
		session,
		notes,
		creator
	};
};
