import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, testCase, testCaseVersion, testRun, testExecution, testPlan, testPlanTestCase } from '$lib/server/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

export function registerTestPlanTools(server: McpServer, projectId: number) {
	server.tool(
		'get-test-plan',
		'Get a test plan with its items',
		{ planId: z.number().describe('Test plan ID') },
		async ({ planId }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});

			if (!plan) return { content: [{ type: 'text' as const, text: 'Test plan not found' }], isError: true };

			const items = await db
				.select({
					id: testPlanTestCase.id,
					testCaseId: testPlanTestCase.testCaseId,
					position: testPlanTestCase.position,
					addedAt: testPlanTestCase.addedAt,
					key: testCase.key,
					title: testCaseVersion.title,
					priority: testCaseVersion.priority
				})
				.from(testPlanTestCase)
				.innerJoin(testCase, eq(testPlanTestCase.testCaseId, testCase.id))
				.leftJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
				.where(eq(testPlanTestCase.testPlanId, planId))
				.orderBy(testPlanTestCase.position);

			return { content: [{ type: 'text' as const, text: JSON.stringify({ ...plan, items }, null, 2) }] };
		}
	);

	server.tool(
		'create-test-plan',
		'Create a new test plan',
		{
			name: z.string().describe('Plan name'),
			description: z.string().optional().describe('Plan description'),
			milestone: z.string().optional().describe('Milestone name'),
			startDate: z.string().optional().describe('Start date (ISO string)'),
			endDate: z.string().optional().describe('End date (ISO string)')
		},
		async ({ name, description, milestone, startDate, endDate }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(testPlan)
				.values({
					projectId,
					name,
					description: description ?? null,
					milestone: milestone ?? null,
					startDate: startDate ? new Date(startDate) : null,
					endDate: endDate ? new Date(endDate) : null,
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'update-test-plan',
		'Update an existing test plan',
		{
			planId: z.number().describe('Test plan ID'),
			name: z.string().optional().describe('Plan name'),
			description: z.string().optional().describe('Plan description'),
			status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional().describe('Plan status'),
			milestone: z.string().optional().describe('Milestone name'),
			startDate: z.string().optional().describe('Start date (ISO string)'),
			endDate: z.string().optional().describe('End date (ISO string)')
		},
		async ({ planId, name, description, status, milestone, startDate, endDate }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return { content: [{ type: 'text' as const, text: 'Test plan not found' }], isError: true };

			const updates: Record<string, unknown> = { updatedAt: new Date() };
			if (name !== undefined) updates.name = name;
			if (description !== undefined) updates.description = description;
			if (status !== undefined) updates.status = status;
			if (milestone !== undefined) updates.milestone = milestone;
			if (startDate !== undefined) updates.startDate = new Date(startDate);
			if (endDate !== undefined) updates.endDate = new Date(endDate);

			await db.update(testPlan).set(updates).where(eq(testPlan.id, planId));

			const updated = await db.query.testPlan.findFirst({ where: eq(testPlan.id, planId) });
			return { content: [{ type: 'text' as const, text: JSON.stringify(updated, null, 2) }] };
		}
	);

	server.tool(
		'add-plan-items',
		'Add test cases to a test plan',
		{
			planId: z.number().describe('Test plan ID'),
			testCaseIds: z.array(z.number()).describe('Test case IDs to add')
		},
		async ({ planId, testCaseIds }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return { content: [{ type: 'text' as const, text: 'Test plan not found' }], isError: true };

			const [{ maxPos }] = await db
				.select({ maxPos: sql<number>`coalesce(max(${testPlanTestCase.position}), -1)` })
				.from(testPlanTestCase)
				.where(eq(testPlanTestCase.testPlanId, planId));

			const values = testCaseIds.map((testCaseId, i) => ({
				testPlanId: planId,
				testCaseId,
				position: maxPos + 1 + i
			}));

			await db.insert(testPlanTestCase).values(values).onConflictDoNothing();

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, addedCount: testCaseIds.length }) }] };
		}
	);

	server.tool(
		'remove-plan-items',
		'Remove test cases from a test plan',
		{
			planId: z.number().describe('Test plan ID'),
			testCaseIds: z.array(z.number()).describe('Test case IDs to remove')
		},
		async ({ planId, testCaseIds }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return { content: [{ type: 'text' as const, text: 'Test plan not found' }], isError: true };

			await db
				.delete(testPlanTestCase)
				.where(and(eq(testPlanTestCase.testPlanId, planId), inArray(testPlanTestCase.testCaseId, testCaseIds)));

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, removedCount: testCaseIds.length }) }] };
		}
	);

	server.tool(
		'create-run-from-plan',
		'Create a test run from a test plan',
		{
			planId: z.number().describe('Test plan ID'),
			environment: z.string().describe('Environment name'),
			runName: z.string().optional().describe('Custom run name')
		},
		async ({ planId, environment, runName }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return { content: [{ type: 'text' as const, text: 'Test plan not found' }], isError: true };

			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const planItems = await db
				.select({ testCaseId: testPlanTestCase.testCaseId })
				.from(testPlanTestCase)
				.where(eq(testPlanTestCase.testPlanId, planId))
				.orderBy(testPlanTestCase.position);

			if (planItems.length === 0) {
				return { content: [{ type: 'text' as const, text: 'Test plan has no test cases' }], isError: true };
			}

			const tcIds = planItems.map((i) => i.testCaseId);
			const cases = await db
				.select({ id: testCase.id, latestVersionId: testCase.latestVersionId })
				.from(testCase)
				.where(inArray(testCase.id, tcIds));

			const versionMap = new Map(cases.map((c) => [c.id, c.latestVersionId]));

			const result = await db.transaction(async (tx) => {
				const [run] = await tx
					.insert(testRun)
					.values({
						projectId,
						name: runName ?? `${plan.name} - ${environment}`,
						environment,
						createdBy: proj.createdBy,
						testPlanId: planId
					})
					.returning();

				const executions = tcIds
					.map((tcId) => {
						const versionId = versionMap.get(tcId);
						if (!versionId) return null;
						return { testRunId: run.id, testCaseVersionId: versionId };
					})
					.filter((e): e is NonNullable<typeof e> => e !== null);

				if (executions.length > 0) {
					await tx.insert(testExecution).values(executions);
				}

				return { ...run, executionCount: executions.length, planId };
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
		}
	);
}
