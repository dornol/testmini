import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, approvalHistory } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import { eq, and } from 'drizzle-orm';

const APPROVAL_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'] as const;
const MAX_COMMENT_LENGTH = 2000;

const VALID_TRANSITIONS: Record<
	(typeof APPROVAL_STATUSES)[number],
	Array<(typeof APPROVAL_STATUSES)[number]>
> = {
	DRAFT: ['IN_REVIEW'],
	IN_REVIEW: ['APPROVED', 'REJECTED'],
	APPROVED: ['DRAFT'],
	REJECTED: ['DRAFT']
};

function validateApprovalTransition(
	fromStatus: (typeof APPROVAL_STATUSES)[number],
	toStatus: (typeof APPROVAL_STATUSES)[number]
): ReturnType<typeof err> | null {
	const allowed = VALID_TRANSITIONS[fromStatus];
	if (!allowed.includes(toStatus)) {
		return err(
			`Cannot change approval status from ${fromStatus} to ${toStatus}. Allowed: ${allowed.join(', ')}`
		);
	}
	return null;
}

function normalizeApprovalStatus(value: unknown): (typeof APPROVAL_STATUSES)[number] {
	return APPROVAL_STATUSES.includes(value as (typeof APPROVAL_STATUSES)[number])
		? (value as (typeof APPROVAL_STATUSES)[number])
		: 'DRAFT';
}

function validateApprovalComment(
	toStatus: (typeof APPROVAL_STATUSES)[number],
	value: string | undefined
): string | null | ReturnType<typeof err> {
	const comment = value?.trim() ?? '';
	if (comment.length > MAX_COMMENT_LENGTH) {
		return err(`Comment must be ${MAX_COMMENT_LENGTH} characters or less`);
	}
	if (toStatus === 'REJECTED' && !comment) {
		return err('A comment is required when rejecting a test case');
	}
	return comment || null;
}

export function registerApprovalTools(server: McpServer, projectId: number) {
	server.tool(
		'update-approval-status',
		'Update test case approval status (DRAFT → IN_REVIEW → APPROVED/REJECTED)',
		{
			testCaseId: mcpPositiveIdSchema.describe('Test case ID'),
			toStatus: z.enum(APPROVAL_STATUSES).describe('New approval status'),
			comment: z.string().optional().describe('Approval comment')
		},
		async ({ testCaseId: tcId, toStatus, comment: approvalComment }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, tcId), eq(testCase.projectId, projectId))
			});
			if (!tc) return err('Test case not found');

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const fromStatus = normalizeApprovalStatus(tc.approvalStatus);
			const transitionError = validateApprovalTransition(fromStatus, toStatus);
			if (transitionError) return transitionError;

			const comment = validateApprovalComment(toStatus, approvalComment);
			if (typeof comment !== 'string' && comment !== null) return comment;

			await db.transaction(async (tx) => {
				await tx
					.update(testCase)
					.set({ approvalStatus: toStatus })
					.where(and(eq(testCase.id, tcId), eq(testCase.projectId, projectId)));

				await tx.insert(approvalHistory).values({
					testCaseId: tcId,
					fromStatus,
					toStatus,
					userId: creator,
					comment
				});
			});

			return ok({ success: true, testCaseId: tcId, fromStatus, toStatus });
		}
	);
}
