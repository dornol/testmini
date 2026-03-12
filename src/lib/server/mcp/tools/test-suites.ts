import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, testCase, testCaseVersion, testSuite, testSuiteItem } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export function registerTestSuiteTools(server: McpServer, projectId: number) {
	server.tool(
		'get-test-suite',
		'Get a test suite with its items',
		{ suiteId: z.number().describe('Test suite ID') },
		async ({ suiteId }) => {
			const suite = await db.query.testSuite.findFirst({
				where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
			});

			if (!suite) return { content: [{ type: 'text' as const, text: 'Test suite not found' }], isError: true };

			const items = await db
				.select({
					id: testSuiteItem.id,
					testCaseId: testSuiteItem.testCaseId,
					addedAt: testSuiteItem.addedAt,
					key: testCase.key,
					title: testCaseVersion.title,
					priority: testCaseVersion.priority
				})
				.from(testSuiteItem)
				.innerJoin(testCase, eq(testSuiteItem.testCaseId, testCase.id))
				.leftJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
				.where(eq(testSuiteItem.suiteId, suiteId));

			return { content: [{ type: 'text' as const, text: JSON.stringify({ ...suite, items }, null, 2) }] };
		}
	);

	server.tool(
		'create-test-suite',
		'Create a new test suite',
		{
			name: z.string().describe('Suite name'),
			description: z.string().optional().describe('Suite description')
		},
		async ({ name, description }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(testSuite)
				.values({ projectId, name, description: description ?? null, createdBy: proj.createdBy })
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'add-suite-items',
		'Add test cases to a test suite',
		{
			suiteId: z.number().describe('Test suite ID'),
			testCaseIds: z.array(z.number()).describe('Test case IDs to add')
		},
		async ({ suiteId, testCaseIds }) => {
			const suite = await db.query.testSuite.findFirst({
				where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
			});
			if (!suite) return { content: [{ type: 'text' as const, text: 'Test suite not found' }], isError: true };

			const values = testCaseIds.map((testCaseId) => ({ suiteId, testCaseId }));
			await db.insert(testSuiteItem).values(values).onConflictDoNothing();

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, suiteId, addedCount: values.length }) }] };
		}
	);

	server.tool(
		'remove-suite-items',
		'Remove test cases from a test suite',
		{
			suiteId: z.number().describe('Test suite ID'),
			testCaseIds: z.array(z.number()).describe('Test case IDs to remove')
		},
		async ({ suiteId, testCaseIds }) => {
			const suite = await db.query.testSuite.findFirst({
				where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
			});
			if (!suite) return { content: [{ type: 'text' as const, text: 'Test suite not found' }], isError: true };

			await db
				.delete(testSuiteItem)
				.where(and(eq(testSuiteItem.suiteId, suiteId), inArray(testSuiteItem.testCaseId, testCaseIds)));

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, suiteId, removedCount: testCaseIds.length }) }] };
		}
	);
}
