import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, approvalHistory, projectMember } from '$lib/server/db/schema';
import { user as userTable } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest, forbidden, notFound } from '$lib/server/errors';
import { createNotification } from '$lib/server/notifications';

const VALID_TRANSITIONS: Record<string, { from: string[]; to: string }> = {
	submit_review: { from: ['DRAFT'], to: 'IN_REVIEW' },
	approve: { from: ['IN_REVIEW'], to: 'APPROVED' },
	reject: { from: ['IN_REVIEW'], to: 'REJECTED' },
	revert_draft: { from: ['REJECTED', 'APPROVED'], to: 'DRAFT' }
};

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});

	if (!tc) {
		error(404, 'Test case not found');
	}

	const history = await db
		.select({
			id: approvalHistory.id,
			fromStatus: approvalHistory.fromStatus,
			toStatus: approvalHistory.toStatus,
			userId: approvalHistory.userId,
			userName: userTable.name,
			comment: approvalHistory.comment,
			createdAt: approvalHistory.createdAt
		})
		.from(approvalHistory)
		.innerJoin(userTable, eq(approvalHistory.userId, userTable.id))
		.where(eq(approvalHistory.testCaseId, testCaseId))
		.orderBy(desc(approvalHistory.createdAt));

	return json({
		approvalStatus: tc.approvalStatus,
		history
	});
});

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, user, projectId }) => {
		const testCaseId = Number(params.testCaseId);

		const body = await parseJsonBody(request);
		const { action, comment } = body as { action: string; comment?: string };

		if (!action || !VALID_TRANSITIONS[action]) {
			return badRequest('Invalid action. Must be one of: submit_review, approve, reject, revert_draft');
		}

		const transition = VALID_TRANSITIONS[action];

		const tc = await db.query.testCase.findFirst({
			where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
		});

		if (!tc) {
			return notFound('Test case not found');
		}

		// Validate current status allows this transition
		if (!transition.from.includes(tc.approvalStatus)) {
			return badRequest(
				`Cannot ${action} from status ${tc.approvalStatus}. Allowed from: ${transition.from.join(', ')}`
			);
		}

		// Approve action: must not be the author (someone else must approve)
		if (action === 'approve' && tc.createdBy === user.id) {
			return forbidden('You cannot approve your own test case. Another team member must approve it.');
		}

		// Reject action: requires comment
		if (action === 'reject' && (!comment || !comment.trim())) {
			return badRequest('A comment is required when rejecting a test case');
		}

		// Check role for approve/reject: must be PROJECT_ADMIN or QA
		if (action === 'approve' || action === 'reject') {
			const member = await db.query.projectMember.findFirst({
				where: and(
					eq(projectMember.projectId, projectId),
					eq(projectMember.userId, user.id)
				)
			});
			if (member && member.role !== 'PROJECT_ADMIN' && member.role !== 'QA') {
				return forbidden('Only PROJECT_ADMIN or QA can approve/reject test cases');
			}
		}

		const fromStatus = tc.approvalStatus;

		await db.transaction(async (tx) => {
			await tx
				.update(testCase)
				.set({ approvalStatus: transition.to })
				.where(eq(testCase.id, testCaseId));

			await tx.insert(approvalHistory).values({
				testCaseId,
				fromStatus,
				toStatus: transition.to,
				userId: user.id,
				comment: comment?.trim() || null
			});
		});

		// Send notification to test case creator on approve/reject
		if ((action === 'approve' || action === 'reject') && tc.createdBy !== user.id) {
			const statusLabel = action === 'approve' ? 'approved' : 'rejected';
			createNotification({
				userId: tc.createdBy,
				type: 'APPROVAL_STATUS_CHANGED',
				title: `Test case ${statusLabel}`,
				message: `Your test case ${tc.key} has been ${statusLabel}${comment ? ': ' + comment.trim() : ''}`,
				link: `/projects/${projectId}/test-cases/${testCaseId}`,
				projectId
			});
		}

		return json({
			approvalStatus: transition.to,
			fromStatus
		});
	}
);
