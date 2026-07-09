import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { attachment } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withAuth } from '$lib/server/api-handler';
import { deleteFile, generateObjectKey, saveFile } from '$lib/server/storage';
import { requireProjectAccess } from '$lib/server/auth-utils';
import {
	getProjectIdForAttachmentReference,
	isAttachmentReferenceType
} from '$lib/server/attachment-access';
import { assertMultipartContentLength } from '$lib/server/multipart-limits';

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

function parseReferenceId(value: FormDataEntryValue | string | null): number {
	if (typeof value !== 'string') {
		error(400, 'Invalid referenceId');
	}

	const referenceId = Number(value);
	if (!Number.isSafeInteger(referenceId) || referenceId <= 0) {
		error(400, 'Invalid referenceId');
	}

	return referenceId;
}

export const GET = withAuth(async ({ url, user }) => {
	const referenceType = url.searchParams.get('referenceType');
	const referenceIdValue = url.searchParams.get('referenceId');

	if (!isAttachmentReferenceType(referenceType)) {
		error(400, 'Invalid referenceType');
	}
	const referenceId = parseReferenceId(referenceIdValue);

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
	assertMultipartContentLength(request, MAX_FILE_SIZE);

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const referenceTypeValue = formData.get('referenceType');
	const referenceIdValue = formData.get('referenceId');

	if (!file || !(file instanceof File)) {
		error(400, 'No file provided');
	}

	if (typeof referenceTypeValue !== 'string' || !isAttachmentReferenceType(referenceTypeValue)) {
		error(400, 'Invalid referenceType');
	}
	const referenceType = referenceTypeValue;
	const referenceId = parseReferenceId(referenceIdValue);

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

	let created;
	try {
		[created] = await db
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
	} catch (insertError) {
		try {
			await deleteFile(objectKey);
		} catch {
			// Preserve the database failure; cleanup can be retried from storage tooling.
		}
		throw insertError;
	}

	return json(created, { status: 201 });
});
