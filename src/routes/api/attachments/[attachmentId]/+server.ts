import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { attachment } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '$lib/server/auth-utils';
import { getFile, deleteFile } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params, locals }) => {
	requireAuth(locals);

	const attachmentId = Number(params.attachmentId);
	if (isNaN(attachmentId)) {
		error(400, 'Invalid attachment ID');
	}

	const record = await db.query.attachment.findFirst({
		where: eq(attachment.id, attachmentId)
	});

	if (!record) {
		error(404, 'Attachment not found');
	}

	const fileBuffer = await getFile(record.objectKey);
	const body = new Uint8Array(fileBuffer);

	return new Response(body, {
		headers: {
			'Content-Type': record.contentType || 'application/octet-stream',
			'Content-Disposition': `attachment; filename="${encodeURIComponent(record.fileName)}"`,
			'Content-Length': String(fileBuffer.length)
		}
	});
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	requireAuth(locals);

	const attachmentId = Number(params.attachmentId);
	if (isNaN(attachmentId)) {
		error(400, 'Invalid attachment ID');
	}

	const record = await db.query.attachment.findFirst({
		where: eq(attachment.id, attachmentId)
	});

	if (!record) {
		error(404, 'Attachment not found');
	}

	await deleteFile(record.objectKey);
	await db.delete(attachment).where(eq(attachment.id, attachmentId));

	return new Response(null, { status: 204 });
};
