import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { attachment } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '$lib/server/auth-utils';
import { generateObjectKey, saveFile } from '$lib/server/storage';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_REFERENCE_TYPES = ['TESTCASE', 'EXECUTION', 'FAILURE'] as const;
const ALLOWED_MIME_TYPES = [
	'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
	'application/pdf',
	'text/plain', 'text/csv', 'text/html',
	'application/json',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/zip',
	'video/mp4', 'video/webm',
];

export const GET: RequestHandler = async ({ url, locals }) => {
	requireAuth(locals);

	const referenceType = url.searchParams.get('referenceType');
	const referenceId = Number(url.searchParams.get('referenceId'));

	if (
		!referenceType ||
		!ALLOWED_REFERENCE_TYPES.includes(referenceType as (typeof ALLOWED_REFERENCE_TYPES)[number])
	) {
		error(400, 'Invalid referenceType');
	}
	if (isNaN(referenceId) || referenceId <= 0) {
		error(400, 'Invalid referenceId');
	}

	const attachments = await db
		.select()
		.from(attachment)
		.where(
			and(
				eq(attachment.referenceType, referenceType as (typeof ALLOWED_REFERENCE_TYPES)[number]),
				eq(attachment.referenceId, referenceId)
			)
		)
		.orderBy(attachment.uploadedAt);

	return json(attachments);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireAuth(locals);

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const referenceType = formData.get('referenceType') as string;
	const referenceId = Number(formData.get('referenceId'));

	if (!file || !(file instanceof File)) {
		error(400, 'No file provided');
	}

	if (
		!referenceType ||
		!ALLOWED_REFERENCE_TYPES.includes(referenceType as (typeof ALLOWED_REFERENCE_TYPES)[number])
	) {
		error(400, 'Invalid referenceType');
	}

	if (isNaN(referenceId) || referenceId <= 0) {
		error(400, 'Invalid referenceId');
	}

	if (file.size > MAX_FILE_SIZE) {
		error(400, 'File size exceeds 10MB limit');
	}

	if (!ALLOWED_MIME_TYPES.includes(file.type)) {
		error(400, 'File type not allowed');
	}

	const objectKey = generateObjectKey(referenceType, referenceId, file.name);
	const buffer = Buffer.from(await file.arrayBuffer());

	await saveFile(objectKey, buffer);

	const [created] = await db
		.insert(attachment)
		.values({
			referenceType: referenceType as (typeof ALLOWED_REFERENCE_TYPES)[number],
			referenceId,
			fileName: file.name,
			contentType: file.type || null,
			objectKey,
			fileSize: file.size,
			uploadedBy: user.id
		})
		.returning();

	return json(created, { status: 201 });
};
