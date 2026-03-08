import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, findTestCaseWithLatestVersion } from '$lib/server/db';
import {
	project,
	projectMember,
	testCase,
	testCaseVersion,
	testRun,
	testExecution,
	testFailureDetail,
	tag,
	testCaseTag
} from '$lib/server/db/schema';
import { eq, and, desc, count, sql, inArray } from 'drizzle-orm';

/**
 * Creates an MCP server scoped to a specific project (authenticated via API key).
 */
export function createMcpServer(projectId: number) {
	const server = new McpServer({
		name: 'testmini',
		version: '1.0.0'
	});

	// ── Resources ─────────────────────────────────────────

	server.resource('test-cases', 'test-cases://list', async () => {
		const cases = await db
			.select({
				id: testCase.id,
				key: testCase.key,
				automationKey: testCase.automationKey,
				title: testCaseVersion.title,
				priority: testCaseVersion.priority,
				createdAt: testCase.createdAt
			})
			.from(testCase)
			.leftJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
			.where(eq(testCase.projectId, projectId))
			.orderBy(testCase.sortOrder);

		return { contents: [{ uri: 'test-cases://list', text: JSON.stringify(cases, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('test-runs', 'test-runs://list', async () => {
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
			.where(eq(testRun.projectId, projectId))
			.orderBy(desc(testRun.createdAt))
			.limit(50);

		return { contents: [{ uri: 'test-runs://list', text: JSON.stringify(runs, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('summary', 'reports://summary', async () => {
		const latestRuns = await db
			.select({
				id: testRun.id,
				name: testRun.name,
				status: testRun.status,
				environment: testRun.environment,
				finishedAt: testRun.finishedAt
			})
			.from(testRun)
			.where(eq(testRun.projectId, projectId))
			.orderBy(desc(testRun.createdAt))
			.limit(5);

		const [tcCount] = await db
			.select({ value: count() })
			.from(testCase)
			.where(eq(testCase.projectId, projectId));

		const summary = {
			totalTestCases: tcCount?.value ?? 0,
			recentRuns: latestRuns
		};

		return { contents: [{ uri: 'reports://summary', text: JSON.stringify(summary, null, 2), mimeType: 'application/json' }] };
	});

	// ── Tools ─────────────────────────────────────────────

	server.tool(
		'search-test-cases',
		'Search test cases by keyword in title, key, or steps',
		{ query: z.string().describe('Search keyword'), limit: z.number().optional().describe('Max results (default 20)') },
		async ({ query, limit }) => {
			const maxResults = Math.min(limit ?? 20, 100);
			const results = await db
				.select({
					id: testCase.id,
					key: testCase.key,
					title: testCaseVersion.title,
					priority: testCaseVersion.priority
				})
				.from(testCase)
				.leftJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
				.where(
					and(
						eq(testCase.projectId, projectId),
						sql`search_vector @@ plainto_tsquery('english', ${query})`
					)
				)
				.limit(maxResults);

			return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
		}
	);

	server.tool(
		'get-test-case',
		'Get full details of a test case by ID or key',
		{ id: z.number().optional().describe('Test case ID'), key: z.string().optional().describe('Test case key (e.g., TC-0001)') },
		async ({ id, key }) => {
			let tc;
			if (id) {
				tc = await findTestCaseWithLatestVersion(id, projectId);
			} else if (key) {
				const found = await db.query.testCase.findFirst({
					where: and(eq(testCase.projectId, projectId), eq(testCase.key, key))
				});
				if (found) tc = await findTestCaseWithLatestVersion(found.id, projectId);
			}

			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			// Load tags
			const tags = await db
				.select({ name: tag.name, color: tag.color })
				.from(testCaseTag)
				.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
				.where(eq(testCaseTag.testCaseId, tc.id));

			return { content: [{ type: 'text' as const, text: JSON.stringify({ ...tc, tags }, null, 2) }] };
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
		'create-test-case',
		'Create a new test case',
		{
			title: z.string().describe('Test case title'),
			priority: z.string().optional().describe('Priority name (default: MEDIUM)'),
			precondition: z.string().optional(),
			steps: z.array(z.object({ action: z.string(), expected: z.string().optional() })).optional(),
			expectedResult: z.string().optional()
		},
		async ({ title, priority, precondition, steps, expectedResult }) => {
			// Get next key
			const [maxRow] = await db
				.select({ maxKey: sql<string>`max(key)` })
				.from(testCase)
				.where(eq(testCase.projectId, projectId));

			const maxNum = maxRow?.maxKey
				? parseInt(maxRow.maxKey.replace(/^TC-/, ''), 10)
				: 0;
			const nextKey = `TC-${String(maxNum + 1).padStart(4, '0')}`;

			// Get project creator for attribution
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const formattedSteps = (steps ?? []).map((s, i) => ({
				order: i + 1,
				action: s.action,
				expected: s.expected ?? ''
			}));

			const result = await db.transaction(async (tx) => {
				const [tc] = await tx
					.insert(testCase)
					.values({
						projectId,
						key: nextKey,
						createdBy: proj.createdBy,
						sortOrder: maxNum + 1
					})
					.returning();

				const [version] = await tx
					.insert(testCaseVersion)
					.values({
						testCaseId: tc.id,
						versionNo: 1,
						title,
						precondition: precondition ?? null,
						steps: formattedSteps,
						expectedResult: expectedResult ?? null,
						priority: priority ?? 'MEDIUM',
						updatedBy: proj.createdBy
					})
					.returning();

				await tx
					.update(testCase)
					.set({ latestVersionId: version.id })
					.where(eq(testCase.id, tc.id));

				return { ...tc, latestVersion: version };
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
		}
	);

	server.tool(
		'update-test-case',
		'Update an existing test case (creates a new version)',
		{
			id: z.number().optional().describe('Test case ID'),
			key: z.string().optional().describe('Test case key (e.g., TC-0001)'),
			title: z.string().optional().describe('New title'),
			priority: z.string().optional().describe('New priority name'),
			precondition: z.string().optional().describe('New precondition'),
			steps: z.array(z.object({ action: z.string(), expected: z.string().optional() })).optional().describe('New steps'),
			expectedResult: z.string().optional().describe('New expected result')
		},
		async ({ id, key, title, priority, precondition, steps, expectedResult }) => {
			let tc;
			if (id) {
				tc = await findTestCaseWithLatestVersion(id, projectId);
			} else if (key) {
				const found = await db.query.testCase.findFirst({
					where: and(eq(testCase.projectId, projectId), eq(testCase.key, key))
				});
				if (found) tc = await findTestCaseWithLatestVersion(found.id, projectId);
			}

			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };
			if (!tc.latestVersion) return { content: [{ type: 'text' as const, text: 'No version found' }], isError: true };

			const prev = tc.latestVersion;
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const formattedSteps = steps
				? steps.map((s, i) => ({ order: i + 1, action: s.action, expected: s.expected ?? '' }))
				: prev.steps;

			const result = await db.transaction(async (tx) => {
				const [version] = await tx
					.insert(testCaseVersion)
					.values({
						testCaseId: tc.id,
						versionNo: prev.versionNo + 1,
						title: title ?? prev.title,
						precondition: precondition !== undefined ? precondition : prev.precondition,
						steps: formattedSteps,
						expectedResult: expectedResult !== undefined ? expectedResult : prev.expectedResult,
						priority: priority ?? prev.priority,
						updatedBy: proj.createdBy
					})
					.returning();

				await tx
					.update(testCase)
					.set({ latestVersionId: version.id })
					.where(eq(testCase.id, tc.id));

				return { ...tc, latestVersion: version };
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
		}
	);

	server.tool(
		'create-test-run',
		'Create a new test run with selected test cases',
		{
			name: z.string().describe('Test run name'),
			environment: z.enum(['DEV', 'QA', 'STAGE', 'PROD']).describe('Environment'),
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

	return server;
}
