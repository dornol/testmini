import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, testCase, testRun, testExecution, testCaseComment, executionComment } from '$lib/server/db/schema';
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
			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(testCaseComment)
				.values({
					testCaseId,
					userId: proj.createdBy,
					content
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
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
			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

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

			return { content: [{ type: 'text' as const, text: JSON.stringify(comments, null, 2) }] };
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
			if (!run) return { content: [{ type: 'text' as const, text: 'Test run not found' }], isError: true };

			const execution = await db.query.testExecution.findFirst({
				where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
			});
			if (!execution) return { content: [{ type: 'text' as const, text: 'Execution not found' }], isError: true };

			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(executionComment)
				.values({
					testExecutionId: executionId,
					userId: proj.createdBy,
					content
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);
}
