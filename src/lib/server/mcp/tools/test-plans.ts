import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testRun, testExecution, testPlan, testPlanTestCase, testPlanSignoff } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, buildUpdates } from '../helpers';
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

			if (!plan) return err('Test plan not found');

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

			return ok({ ...plan, items });
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
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(testPlan)
				.values({
					projectId,
					name,
					description: description ?? null,
					milestone: milestone ?? null,
					startDate: startDate ? new Date(startDate) : null,
					endDate: endDate ? new Date(endDate) : null,
					createdBy: creator
				})
				.returning();

			return ok(created);
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
			if (!plan) return err('Test plan not found');

			const updates: Record<string, unknown> = { updatedAt: new Date() };
			if (name !== undefined) updates.name = name;
			if (description !== undefined) updates.description = description;
			if (status !== undefined) updates.status = status;
			if (milestone !== undefined) updates.milestone = milestone;
			if (startDate !== undefined) updates.startDate = new Date(startDate);
			if (endDate !== undefined) updates.endDate = new Date(endDate);

			await db.update(testPlan).set(updates).where(eq(testPlan.id, planId));

			const updated = await db.query.testPlan.findFirst({ where: eq(testPlan.id, planId) });
			return ok(updated);
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
			if (!plan) return err('Test plan not found');

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

			return ok({ success: true, addedCount: testCaseIds.length });
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
			if (!plan) return err('Test plan not found');

			await db
				.delete(testPlanTestCase)
				.where(and(eq(testPlanTestCase.testPlanId, planId), inArray(testPlanTestCase.testCaseId, testCaseIds)));

			return ok({ success: true, removedCount: testCaseIds.length });
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
			if (!plan) return err('Test plan not found');

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const planItems = await db
				.select({ testCaseId: testPlanTestCase.testCaseId })
				.from(testPlanTestCase)
				.where(eq(testPlanTestCase.testPlanId, planId))
				.orderBy(testPlanTestCase.position);

			if (planItems.length === 0) {
				return err('Test plan has no test cases');
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
						createdBy: creator,
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

			return ok(result);
		}
	);

	server.tool(
		'list-plan-signoffs',
		'List signoff decisions for a test plan',
		{ planId: z.number().describe('Test plan ID') },
		async ({ planId }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return err('Test plan not found');

			const signoffs = await db.query.testPlanSignoff.findMany({
				where: eq(testPlanSignoff.testPlanId, planId)
			});

			return ok(signoffs);
		}
	);

	server.tool(
		'delete-test-plan',
		'Delete a test plan',
		{ planId: z.number().describe('Test plan ID') },
		async ({ planId }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return err('Test plan not found');

			await db.delete(testPlanTestCase).where(eq(testPlanTestCase.testPlanId, planId));
			await db.delete(testPlan).where(eq(testPlan.id, planId));
			return ok({ success: true, deletedId: planId });
		}
	);

	server.tool(
		'list-test-plans',
		'List all test plans for the project',
		{},
		async () => {
			const plans = await db
				.select({
					id: testPlan.id,
					name: testPlan.name,
					status: testPlan.status,
					milestone: testPlan.milestone,
					startDate: testPlan.startDate,
					endDate: testPlan.endDate,
					createdAt: testPlan.createdAt
				})
				.from(testPlan)
				.where(eq(testPlan.projectId, projectId));

			return ok(plans);
		}
	);
}
