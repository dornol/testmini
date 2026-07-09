import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testExecution, testFailureDetail } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const ALLOWED_ATTACHMENT_REFERENCE_TYPES = ['TESTCASE', 'EXECUTION', 'FAILURE'] as const;

export type AttachmentReferenceType = (typeof ALLOWED_ATTACHMENT_REFERENCE_TYPES)[number];

export function isAttachmentReferenceType(value: string | null): value is AttachmentReferenceType {
	return ALLOWED_ATTACHMENT_REFERENCE_TYPES.includes(value as AttachmentReferenceType);
}

export async function getProjectIdForAttachmentReference(
	referenceType: AttachmentReferenceType,
	referenceId: number
): Promise<number> {
	if (referenceType === 'TESTCASE') {
		const tc = await db.query.testCase.findFirst({
			where: eq(testCase.id, referenceId),
			columns: { projectId: true }
		});
		if (!tc) error(404, 'Referenced test case not found');
		return tc.projectId;
	}

	if (referenceType === 'EXECUTION') {
		const exec = await db.query.testExecution.findFirst({
			where: eq(testExecution.id, referenceId),
			with: { testRun: { columns: { projectId: true } } }
		});
		if (!exec) error(404, 'Referenced execution not found');
		return exec.testRun.projectId;
	}

	const failure = await db.query.testFailureDetail.findFirst({
		where: eq(testFailureDetail.id, referenceId),
		with: {
			testExecution: {
				with: { testRun: { columns: { projectId: true } } }
			}
		}
	});
	if (!failure) error(404, 'Referenced failure detail not found');
	return failure.testExecution.testRun.projectId;
}
