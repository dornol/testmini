import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseComment, projectMember } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { isGlobalAdmin, parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectAccess } from '$lib/server/api-handler';
import { validateCommentContent } from '$lib/server/crud-helpers';

async function resolveComment(
	testCaseId: number,
	projectId: number,
	commentId: number
) {
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

async function getMemberRole(userId: string, projectId: number): Promise<string | null> {
	const member = await db.query.projectMember.findFirst({
		where: and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId))
	});
	return member?.role ?? null;
}

export const PATCH = withProjectAccess(async ({ params, request, user, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');
	const commentId = parseId(params.commentId, 'comment ID');

	const comment = await resolveComment(testCaseId, projectId, commentId);

	// Only comment author or ADMIN can edit
	const isAdmin = isGlobalAdmin(user);
	const memberRole = isAdmin ? null : await getMemberRole(user.id, projectId);
	const isAuthor = comment.userId === user.id;
	const isProjectAdmin = memberRole === 'PROJECT_ADMIN';

	if (!isAuthor && !isAdmin) {
		error(403, 'You can only edit your own comments');
	}

	const body = await parseJsonBody(request);
	const { content: rawContent } = body as { content?: string };

	const contentOrError = validateCommentContent(rawContent);
	if (contentOrError instanceof Response) return contentOrError;
	const content = contentOrError;

	const [updated] = await db
		.update(testCaseComment)
		.set({ content })
		.where(eq(testCaseComment.id, commentId))
		.returning();

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

	await db.delete(testCaseComment).where(eq(testCaseComment.id, commentId));

	return json({ success: true });
});
