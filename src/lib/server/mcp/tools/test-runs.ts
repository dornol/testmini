import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testRun, testExecution, testFailureDetail } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, buildUpdates } from '../helpers';
import { eq, and, inArray, desc } from 'drizzle-orm';

export function registerTestRunTools(server: McpServer, projectId: number) {
	server.tool(
		'list-test-runs',
		'List all test runs for the project',
		{
			status: z.enum(['CREATED', 'IN_PROGRESS', 'COMPLETED']).optional().describe('Filter by status'),
			limit: z.number().optional().describe('Max results (default 50)')
		},
		async ({ status, limit }) => {
			const conditions = [eq(testRun.projectId, projectId)];
			if (status) conditions.push(eq(testRun.status, status));

			const runs = await db
				.select({
					id: testRun.id,
					name: testRun.name,
					environment: testRun.environment,
					status: testRun.status,
					createdAt: testRun.createdAt,
					finishedAt: testRun.finishedAt
				})
				.from(testRun)
				.where(and(...conditions))
				.orderBy(desc(testRun.createdAt))
				.limit(limit ?? 50);

			return ok(runs);
		}
	);

	server.tool(
		'get-test-run',
		'Get test run details with execution results',
		{ runId: z.number().describe('Test run ID') },
		async ({ runId }) => {
			const run = await db.query.testRun.findFirst({
				where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
			});

			if (!run) return err('Test run not found');

			const executions = await db
				.select({
					id: testExecution.id,
					status: testExecution.status,
					executedAt: testExecution.executedAt,
					testCaseKey: testCase.key,
					testCaseTitle: testCaseVersion.title
				})
				.from(testExecution)
				.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
				.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
				.where(eq(testExecution.testRunId, runId));

			const statusCounts = { PASS: 0, FAIL: 0, BLOCKED: 0, SKIPPED: 0, PENDING: 0 };
			for (const e of executions) {
				if (e.status in statusCounts) statusCounts[e.status as keyof typeof statusCounts]++;
			}

			return {
				content: [{
					type: 'text' as const,
					text: JSON.stringify({ ...run, statusCounts, executions }, null, 2)
				}]
			};
		}
	);

	server.tool(
		'get-failures',
		'Get failure details for a test run',
		{ runId: z.number().describe('Test run ID') },
		async ({ runId }) => {
			const run = await db.query.testRun.findFirst({
				where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
			});

			if (!run) return err('Test run not found');

			const failures = await db
				.select({
					executionId: testExecution.id,
					testCaseKey: testCase.key,
					testCaseTitle: testCaseVersion.title,
					errorMessage: testFailureDetail.errorMessage,
					stackTrace: testFailureDetail.stackTrace,
					failureEnvironment: testFailureDetail.failureEnvironment,
					comment: testFailureDetail.comment
				})
				.from(testFailureDetail)
				.innerJoin(testExecution, eq(testFailureDetail.testExecutionId, testExecution.id))
				.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
				.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
				.where(eq(testExecution.testRunId, runId));

			return ok(failures);
		}
	);

	server.tool(
		'create-test-run',
		'Create a new test run with selected test cases',
		{
			name: z.string().describe('Test run name'),
			environment: z.string().describe('Environment name (e.g., DEV, QA, STAGE, PROD)'),
			testCaseIds: z.array(z.number()).optional().describe('Test case IDs to include (empty = all)')
		},
		async ({ name, environment, testCaseIds }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			// Get test cases with latest versions
			let cases;
			if (testCaseIds && testCaseIds.length > 0) {
				cases = await db
					.select({ id: testCase.id, latestVersionId: testCase.latestVersionId })
					.from(testCase)
					.where(and(eq(testCase.projectId, projectId), inArray(testCase.id, testCaseIds)));
			} else {
				cases = await db
					.select({ id: testCase.id, latestVersionId: testCase.latestVersionId })
					.from(testCase)
					.where(eq(testCase.projectId, projectId));
			}

			if (cases.length === 0) {
				return err('No test cases found');
			}

			const result = await db.transaction(async (tx) => {
				const [run] = await tx
					.insert(testRun)
					.values({
						projectId,
						name,
						environment,
						createdBy: creator
					})
					.returning();

				const executionValues = cases
					.filter((c) => c.latestVersionId !== null)
					.map((c) => ({
						testRunId: run.id,
						testCaseVersionId: c.latestVersionId!
					}));

				if (executionValues.length > 0) {
					await tx.insert(testExecution).values(executionValues);
				}

				return { ...run, executionCount: executionValues.length };
			});

			return ok(result);
		}
	);

	server.tool(
		'record-failure-detail',
		'Record failure details for a failed test execution',
		{
			runId: z.number().describe('Test run ID'),
			executionId: z.number().describe('Execution ID'),
			errorMessage: z.string().optional().describe('Error message'),
			stackTrace: z.string().optional().describe('Stack trace'),
			failureEnvironment: z.string().optional().describe('Environment details (OS, browser, etc.)'),
			comment: z.string().optional().describe('Additional comment')
		},
		async ({ runId, executionId, errorMessage, stackTrace, failureEnvironment, comment }) => {
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

			const [detail] = await db
				.insert(testFailureDetail)
				.values({
					testExecutionId: executionId,
					errorMessage: errorMessage ?? null,
					stackTrace: stackTrace ?? null,
					failureEnvironment: failureEnvironment ?? null,
					comment: comment ?? null,
					createdBy: creator
				})
				.returning();

			return ok(detail);
		}
	);

	server.tool(
		'export-run-results',
		'Export test run results as structured data',
		{ runId: z.number().describe('Test run ID') },
		async ({ runId }) => {
			const run = await db.query.testRun.findFirst({
				where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
			});
			if (!run) return err('Test run not found');

			const executions = await db
				.select({
					executionId: testExecution.id,
					status: testExecution.status,
					executedAt: testExecution.executedAt,
					testCaseKey: testCase.key,
					testCaseTitle: testCaseVersion.title,
					priority: testCaseVersion.priority
				})
				.from(testExecution)
				.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
				.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
				.where(eq(testExecution.testRunId, runId));

			const failures = await db
				.select({
					executionId: testFailureDetail.testExecutionId,
					errorMessage: testFailureDetail.errorMessage,
					stackTrace: testFailureDetail.stackTrace,
					failureEnvironment: testFailureDetail.failureEnvironment,
					comment: testFailureDetail.comment
				})
				.from(testFailureDetail)
				.innerJoin(testExecution, eq(testFailureDetail.testExecutionId, testExecution.id))
				.where(eq(testExecution.testRunId, runId));

			const failureMap = new Map<number, typeof failures>();
			for (const f of failures) {
				const list = failureMap.get(f.executionId) ?? [];
				list.push(f);
				failureMap.set(f.executionId, list);
			}

			const statusCounts = { PASS: 0, FAIL: 0, BLOCKED: 0, SKIPPED: 0, PENDING: 0 };
			const results = executions.map((e) => {
				if (e.status in statusCounts) statusCounts[e.status as keyof typeof statusCounts]++;
				return {
					...e,
					failures: failureMap.get(e.executionId) ?? []
				};
			});

			const exportData = {
				run: { id: run.id, name: run.name, environment: run.environment, status: run.status, createdAt: run.createdAt, finishedAt: run.finishedAt },
				statusCounts,
				totalExecutions: executions.length,
				results
			};

			return ok(exportData);
		}
	);

	server.tool(
		'update-execution-status',
		'Update the execution status of a test case in a run',
		{
			runId: z.number().describe('Test run ID'),
			executionId: z.number().describe('Execution ID'),
			status: z.enum(['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'PENDING']).describe('New status')
		},
		async ({ runId, executionId, status }) => {
			const run = await db.query.testRun.findFirst({
				where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
			});
			if (!run) return err('Test run not found');
			if (run.status === 'COMPLETED') return err('Cannot modify completed run');

			const execution = await db.query.testExecution.findFirst({
				where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
			});
			if (!execution) return err('Execution not found');

			await db
				.update(testExecution)
				.set({ status, executedAt: new Date() })
				.where(eq(testExecution.id, executionId));

			return ok({ success: true, executionId, status });
		}
	);

	server.tool(
		'complete-test-run',
		'Complete a test run (set status to COMPLETED)',
		{ runId: z.number().describe('Test run ID') },
		async ({ runId }) => {
			const run = await db.query.testRun.findFirst({
				where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
			});
			if (!run) return err('Test run not found');
			if (run.status === 'COMPLETED') return err('Test run already completed');

			await db
				.update(testRun)
				.set({ status: 'COMPLETED', finishedAt: new Date() })
				.where(eq(testRun.id, runId));

			return ok({ success: true, runId, status: 'COMPLETED' });
		}
	);

	server.tool(
		'bulk-update-execution-status',
		'Update multiple execution statuses at once in a test run',
		{
			runId: z.number().describe('Test run ID'),
			updates: z.array(z.object({
				executionId: z.number().describe('Execution ID'),
				status: z.enum(['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'PENDING']).describe('New status')
			})).describe('Array of { executionId, status } updates')
		},
		async ({ runId, updates }) => {
			const run = await db.query.testRun.findFirst({
				where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
			});
			if (!run) return err('Test run not found');
			if (run.status === 'COMPLETED') return err('Cannot modify completed run');

			// Validate all executionIds belong to this run
			const execIds = updates.map((u) => u.executionId);
			const validExecs = await db
				.select({ id: testExecution.id })
				.from(testExecution)
				.where(and(eq(testExecution.testRunId, runId), inArray(testExecution.id, execIds)));
			const validIds = new Set(validExecs.map((e) => e.id));
			const invalidIds = execIds.filter((id) => !validIds.has(id));
			if (invalidIds.length > 0) return err(`Execution IDs not found in this run: ${invalidIds.join(', ')}`);

			// Batch update by grouping same status
			const byStatus = new Map<string, number[]>();
			for (const u of updates) {
				const list = byStatus.get(u.status) ?? [];
				list.push(u.executionId);
				byStatus.set(u.status, list);
			}
			const now = new Date();
			for (const [status, ids] of byStatus) {
				await db
					.update(testExecution)
					.set({ status: status as typeof testExecution.status.enumValues[number], executedAt: now })
					.where(and(eq(testExecution.testRunId, runId), inArray(testExecution.id, ids)));
			}

			return ok({ success: true, runId, updatedCount: updates.length });
		}
	);

	server.tool(
		'update-test-run',
		'Update a test run name or environment',
		{
			runId: z.number().describe('Test run ID'),
			name: z.string().optional().describe('New name'),
			environment: z.string().optional().describe('New environment')
		},
		async ({ runId, name, environment }) => {
			const run = await db.query.testRun.findFirst({
				where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
			});
			if (!run) return err('Test run not found');

			const updates: Record<string, unknown> = {};
			if (name !== undefined) updates.name = name;
			if (environment !== undefined) updates.environment = environment;

			const [updated] = await db.update(testRun).set(updates).where(eq(testRun.id, runId)).returning();
			return ok(updated);
		}
	);

	server.tool(
		'delete-test-run',
		'Delete a test run and all its executions',
		{ runId: z.number().describe('Test run ID') },
		async ({ runId }) => {
			const run = await db.query.testRun.findFirst({
				where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
			});
			if (!run) return err('Test run not found');

			await db.delete(testRun).where(eq(testRun.id, runId));
			return ok({ success: true, deletedId: runId });
		}
	);
}
