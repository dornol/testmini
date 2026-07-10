import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import {
	testCase,
	testRun,
	testExecution,
	testCaseComment,
	executionComment
} from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import { eq, and, desc } from 'drizzle-orm';
import { validateCommentContent } from '$lib/server/crud-helpers';

async function mcpValidationError(
	response: Response,
	fallback: string
): Promise<ReturnType<typeof err>> {
	const body = (await response.json().catch(() => null)) as { error?: string } | null;
	return err(body?.error ?? fallback);
}

export function registerCommentTools(server: McpServer, projectId: number) {
	async function requireProjectTestCase(testCaseId: number) {
		const tc = await db.query.testCase.findFirst({
			where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
		});
		return tc ? null : err('Test case not found');
	}

	async function requireProjectExecution(runId: number, executionId: number) {
		const run = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
		});
		if (!run) return err('Test run not found');

		const execution = await db.query.testExecution.findFirst({
			where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
		});
		return execution ? null : err('Execution not found');
	}

	server.tool(
		'add-test-case-comment',
		'Add a comment to a test case',
		{
			testCaseId: mcpPositiveIdSchema.describe('Test case ID'),
			content: z.string().describe('Comment content')
		},
		async ({ testCaseId, content }) => {
			const contentOrError = validateCommentContent(content);
			if (contentOrError instanceof Response) {
				return mcpValidationError(contentOrError, 'Invalid comment');
			}

			const validationError = await requireProjectTestCase(testCaseId);
			if (validationError) return validationError;

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(testCaseComment)
				.values({
					testCaseId,
					userId: creator,
					content: contentOrError
				})
				.returning();

			if (!created) return err('Failed to create test case comment');
			return ok(created);
		}
	);

	server.tool(
		'list-test-case-comments',
		'List comments on a test case',
		{
			testCaseId: mcpPositiveIdSchema.describe('Test case ID')
		},
		async ({ testCaseId }) => {
			const validationError = await requireProjectTestCase(testCaseId);
			if (validationError) return validationError;

			const comments = await db
				.select({
					id: testCaseComment.id,
					content: testCaseComment.content,
					userId: testCaseComment.userId,
					parentId: testCaseComment.parentId,
					createdAt: testCaseComment.createdAt
				})
				.from(testCaseComment)
				.where(eq(testCaseComment.testCaseId, testCaseId))
				.orderBy(testCaseComment.createdAt);

			return ok(comments);
		}
	);

	server.tool(
		'add-execution-comment',
		'Add a comment to a test execution',
		{
			runId: mcpPositiveIdSchema.describe('Test run ID'),
			executionId: mcpPositiveIdSchema.describe('Execution ID'),
			content: z.string().describe('Comment content')
		},
		async ({ runId, executionId, content }) => {
			const contentOrError = validateCommentContent(content);
			if (contentOrError instanceof Response) {
				return mcpValidationError(contentOrError, 'Invalid comment');
			}

			const validationError = await requireProjectExecution(runId, executionId);
			if (validationError) return validationError;

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(executionComment)
				.values({
					testExecutionId: executionId,
					userId: creator,
					content: contentOrError
				})
				.returning();

			if (!created) return err('Failed to create execution comment');
			return ok(created);
		}
	);

	server.tool(
		'update-test-case-comment',
		'Update a test case comment',
		{
			testCaseId: mcpPositiveIdSchema.describe('Test case ID'),
			commentId: mcpPositiveIdSchema.describe('Comment ID'),
			content: z.string().describe('Updated content')
		},
		async ({ testCaseId, commentId, content }) => {
			const contentOrError = validateCommentContent(content);
			if (contentOrError instanceof Response) {
				return mcpValidationError(contentOrError, 'Invalid comment');
			}

			const validationError = await requireProjectTestCase(testCaseId);
			if (validationError) return validationError;

			const [updated] = await db
				.update(testCaseComment)
				.set({ content: contentOrError })
				.where(and(eq(testCaseComment.id, commentId), eq(testCaseComment.testCaseId, testCaseId)))
				.returning();
			if (!updated) return err('Comment not found');
			return ok(updated);
		}
	);

	server.tool(
		'delete-test-case-comment',
		'Delete a test case comment',
		{
			testCaseId: mcpPositiveIdSchema.describe('Test case ID'),
			commentId: mcpPositiveIdSchema.describe('Comment ID')
		},
		async ({ testCaseId, commentId }) => {
			const validationError = await requireProjectTestCase(testCaseId);
			if (validationError) return validationError;

			const [deleted] = await db
				.delete(testCaseComment)
				.where(and(eq(testCaseComment.id, commentId), eq(testCaseComment.testCaseId, testCaseId)))
				.returning({ id: testCaseComment.id });
			if (!deleted) return err('Comment not found');
			return ok({ success: true, deletedId: commentId });
		}
	);

	server.tool(
		'list-execution-comments',
		'List comments on a test execution',
		{
			runId: mcpPositiveIdSchema.describe('Test run ID'),
			executionId: mcpPositiveIdSchema.describe('Execution ID')
		},
		async ({ runId, executionId }) => {
			const validationError = await requireProjectExecution(runId, executionId);
			if (validationError) return validationError;

			const comments = await db
				.select()
				.from(executionComment)
				.innerJoin(testExecution, eq(executionComment.testExecutionId, testExecution.id))
				.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
				.where(
					and(
						eq(executionComment.testExecutionId, executionId),
						eq(testExecution.testRunId, runId),
						eq(testRun.projectId, projectId)
					)
				)
				.orderBy(desc(executionComment.createdAt));

			return ok(comments);
		}
	);
}
