import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { executionComment, testExecution, testRun } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { validateCommentContent } from '$lib/server/crud-helpers';
import { withProjectAccess } from '$lib/server/api-handler';

async function findScopedComment(
	commentId: number,
	executionId: number,
	runId: number,
	projectId: number
) {
	const [existing] = await db
		.select({
			id: executionComment.id,
			testExecutionId: executionComment.testExecutionId,
			userId: executionComment.userId,
			content: executionComment.content,
			parentId: executionComment.parentId,
			createdAt: executionComment.createdAt,
			updatedAt: executionComment.updatedAt
		})
		.from(executionComment)
		.innerJoin(testExecution, eq(executionComment.testExecutionId, testExecution.id))
		.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
		.where(
			and(
				eq(executionComment.id, commentId),
				eq(executionComment.testExecutionId, executionId),
				eq(testExecution.id, executionId),
				eq(testExecution.testRunId, runId),
				eq(testRun.id, runId),
				eq(testRun.projectId, projectId)
			)
		)
		.limit(1);

	if (!existing) error(404, 'Comment not found');
	return existing;
}

export const PATCH = withProjectAccess(async ({ params, request, user, projectId }) => {
	const runId = parseId(params.runId, 'run ID');
	const executionId = parseId(params.executionId, 'execution ID');
	const commentId = parseId(params.commentId, 'comment ID');
	const existing = await findScopedComment(commentId, executionId, runId, projectId);

	// Only author or global admin can edit
	if (existing.userId !== user.id && user.role !== 'admin') {
		error(403, 'Not authorized to edit this comment');
	}

	const body = await parseJsonBody(request);
	const { content: rawContent } = body as { content?: string };

	const contentOrError = validateCommentContent(rawContent);
	if (contentOrError instanceof Response) return contentOrError;
	const content = contentOrError;

	const [updated] = await db
		.update(executionComment)
		.set({ content })
		.where(
			and(eq(executionComment.id, commentId), eq(executionComment.testExecutionId, executionId))
		)
		.returning();

	return json(updated);
});

export const DELETE = withProjectAccess(async ({ params, user, projectId }) => {
	const runId = parseId(params.runId, 'run ID');
	const executionId = parseId(params.executionId, 'execution ID');
	const commentId = parseId(params.commentId, 'comment ID');
	const existing = await findScopedComment(commentId, executionId, runId, projectId);

	if (existing.userId !== user.id && user.role !== 'admin') {
		error(403, 'Not authorized to delete this comment');
	}

	// Delete comment and its replies
	await db
		.delete(executionComment)
		.where(
			and(
				eq(executionComment.parentId, commentId),
				eq(executionComment.testExecutionId, executionId)
			)
		);
	await db
		.delete(executionComment)
		.where(
			and(eq(executionComment.id, commentId), eq(executionComment.testExecutionId, executionId))
		);

	return json({ success: true });
});
