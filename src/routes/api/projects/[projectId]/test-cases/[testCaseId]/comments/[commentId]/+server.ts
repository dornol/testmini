import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseComment } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { isGlobalAdmin, parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectAccess } from '$lib/server/api-handler';
import {
	COMMENT_UPDATE_FIELDS,
	validateCommentContent,
	validateCommentRequestBody
} from '$lib/server/crud-helpers';
import { getMemberRole } from '$lib/server/queries';

async function resolveComment(testCaseId: number, projectId: number, commentId: number) {
	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});

	if (!tc) {
		error(404, 'Test case not found');
	}

	const comment = await db.query.testCaseComment.findFirst({
		where: and(eq(testCaseComment.id, commentId), eq(testCaseComment.testCaseId, testCaseId))
	});

	if (!comment) {
		error(404, 'Comment not found');
	}

	return comment;
}

export const PATCH = withProjectAccess(async ({ params, request, user, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');
	const commentId = parseId(params.commentId, 'comment ID');

	const comment = await resolveComment(testCaseId, projectId, commentId);

	// Only comment author or ADMIN can edit
	const isAdmin = isGlobalAdmin(user);
	const memberRole = isAdmin ? null : await getMemberRole(user.id, projectId);
	const isAuthor = comment.userId === user.id;

	if (!isAuthor && !isAdmin) {
		error(403, 'You can only edit your own comments');
	}

	const bodyOrError = validateCommentRequestBody(
		await parseJsonBody(request),
		COMMENT_UPDATE_FIELDS
	);
	if (bodyOrError instanceof Response) return bodyOrError;
	const { content: rawContent } = bodyOrError;

	const contentOrError = validateCommentContent(rawContent);
	if (contentOrError instanceof Response) return contentOrError;
	const content = contentOrError;

	const [updated] = await db
		.update(testCaseComment)
		.set({ content })
		.where(
			and(
				eq(testCaseComment.id, commentId),
				eq(testCaseComment.testCaseId, testCaseId),
				sql`exists (select 1 from test_case where id = ${testCaseId} and project_id = ${projectId})`
			)
		)
		.returning();

	if (!updated) {
		error(404, 'Comment not found');
	}

	return json(updated);
});

export const DELETE = withProjectAccess(async ({ params, user, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');
	const commentId = parseId(params.commentId, 'comment ID');

	const comment = await resolveComment(testCaseId, projectId, commentId);

	// Author, PROJECT_ADMIN, or global ADMIN can delete
	const isAdmin = isGlobalAdmin(user);
	const isAuthor = comment.userId === user.id;

	if (!isAuthor && !isAdmin) {
		const memberRole = await getMemberRole(user.id, projectId);
		if (memberRole !== 'PROJECT_ADMIN') {
			error(403, 'You do not have permission to delete this comment');
		}
	}

	const [deleted] = await db
		.delete(testCaseComment)
		.where(
			and(
				eq(testCaseComment.id, commentId),
				eq(testCaseComment.testCaseId, testCaseId),
				sql`exists (select 1 from test_case where id = ${testCaseId} and project_id = ${projectId})`
			)
		)
		.returning();

	if (!deleted) {
		error(404, 'Comment not found');
	}

	return json({ success: true });
});
