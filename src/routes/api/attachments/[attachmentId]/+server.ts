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
			'Content-Type': record.contentType || 'application/octet-stream',
			'Content-Disposition': `attachment; filename="${encodeURIComponent(record.fileName)}"`,
			'Content-Length': String(fileBuffer.length)
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

	await deleteFile(record.objectKey);
	await db
		.delete(attachment)
		.where(
			and(
				eq(attachment.id, attachmentId),
				eq(attachment.referenceType, record.referenceType),
				eq(attachment.referenceId, record.referenceId),
				eq(attachment.objectKey, record.objectKey)
			)
		);

	return new Response(null, { status: 204 });
});
