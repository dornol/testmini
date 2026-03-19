import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
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
			where: and(
				eq(exploratorySession.id, sessionId),
				eq(exploratorySession.projectId, projectId)
			)
		});
		if (!session) return notFound('Session not found');

		const note = await db.query.sessionNote.findFirst({
			where: and(
				eq(sessionNote.id, noteId),
				eq(sessionNote.sessionId, sessionId)
			)
		});
		if (!note) return notFound('Note not found');

		// Delete screenshot file if exists
		if (note.screenshotPath) {
			await deleteFile(note.screenshotPath);
		}

		await db.delete(sessionNote).where(eq(sessionNote.id, noteId));

		return json({ success: true });
	}
);
