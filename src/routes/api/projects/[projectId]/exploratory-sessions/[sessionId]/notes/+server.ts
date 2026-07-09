import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';
import { parseId } from '$lib/server/auth-utils';
import { deleteFile, saveFile } from '$lib/server/storage';
import { randomUUID } from 'node:crypto';
import { assertMultipartContentLength } from '$lib/server/multipart-limits';
import { parseCanonicalNonNegativeInteger } from '$lib/server/search-param-validation';
import { parseOptionalTrimmedFormString } from '$lib/server/form-utils';

const MAX_NOTE_CONTENT_LENGTH = 10_000;
const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ALLOWED_SCREENSHOT_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const NOTE_TYPES = ['NOTE', 'BUG', 'QUESTION', 'IDEA'] as const;

type NoteType = (typeof NOTE_TYPES)[number];

function parseNoteType(value: FormDataEntryValue | null): NoteType | null {
	if (value === null) return 'NOTE';
	if (typeof value !== 'string') return null;
	return NOTE_TYPES.includes(value as NoteType) ? (value as NoteType) : null;
}

function parseTimestamp(value: FormDataEntryValue | null): number | null {
	if (value === null) return 0;
	if (typeof value !== 'string') return null;
	return parseCanonicalNonNegativeInteger(value);
}

function validateScreenshotFile(file: File): Response | null {
	const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
	if (!ALLOWED_SCREENSHOT_TYPES.has(file.type) || !ALLOWED_SCREENSHOT_EXTENSIONS.has(extension)) {
		return badRequest('Screenshot must be a PNG, JPEG, GIF, or WebP image');
	}
	return null;
}

async function cleanupScreenshot(screenshotPath: string | null) {
	if (!screenshotPath) return;
	try {
		await deleteFile(screenshotPath);
	} catch {
		// Preserve the primary failure; cleanup can be retried from storage tooling.
	}
}

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, projectId, params }) => {
		const sessionId = parseId(params.sessionId, 'session ID');

		const session = await db.query.exploratorySession.findFirst({
			where: and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
		});
		if (!session) return notFound('Session not found');

		assertMultipartContentLength(request, MAX_SCREENSHOT_SIZE);

		const formData = await request.formData();
		const content = parseOptionalTrimmedFormString(formData.get('content'));
		if (content === null) return badRequest('Content is required');
		if (!content) return badRequest('Content is required');
		if (content.length > MAX_NOTE_CONTENT_LENGTH) {
			return badRequest(`Content must be ${MAX_NOTE_CONTENT_LENGTH} characters or fewer`);
		}

		const noteType = parseNoteType(formData.get('noteType'));
		if (!noteType) {
			return badRequest('Invalid note type');
		}

		const timestamp = parseTimestamp(formData.get('timestamp'));
		if (timestamp === null) {
			return badRequest('Invalid timestamp');
		}

		let screenshotPath: string | null = null;
		const file = formData.get('screenshot') as File | null;
		if (file && file instanceof File && file.size > 0) {
			if (file.size > MAX_SCREENSHOT_SIZE) {
				return badRequest('Screenshot must be under 10MB');
			}
			const screenshotError = validateScreenshotFile(file);
			if (screenshotError) return screenshotError;

			const uuid = randomUUID();
			const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
			screenshotPath = `exploratory/${sessionId}/${uuid}_${safeName}`;
			const buffer = Buffer.from(await file.arrayBuffer());
			await saveFile(screenshotPath, buffer);
		}

		let created;
		try {
			[created] = await db
				.insert(sessionNote)
				.values({
					sessionId,
					content,
					noteType,
					timestamp,
					screenshotPath
				})
				.returning();
		} catch (insertError) {
			await cleanupScreenshot(screenshotPath);
			throw insertError;
		}

		if (!created) {
			await cleanupScreenshot(screenshotPath);
			error(500, 'Failed to create session note');
		}

		return json(created, { status: 201 });
	}
);
