import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { attachment } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withAuth } from '$lib/server/api-handler';
import { generateObjectKey, saveFile } from '$lib/server/storage';
import { requireProjectAccess } from '$lib/server/auth-utils';
import {
	getProjectIdForAttachmentReference,
	isAttachmentReferenceType
} from '$lib/server/attachment-access';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/svg+xml',
	'application/pdf',
	'text/plain',
	'text/csv',
	'text/html',
	'application/json',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/zip',
	'video/mp4',
	'video/webm'
];

export const GET = withAuth(async ({ url, user }) => {
	const referenceType = url.searchParams.get('referenceType');
	const referenceId = Number(url.searchParams.get('referenceId'));

	if (!isAttachmentReferenceType(referenceType)) {
		error(400, 'Invalid referenceType');
	}
	if (isNaN(referenceId) || referenceId <= 0) {
		error(400, 'Invalid referenceId');
	}

	const projectId = await getProjectIdForAttachmentReference(referenceType, referenceId);
	await requireProjectAccess(user, projectId);

	const attachments = await db
		.select()
		.from(attachment)
		.where(
			and(eq(attachment.referenceType, referenceType), eq(attachment.referenceId, referenceId))
		)
		.orderBy(attachment.uploadedAt);

	return json(attachments);
});

export const POST = withAuth(async ({ request, user }) => {
	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const referenceTypeValue = formData.get('referenceType');
	const referenceId = Number(formData.get('referenceId'));

	if (!file || !(file instanceof File)) {
		error(400, 'No file provided');
	}

	if (typeof referenceTypeValue !== 'string' || !isAttachmentReferenceType(referenceTypeValue)) {
		error(400, 'Invalid referenceType');
	}
	const referenceType = referenceTypeValue;

	if (isNaN(referenceId) || referenceId <= 0) {
		error(400, 'Invalid referenceId');
	}

	if (file.size > MAX_FILE_SIZE) {
		error(400, 'File size exceeds 10MB limit');
	}

	if (!ALLOWED_MIME_TYPES.includes(file.type)) {
		error(400, 'File type not allowed');
	}

	const projectId = await getProjectIdForAttachmentReference(referenceType, referenceId);
	await requireProjectAccess(user, projectId);

	const objectKey = generateObjectKey(referenceType, referenceId, file.name);
	const buffer = Buffer.from(await file.arrayBuffer());

	await saveFile(objectKey, buffer);

	const [created] = await db
		.insert(attachment)
		.values({
			referenceType,
			referenceId,
			fileName: file.name,
			contentType: file.type || null,
			objectKey,
			fileSize: file.size,
			uploadedBy: user.id
		})
		.returning();

	return json(created, { status: 201 });
});
