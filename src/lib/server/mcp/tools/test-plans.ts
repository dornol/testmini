import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testRun,
	testExecution,
	testPlan,
	testPlanTestCase,
	testPlanSignoff
} from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema, mcpIdListSchema } from '../helpers';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { createTestPlanSchema, updateTestPlanSchema } from '$lib/schemas/test-plan.schema';

function firstValidationError(error: { issues: Array<{ message: string }> }): string {
	return error.issues[0]?.message ?? 'Invalid test plan';
}

function isMcpErrorResult(result: unknown): result is ReturnType<typeof err> {
	return (
		typeof result === 'object' &&
		result !== null &&
		'isError' in result &&
		(result as { isError?: unknown }).isError === true
	);
}

export function registerTestPlanTools(server: McpServer, projectId: number) {
	server.tool(
		'get-test-plan',
		'Get a test plan with its items',
		{ planId: mcpPositiveIdSchema.describe('Test plan ID') },
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
				.where(and(eq(testPlanTestCase.testPlanId, planId), eq(testCase.projectId, projectId)))
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

			const parsed = createTestPlanSchema.safeParse({
				name: name.trim(),
				description: description?.trim(),
				milestone: milestone?.trim(),
				startDate: startDate?.trim(),
				endDate: endDate?.trim()
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const [created] = await db
				.insert(testPlan)
				.values({
					projectId,
					name: parsed.data.name,
					description: parsed.data.description || null,
					milestone: parsed.data.milestone || null,
					startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
					endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
					createdBy: creator
				})
				.returning();

			if (!created) return err('Failed to create test plan');
			return ok(created);
		}
	);

	server.tool(
		'update-test-plan',
		'Update an existing test plan',
		{
			planId: mcpPositiveIdSchema.describe('Test plan ID'),
			name: z.string().optional().describe('Plan name'),
			description: z.string().optional().describe('Plan description'),
			status: z
				.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'])
				.optional()
				.describe('Plan status'),
			milestone: z.string().optional().describe('Milestone name'),
			startDate: z.string().optional().describe('Start date (ISO string)'),
			endDate: z.string().optional().describe('End date (ISO string)')
		},
		async ({ planId, name, description, status, milestone, startDate, endDate }) => {
			const parsed = updateTestPlanSchema.safeParse({
				name: name?.trim(),
				description: description?.trim(),
				status,
				milestone: milestone?.trim(),
				startDate: startDate?.trim(),
				endDate: endDate?.trim()
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const updates: Record<string, unknown> = { updatedAt: new Date() };
			if (parsed.data.name !== undefined) updates.name = parsed.data.name;
			if (parsed.data.description !== undefined)
				updates.description = parsed.data.description || null;
			if (parsed.data.status !== undefined) updates.status = parsed.data.status;
			if (parsed.data.milestone !== undefined) updates.milestone = parsed.data.milestone || null;
			if (parsed.data.startDate !== undefined)
				updates.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
			if (parsed.data.endDate !== undefined)
				updates.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;

			if (Object.keys(updates).length === 1) return err('No fields to update');

			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return err('Test plan not found');

			const [updated] = await db
				.update(testPlan)
				.set(updates)
				.where(and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId)))
				.returning();
			if (!updated) return err('Test plan not found');
			return ok(updated);
		}
	);

	server.tool(
		'add-plan-items',
		'Add test cases to a test plan',
		{
			planId: mcpPositiveIdSchema.describe('Test plan ID'),
			testCaseIds: mcpIdListSchema.describe('Test case IDs to add')
		},
		async ({ planId, testCaseIds }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return err('Test plan not found');

			const validTestCases = await db
				.select({ id: testCase.id })
				.from(testCase)
				.where(and(eq(testCase.projectId, projectId), inArray(testCase.id, testCaseIds)));
			const validIds = new Set(validTestCases.map((tc) => tc.id));
			const invalidIds = testCaseIds.filter((id) => !validIds.has(id));
			if (invalidIds.length > 0) {
				return err(`Test case IDs not found in this project: ${invalidIds.join(', ')}`);
			}

			const [{ maxPos }] = await db
				.select({ maxPos: sql<number>`coalesce(max(${testPlanTestCase.position}), -1)` })
				.from(testPlanTestCase)
				.where(eq(testPlanTestCase.testPlanId, planId));

			const values = testCaseIds.map((testCaseId, i) => ({
				testPlanId: planId,
				testCaseId,
				position: maxPos + 1 + i
			}));

			const inserted = await db
				.insert(testPlanTestCase)
				.values(values)
				.onConflictDoNothing()
				.returning({ id: testPlanTestCase.id });

			return ok({ success: true, addedCount: inserted.length });
		}
	);

	server.tool(
		'remove-plan-items',
		'Remove test cases from a test plan',
		{
			planId: mcpPositiveIdSchema.describe('Test plan ID'),
			testCaseIds: mcpIdListSchema.describe('Test case IDs to remove')
		},
		async ({ planId, testCaseIds }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return err('Test plan not found');

			const deleted = await db
				.delete(testPlanTestCase)
				.where(
					and(
						eq(testPlanTestCase.testPlanId, planId),
						inArray(testPlanTestCase.testCaseId, testCaseIds)
					)
				)
				.returning({ id: testPlanTestCase.id });

			return ok({ success: true, removedCount: deleted.length });
		}
	);

	server.tool(
		'create-run-from-plan',
		'Create a test run from a test plan',
		{
			planId: mcpPositiveIdSchema.describe('Test plan ID'),
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
				.where(and(eq(testCase.projectId, projectId), inArray(testCase.id, tcIds)));

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
					.returning({ id: testRun.id, name: testRun.name, environment: testRun.environment });

				if (!run) {
					return err('Failed to create test run from plan');
				}

				const executions = tcIds
					.map((tcId) => {
						const versionId = versionMap.get(tcId);
						if (!versionId) return null;
						return { testRunId: run.id, testCaseVersionId: versionId };
					})
					.filter((e): e is NonNullable<typeof e> => e !== null);

				if (executions.length > 0) {
					const insertedExecutions = await tx
						.insert(testExecution)
						.values(executions)
						.returning({ id: testExecution.id });
					if (insertedExecutions.length !== executions.length) {
						return err('Failed to create all test run executions');
					}
				}

				return { ...run, executionCount: executions.length, planId };
			});

			if (isMcpErrorResult(result)) return result;
			return ok(result);
		}
	);

	server.tool(
		'list-plan-signoffs',
		'List signoff decisions for a test plan',
		{ planId: mcpPositiveIdSchema.describe('Test plan ID') },
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
		{ planId: mcpPositiveIdSchema.describe('Test plan ID') },
		async ({ planId }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return err('Test plan not found');

			const deleted = await db.transaction(async (tx) => {
				await tx.delete(testPlanTestCase).where(eq(testPlanTestCase.testPlanId, planId));
				const [deletedPlan] = await tx
					.delete(testPlan)
					.where(and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId)))
					.returning();
				return deletedPlan;
			});
			if (!deleted) return err('Test plan not found');

			return ok({ success: true, deletedId: planId });
		}
	);

	server.tool('list-test-plans', 'List all test plans for the project', {}, async () => {
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
	});
}
