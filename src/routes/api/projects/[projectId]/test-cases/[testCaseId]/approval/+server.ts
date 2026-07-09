import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, approvalHistory, projectMember } from '$lib/server/db/schema';
import { user as userTable } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { requireTestCase } from '$lib/server/queries';
import { badRequest, forbidden } from '$lib/server/errors';
import { createNotification } from '$lib/server/notifications';
import { validateRequestBody } from '$lib/server/id-list-validation';

const VALID_TRANSITIONS: Record<string, { from: string[]; to: string }> = {
	submit_review: { from: ['DRAFT'], to: 'IN_REVIEW' },
	approve: { from: ['IN_REVIEW'], to: 'APPROVED' },
	reject: { from: ['IN_REVIEW'], to: 'REJECTED' },
	revert_draft: { from: ['REJECTED', 'APPROVED'], to: 'DRAFT' }
};

const MAX_COMMENT_LENGTH = 2000;

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');
	const tc = await requireTestCase(testCaseId, projectId);

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
		const testCaseId = parseId(params.testCaseId, 'test case ID');

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;
		const { action } = bodyOrError;

		if (typeof action !== 'string' || !VALID_TRANSITIONS[action]) {
			return badRequest(
				'Invalid action. Must be one of: submit_review, approve, reject, revert_draft'
			);
		}

		const transition = VALID_TRANSITIONS[action];
		const commentOrError = validateApprovalComment(bodyOrError.comment);
		if (commentOrError instanceof Response) return commentOrError;
		const comment = commentOrError;

		const tc = await requireTestCase(testCaseId, projectId);

		// Validate current status allows this transition
		if (!transition.from.includes(tc.approvalStatus)) {
			return badRequest(
				`Cannot ${action} from status ${tc.approvalStatus}. Allowed from: ${transition.from.join(', ')}`
			);
		}

		// Approve action: must not be the author (someone else must approve)
		if (action === 'approve' && tc.createdBy === user.id) {
			return forbidden(
				'You cannot approve your own test case. Another team member must approve it.'
			);
		}

		// Reject action: requires comment
		if (action === 'reject' && !comment) {
			return badRequest('A comment is required when rejecting a test case');
		}

		// Check role for approve/reject: must be PROJECT_ADMIN or QA
		if (action === 'approve' || action === 'reject') {
			const member = await db.query.projectMember.findFirst({
				where: and(eq(projectMember.projectId, projectId), eq(projectMember.userId, user.id))
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
				comment
			});
		});

		// Send notification to test case creator on approve/reject
		if ((action === 'approve' || action === 'reject') && tc.createdBy !== user.id) {
			const statusLabel = action === 'approve' ? 'approved' : 'rejected';
			createNotification({
				userId: tc.createdBy,
				type: 'APPROVAL_STATUS_CHANGED',
				title: `Test case ${statusLabel}`,
				message: `Your test case ${tc.key} has been ${statusLabel}${comment ? ': ' + comment : ''}`,
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

function validateApprovalComment(value: unknown): string | null | Response {
	if (value == null) return null;
	if (typeof value !== 'string') {
		return badRequest('Comment must be a string');
	}
	const comment = value.trim();
	if (comment.length > MAX_COMMENT_LENGTH) {
		return badRequest(`Comment must be ${MAX_COMMENT_LENGTH} characters or less`);
	}
	return comment.length > 0 ? comment : null;
}
