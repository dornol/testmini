import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { attachment } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireProjectAccess, parseId } from '$lib/server/auth-utils';
import { withAuth } from '$lib/server/api-handler';
import { getFile, deleteFile } from '$lib/server/storage';
import {
	getProjectIdForAttachmentReference,
	isAttachmentReferenceType
} from '$lib/server/attachment-access';
import { attachmentContentDisposition } from '$lib/server/content-disposition';

const ACTIVE_CONTENT_TYPES = new Set(['image/svg+xml', 'text/html', 'application/xhtml+xml']);

function getSafeDownloadContentType(contentType: string | null): string {
	if (!contentType) return 'application/octet-stream';

	const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
	if (ACTIVE_CONTENT_TYPES.has(normalized)) {
		return 'application/octet-stream';
	}

	return contentType;
}

export const GET = withAuth(async ({ params, user }) => {
	const attachmentId = parseId(params.attachmentId, 'attachment ID');

	const record = await db.query.attachment.findFirst({
		where: eq(attachment.id, attachmentId)
	});

	if (!record) {
		error(404, 'Attachment not found');
	}

	if (!isAttachmentReferenceType(record.referenceType)) {
		error(400, 'Unknown reference type');
	}
	const projectId = await getProjectIdForAttachmentReference(
		record.referenceType,
		record.referenceId
	);
	await requireProjectAccess(user, projectId);

	const fileBuffer = await getFile(record.objectKey);
	const body = new Uint8Array(fileBuffer);

	return new Response(body, {
		headers: {
			'Content-Type': getSafeDownloadContentType(record.contentType),
			'Content-Disposition': attachmentContentDisposition(record.fileName),
			'Content-Length': String(fileBuffer.length),
			'X-Content-Type-Options': 'nosniff'
		}
	});
});

export const DELETE = withAuth(async ({ params, user }) => {
	const attachmentId = parseId(params.attachmentId, 'attachment ID');

	const record = await db.query.attachment.findFirst({
		where: eq(attachment.id, attachmentId)
	});

	if (!record) {
		error(404, 'Attachment not found');
	}

	if (!isAttachmentReferenceType(record.referenceType)) {
		error(400, 'Unknown reference type');
	}
	const projectId = await getProjectIdForAttachmentReference(
		record.referenceType,
		record.referenceId
	);
	await requireProjectAccess(user, projectId);

	const [deleted] = await db
		.delete(attachment)
		.where(
			and(
				eq(attachment.id, attachmentId),
				eq(attachment.referenceType, record.referenceType),
				eq(attachment.referenceId, record.referenceId),
				eq(attachment.objectKey, record.objectKey)
			)
		)
		.returning();
	if (!deleted) {
		error(404, 'Attachment not found');
	}
	await deleteFile(record.objectKey);

	return new Response(null, { status: 204 });
});
