import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { attachment, testCase, testExecution, testFailureDetail } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireProjectAccess } from '$lib/server/auth-utils';
import { withAuth } from '$lib/server/api-handler';
import { getFile, deleteFile } from '$lib/server/storage';

async function getProjectIdForAttachment(record: { referenceType: string; referenceId: number }): Promise<number> {
	if (record.referenceType === 'TESTCASE') {
		const tc = await db.query.testCase.findFirst({
			where: eq(testCase.id, record.referenceId),
			columns: { projectId: true }
		});
		if (!tc) error(404, 'Referenced test case not found');
		return tc.projectId;
	}

	if (record.referenceType === 'EXECUTION') {
		const exec = await db.query.testExecution.findFirst({
			where: eq(testExecution.id, record.referenceId),
			with: { testRun: { columns: { projectId: true } } }
		});
		if (!exec) error(404, 'Referenced execution not found');
		return exec.testRun.projectId;
	}

	if (record.referenceType === 'FAILURE') {
		const failure = await db.query.testFailureDetail.findFirst({
			where: eq(testFailureDetail.id, record.referenceId),
			with: {
				testExecution: {
					with: { testRun: { columns: { projectId: true } } }
				}
			}
		});
		if (!failure) error(404, 'Referenced failure detail not found');
		return failure.testExecution.testRun.projectId;
	}

	error(400, 'Unknown reference type');
}

export const GET = withAuth(async ({ params, user }) => {

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

	const projectId = await getProjectIdForAttachment(record);
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

	const projectId = await getProjectIdForAttachment(record);
	await requireProjectAccess(user, projectId);

	await deleteFile(record.objectKey);
	await db.delete(attachment).where(eq(attachment.id, attachmentId));

	return new Response(null, { status: 204 });
});
