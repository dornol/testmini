import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { executionComment, testExecution, testRun, user as userTable } from '$lib/server/db/schema';
import { eq, and, asc, isNull } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';
import { validateCommentContent } from '$lib/server/crud-helpers';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	// Verify execution belongs to run in this project
	const exec = await db
		.select({ id: testExecution.id })
		.from(testExecution)
		.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
		.where(and(
			eq(testExecution.id, executionId),
			eq(testExecution.testRunId, runId),
			eq(testRun.projectId, projectId)
		))
		.limit(1);

	if (exec.length === 0) error(404, 'Execution not found');

	const comments = await db
		.select({
			id: executionComment.id,
			testExecutionId: executionComment.testExecutionId,
			userId: executionComment.userId,
			content: executionComment.content,
			parentId: executionComment.parentId,
			createdAt: executionComment.createdAt,
			updatedAt: executionComment.updatedAt,
			userName: userTable.name,
			userEmail: userTable.email,
			userImage: userTable.image
		})
		.from(executionComment)
		.innerJoin(userTable, eq(executionComment.userId, userTable.id))
		.where(eq(executionComment.testExecutionId, executionId))
		.orderBy(asc(executionComment.createdAt));

	return json(comments);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, user, projectId }) => {
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	// Verify execution belongs to run in this project
	const exec = await db
		.select({ id: testExecution.id })
		.from(testExecution)
		.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
		.where(and(
			eq(testExecution.id, executionId),
			eq(testExecution.testRunId, runId),
			eq(testRun.projectId, projectId)
		))
		.limit(1);

	if (exec.length === 0) error(404, 'Execution not found');

	const body = await parseJsonBody(request);
	const { content: rawContent, parentId } = body as { content?: string; parentId?: number };

	const contentOrError = validateCommentContent(rawContent);
	if (contentOrError instanceof Response) return contentOrError;
	const content = contentOrError;

	if (parentId != null) {
		const parent = await db.query.executionComment.findFirst({
			where: and(
				eq(executionComment.id, parentId),
				eq(executionComment.testExecutionId, executionId),
				isNull(executionComment.parentId)
			)
		});
		if (!parent) return badRequest('Parent comment not found or is already a reply');
	}

	const [inserted] = await db
		.insert(executionComment)
		.values({
			testExecutionId: executionId,
			userId: user.id,
			content,
			parentId: parentId ?? null
		})
		.returning();

	const userData = await db.query.user.findFirst({
		where: eq(userTable.id, user.id)
	});

	return json(
		{
			...inserted,
			userName: userData?.name ?? null,
			userEmail: userData?.email ?? null,
			userImage: userData?.image ?? null
		},
		{ status: 201 }
	);
});
