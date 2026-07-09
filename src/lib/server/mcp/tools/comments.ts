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
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and, desc } from 'drizzle-orm';

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
			testCaseId: z.number().describe('Test case ID'),
			content: z.string().describe('Comment content')
		},
		async ({ testCaseId, content }) => {
			const validationError = await requireProjectTestCase(testCaseId);
			if (validationError) return validationError;

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(testCaseComment)
				.values({
					testCaseId,
					userId: creator,
					content
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'list-test-case-comments',
		'List comments on a test case',
		{
			testCaseId: z.number().describe('Test case ID')
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
			runId: z.number().describe('Test run ID'),
			executionId: z.number().describe('Execution ID'),
			content: z.string().describe('Comment content')
		},
		async ({ runId, executionId, content }) => {
			const validationError = await requireProjectExecution(runId, executionId);
			if (validationError) return validationError;

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(executionComment)
				.values({
					testExecutionId: executionId,
					userId: creator,
					content
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'update-test-case-comment',
		'Update a test case comment',
		{
			testCaseId: z.number().describe('Test case ID'),
			commentId: z.number().describe('Comment ID'),
			content: z.string().describe('Updated content')
		},
		async ({ testCaseId, commentId, content }) => {
			const validationError = await requireProjectTestCase(testCaseId);
			if (validationError) return validationError;

			const [updated] = await db
				.update(testCaseComment)
				.set({ content })
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
			testCaseId: z.number().describe('Test case ID'),
			commentId: z.number().describe('Comment ID')
		},
		async ({ testCaseId, commentId }) => {
			const validationError = await requireProjectTestCase(testCaseId);
			if (validationError) return validationError;

			await db
				.delete(testCaseComment)
				.where(and(eq(testCaseComment.id, commentId), eq(testCaseComment.testCaseId, testCaseId)));
			return ok({ success: true, deletedId: commentId });
		}
	);

	server.tool(
		'list-execution-comments',
		'List comments on a test execution',
		{
			runId: z.number().describe('Test run ID'),
			executionId: z.number().describe('Execution ID')
		},
		async ({ runId, executionId }) => {
			const validationError = await requireProjectExecution(runId, executionId);
			if (validationError) return validationError;

			const comments = await db
				.select()
				.from(executionComment)
				.where(eq(executionComment.testExecutionId, executionId))
				.orderBy(desc(executionComment.createdAt));

			return ok(comments);
		}
	);
}
