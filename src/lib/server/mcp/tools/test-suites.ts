import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testSuite, testSuiteItem } from '$lib/server/db/schema';
import {
	ok,
	err,
	requireProjectCreator,
	buildUpdates,
	mcpPositiveIdSchema,
	mcpIdListSchema
} from '../helpers';
import { eq, and, inArray } from 'drizzle-orm';

export function registerTestSuiteTools(server: McpServer, projectId: number) {
	server.tool(
		'get-test-suite',
		'Get a test suite with its items',
		{ suiteId: mcpPositiveIdSchema.describe('Test suite ID') },
		async ({ suiteId }) => {
			const suite = await db.query.testSuite.findFirst({
				where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
			});

			if (!suite) return err('Test suite not found');

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
				.where(and(eq(testSuiteItem.suiteId, suiteId), eq(testCase.projectId, projectId)));

			return ok({ ...suite, items });
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
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(testSuite)
				.values({ projectId, name, description: description ?? null, createdBy: creator })
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'add-suite-items',
		'Add test cases to a test suite',
		{
			suiteId: mcpPositiveIdSchema.describe('Test suite ID'),
			testCaseIds: mcpIdListSchema.describe('Test case IDs to add')
		},
		async ({ suiteId, testCaseIds }) => {
			const suite = await db.query.testSuite.findFirst({
				where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
			});
			if (!suite) return err('Test suite not found');

			const uniqueTestCaseIds = [...new Set(testCaseIds)];
			const validCases = await db
				.select({ id: testCase.id })
				.from(testCase)
				.where(and(eq(testCase.projectId, projectId), inArray(testCase.id, uniqueTestCaseIds)));
			if (validCases.length !== uniqueTestCaseIds.length) return err('Test case not found');

			const values = testCaseIds.map((testCaseId) => ({ suiteId, testCaseId }));
			await db.insert(testSuiteItem).values(values).onConflictDoNothing();

			return ok({ success: true, suiteId, addedCount: values.length });
		}
	);

	server.tool(
		'remove-suite-items',
		'Remove test cases from a test suite',
		{
			suiteId: mcpPositiveIdSchema.describe('Test suite ID'),
			testCaseIds: mcpIdListSchema.describe('Test case IDs to remove')
		},
		async ({ suiteId, testCaseIds }) => {
			const suite = await db.query.testSuite.findFirst({
				where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
			});
			if (!suite) return err('Test suite not found');

			await db
				.delete(testSuiteItem)
				.where(
					and(eq(testSuiteItem.suiteId, suiteId), inArray(testSuiteItem.testCaseId, testCaseIds))
				);

			return ok({ success: true, suiteId, removedCount: testCaseIds.length });
		}
	);

	server.tool(
		'update-test-suite',
		'Update a test suite name or description',
		{
			suiteId: mcpPositiveIdSchema.describe('Suite ID'),
			name: z.string().optional().describe('New name'),
			description: z.string().optional().describe('New description')
		},
		async ({ suiteId, name, description }) => {
			const s = await db.query.testSuite.findFirst({
				where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
			});
			if (!s) return err('Test suite not found');

			const updates: Record<string, unknown> = {};
			if (name !== undefined) updates.name = name;
			if (description !== undefined) updates.description = description;

			const [updated] = await db
				.update(testSuite)
				.set(updates)
				.where(and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId)))
				.returning();
			return ok(updated);
		}
	);

	server.tool(
		'delete-test-suite',
		'Delete a test suite',
		{ suiteId: mcpPositiveIdSchema.describe('Suite ID') },
		async ({ suiteId }) => {
			const s = await db.query.testSuite.findFirst({
				where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
			});
			if (!s) return err('Test suite not found');

			await db.delete(testSuiteItem).where(eq(testSuiteItem.suiteId, suiteId));
			await db
				.delete(testSuite)
				.where(and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId)));
			return ok({ success: true, deletedId: suiteId });
		}
	);
}
