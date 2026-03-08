import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound } from '$lib/server/errors';
import { deleteFile } from '$lib/server/storage';

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ projectId, params }) => {
		const sessionId = Number(params.sessionId);
		const noteId = Number(params.noteId);
		if (!Number.isFinite(sessionId)) error(400, 'Invalid session ID');
		if (!Number.isFinite(noteId)) error(400, 'Invalid note ID');

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
