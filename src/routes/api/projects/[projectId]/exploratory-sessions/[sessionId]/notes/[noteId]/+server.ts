import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound } from '$lib/server/errors';
import { parseId } from '$lib/server/auth-utils';
import { deleteFile } from '$lib/server/storage';

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ projectId, params }) => {
		const sessionId = parseId(params.sessionId, 'session ID');
		const noteId = parseId(params.noteId, 'note ID');

		// Verify session belongs to project
		const session = await db.query.exploratorySession.findFirst({
			where: and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
		});
		if (!session) return notFound('Session not found');

		const note = await db.query.sessionNote.findFirst({
			where: and(eq(sessionNote.id, noteId), eq(sessionNote.sessionId, sessionId))
		});
		if (!note) return notFound('Note not found');

		const [deleted] = await db
			.delete(sessionNote)
			.where(
				and(
					eq(sessionNote.id, noteId),
					eq(sessionNote.sessionId, sessionId),
					sql`exists (select 1 from exploratory_session where id = ${sessionId} and project_id = ${projectId})`
				)
			)
			.returning({ id: sessionNote.id });
		if (!deleted) return notFound('Note not found');

		// Delete screenshot file only after the note row was actually removed.
		if (note.screenshotPath) {
			await deleteFile(note.screenshotPath);
		}

		return json({ success: true });
	}
);
