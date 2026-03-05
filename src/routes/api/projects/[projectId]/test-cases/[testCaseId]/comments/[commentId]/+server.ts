import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseComment, projectMember } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin, parseJsonBody } from '$lib/server/auth-utils';

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

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const testCaseId = Number(params.testCaseId);
	const commentId = Number(params.commentId);

	if (isNaN(projectId) || isNaN(testCaseId) || isNaN(commentId)) {
		error(400, 'Invalid parameters');
	}

	const comment = await resolveComment(testCaseId, projectId, commentId);

	// Only comment author or ADMIN can edit
	const isAdmin = isGlobalAdmin(authUser);
	const memberRole = isAdmin ? null : await getMemberRole(authUser.id, projectId);
	const isAuthor = comment.userId === authUser.id;
	const isProjectAdmin = memberRole === 'PROJECT_ADMIN';

	if (!isAuthor && !isAdmin) {
		error(403, 'You can only edit your own comments');
	}

	const body = await parseJsonBody(request);
	const { content } = body as { content?: string };

	if (!content || typeof content !== 'string' || content.trim().length === 0) {
		return json({ error: 'Content is required' }, { status: 400 });
	}

	if (content.trim().length > 10000) {
		return json({ error: 'Content is too long (max 10000 characters)' }, { status: 400 });
	}

	const [updated] = await db
		.update(testCaseComment)
		.set({ content: content.trim() })
		.where(eq(testCaseComment.id, commentId))
		.returning();

	return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const testCaseId = Number(params.testCaseId);
	const commentId = Number(params.commentId);

	if (isNaN(projectId) || isNaN(testCaseId) || isNaN(commentId)) {
		error(400, 'Invalid parameters');
	}

	const comment = await resolveComment(testCaseId, projectId, commentId);

	// Author, PROJECT_ADMIN, or global ADMIN can delete
	const isAdmin = isGlobalAdmin(authUser);
	const isAuthor = comment.userId === authUser.id;

	if (!isAuthor && !isAdmin) {
		const memberRole = await getMemberRole(authUser.id, projectId);
		if (memberRole !== 'PROJECT_ADMIN') {
			error(403, 'You do not have permission to delete this comment');
		}
	}

	await db.delete(testCaseComment).where(eq(testCaseComment.id, commentId));

	return json({ success: true });
};
