import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, testCase, testCaseVersion, testRun, testExecution, testFailureDetail } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export function registerTestRunTools(server: McpServer, projectId: number) {
	server.tool(
		'get-test-run',
		'Get test run details with execution results',
		{ runId: z.number().describe('Test run ID') },
		async ({ runId }) => {
			const run = await db.query.testRun.findFirst({
				where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
			});

			if (!run) return { content: [{ type: 'text' as const, text: 'Test run not found' }], isError: true };

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

			if (!run) return { content: [{ type: 'text' as const, text: 'Test run not found' }], isError: true };

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

			return { content: [{ type: 'text' as const, text: JSON.stringify(failures, null, 2) }] };
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
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

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
				return { content: [{ type: 'text' as const, text: 'No test cases found' }], isError: true };
			}

			const result = await db.transaction(async (tx) => {
				const [run] = await tx
					.insert(testRun)
					.values({
						projectId,
						name,
						environment,
						createdBy: proj.createdBy
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

			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
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
			if (!run) return { content: [{ type: 'text' as const, text: 'Test run not found' }], isError: true };

			const execution = await db.query.testExecution.findFirst({
				where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
			});
			if (!execution) return { content: [{ type: 'text' as const, text: 'Execution not found' }], isError: true };

			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [detail] = await db
				.insert(testFailureDetail)
				.values({
					testExecutionId: executionId,
					errorMessage: errorMessage ?? null,
					stackTrace: stackTrace ?? null,
					failureEnvironment: failureEnvironment ?? null,
					comment: comment ?? null,
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(detail, null, 2) }] };
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
			if (!run) return { content: [{ type: 'text' as const, text: 'Test run not found' }], isError: true };

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

			return { content: [{ type: 'text' as const, text: JSON.stringify(exportData, null, 2) }] };
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
			if (!run) return { content: [{ type: 'text' as const, text: 'Test run not found' }], isError: true };
			if (run.status === 'COMPLETED') return { content: [{ type: 'text' as const, text: 'Cannot modify completed run' }], isError: true };

			const execution = await db.query.testExecution.findFirst({
				where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
			});
			if (!execution) return { content: [{ type: 'text' as const, text: 'Execution not found' }], isError: true };

			await db
				.update(testExecution)
				.set({ status, executedAt: new Date() })
				.where(eq(testExecution.id, executionId));

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, executionId, status }) }] };
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
			if (!run) return { content: [{ type: 'text' as const, text: 'Test run not found' }], isError: true };
			if (run.status === 'COMPLETED') return { content: [{ type: 'text' as const, text: 'Test run already completed' }], isError: true };

			await db
				.update(testRun)
				.set({ status: 'COMPLETED', finishedAt: new Date() })
				.where(eq(testRun.id, runId));

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, runId, status: 'COMPLETED' }) }] };
		}
	);
}
