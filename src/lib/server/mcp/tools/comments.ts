import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testRun, testExecution, testCaseComment, executionComment } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and } from 'drizzle-orm';

export function registerCommentTools(server: McpServer, projectId: number) {
	server.tool(
		'add-test-case-comment',
		'Add a comment to a test case',
		{
			testCaseId: z.number().describe('Test case ID'),
			content: z.string().describe('Comment content')
		},
		async ({ testCaseId, content }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return err('Test case not found');

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
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return err('Test case not found');

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
			const run = await db.query.testRun.findFirst({
				where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
			});
			if (!run) return err('Test run not found');

			const execution = await db.query.testExecution.findFirst({
				where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
			});
			if (!execution) return err('Execution not found');

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
}
