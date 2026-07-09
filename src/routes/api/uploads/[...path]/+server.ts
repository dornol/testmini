import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote } from '$lib/server/db/schema';
import { getFile } from '$lib/server/storage';
import { withAuth } from '$lib/server/api-handler';
import { requireProjectAccess } from '$lib/server/auth-utils';
import { and, eq } from 'drizzle-orm';

const MIME_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp'
};

export const GET: RequestHandler = withAuth(async ({ params, user }) => {
	const objectKey = params.path;

	if (!objectKey || objectKey.includes('..') || objectKey.includes('//')) {
		error(400, 'Invalid path');
	}

	if (!objectKey.startsWith('exploratory/')) {
		error(404, 'Not found');
	}

	const [record] = await db
		.select({ projectId: exploratorySession.projectId })
		.from(sessionNote)
		.innerJoin(exploratorySession, eq(sessionNote.sessionId, exploratorySession.id))
		.where(and(eq(sessionNote.screenshotPath, objectKey)))
		.limit(1);

	if (!record) {
		error(404, 'Not found');
	}

	await requireProjectAccess(user, record.projectId);

	try {
		const fileBuffer = await getFile(objectKey);
		const ext = objectKey.split('.').pop()?.toLowerCase() || '';
		const contentType = MIME_TYPES[ext] || 'application/octet-stream';

		return new Response(new Uint8Array(fileBuffer), {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'private, max-age=86400',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch {
		error(404, 'Not found');
	}
});
