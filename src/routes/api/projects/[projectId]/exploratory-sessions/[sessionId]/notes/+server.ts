import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';
import { saveFile } from '$lib/server/storage';
import { randomUUID } from 'node:crypto';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, projectId, params }) => {
		const sessionId = Number(params.sessionId);
		if (!Number.isFinite(sessionId)) error(400, 'Invalid session ID');

		const session = await db.query.exploratorySession.findFirst({
			where: and(
				eq(exploratorySession.id, sessionId),
				eq(exploratorySession.projectId, projectId)
			)
		});
		if (!session) return notFound('Session not found');

		const formData = await request.formData();
		const content = (formData.get('content') as string ?? '').trim();
		if (!content) return badRequest('Content is required');

		const noteType = formData.get('noteType') as string ?? 'NOTE';
		if (!['NOTE', 'BUG', 'QUESTION', 'IDEA'].includes(noteType)) {
			return badRequest('Invalid note type');
		}

		const timestamp = Number(formData.get('timestamp') ?? '0');
		if (!Number.isFinite(timestamp) || timestamp < 0) {
			return badRequest('Invalid timestamp');
		}

		let screenshotPath: string | null = null;
		const file = formData.get('screenshot') as File | null;
		if (file && file instanceof File && file.size > 0) {
			if (file.size > 10 * 1024 * 1024) {
				return badRequest('Screenshot must be under 10MB');
			}
			const uuid = randomUUID();
			const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
			screenshotPath = `exploratory/${sessionId}/${uuid}_${safeName}`;
			const buffer = Buffer.from(await file.arrayBuffer());
			await saveFile(screenshotPath, buffer);
		}

		const [created] = await db
			.insert(sessionNote)
			.values({
				sessionId,
				content,
				noteType,
				timestamp,
				screenshotPath
			})
			.returning();

		return json(created, { status: 201 });
	}
);
