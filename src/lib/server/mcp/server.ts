import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, findTestCaseWithLatestVersion } from '$lib/server/db';
import {
	project,
	projectMember,
	testCase,
	testCaseVersion,
	testCaseGroup,
	testRun,
	testExecution,
	testFailureDetail,
	tag,
	testCaseTag,
	testSuite,
	testSuiteItem,
	testPlan,
	testPlanTestCase,
	testCaseTemplate,
	customField,
	requirement,
	requirementTestCase,
	issueLink,
	exploratorySession,
	sessionNote,
	testCaseComment,
	executionComment,
	approvalHistory,
	environmentConfig,
	priorityConfig
} from '$lib/server/db/schema';
import { eq, and, desc, count, sql, inArray, asc, isNull } from 'drizzle-orm';

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

	server.resource('project', 'projects://current', async () => {
		const proj = await db.query.project.findFirst({
			where: eq(project.id, projectId)
		});

		if (!proj) {
			return { contents: [{ uri: 'projects://current', text: JSON.stringify(null), mimeType: 'application/json' }] };
		}

		const [tcCount] = await db
			.select({ value: count() })
			.from(testCase)
			.where(eq(testCase.projectId, projectId));

		const [runCount] = await db
			.select({ value: count() })
			.from(testRun)
			.where(eq(testRun.projectId, projectId));

		const [suiteCount] = await db
			.select({ value: count() })
			.from(testSuite)
			.where(eq(testSuite.projectId, projectId));

		const [planCount] = await db
			.select({ value: count() })
			.from(testPlan)
			.where(eq(testPlan.projectId, projectId));

		const members = await db
			.select({
				userId: projectMember.userId,
				role: projectMember.role
			})
			.from(projectMember)
			.where(eq(projectMember.projectId, projectId));

		const environments = await db
			.select({ name: environmentConfig.name, color: environmentConfig.color })
			.from(environmentConfig)
			.where(eq(environmentConfig.projectId, projectId))
			.orderBy(asc(environmentConfig.position));

		const priorities = await db
			.select({ name: priorityConfig.name, color: priorityConfig.color })
			.from(priorityConfig)
			.where(eq(priorityConfig.projectId, projectId))
			.orderBy(asc(priorityConfig.position));

		const projectInfo = {
			id: proj.id,
			name: proj.name,
			description: proj.description,
			active: proj.active,
			createdAt: proj.createdAt,
			counts: {
				testCases: tcCount?.value ?? 0,
				testRuns: runCount?.value ?? 0,
				testSuites: suiteCount?.value ?? 0,
				testPlans: planCount?.value ?? 0,
				members: members.length
			},
			members,
			environments,
			priorities
		};

		return { contents: [{ uri: 'projects://current', text: JSON.stringify(projectInfo, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('tags', 'tags://list', async () => {
		const tags = await db
			.select({ id: tag.id, name: tag.name, color: tag.color })
			.from(tag)
			.where(eq(tag.projectId, projectId))
			.orderBy(tag.name);

		return { contents: [{ uri: 'tags://list', text: JSON.stringify(tags, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('test-suites', 'test-suites://list', async () => {
		const suites = await db
			.select({
				id: testSuite.id,
				name: testSuite.name,
				description: testSuite.description,
				createdAt: testSuite.createdAt
			})
			.from(testSuite)
			.where(eq(testSuite.projectId, projectId))
			.orderBy(testSuite.name);

		return { contents: [{ uri: 'test-suites://list', text: JSON.stringify(suites, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('test-plans', 'test-plans://list', async () => {
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
			.where(eq(testPlan.projectId, projectId))
			.orderBy(desc(testPlan.createdAt));

		return { contents: [{ uri: 'test-plans://list', text: JSON.stringify(plans, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('templates', 'templates://list', async () => {
		const templates = await db
			.select({
				id: testCaseTemplate.id,
				name: testCaseTemplate.name,
				description: testCaseTemplate.description,
				priority: testCaseTemplate.priority,
				createdAt: testCaseTemplate.createdAt
			})
			.from(testCaseTemplate)
			.where(eq(testCaseTemplate.projectId, projectId))
			.orderBy(testCaseTemplate.name);

		return { contents: [{ uri: 'templates://list', text: JSON.stringify(templates, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('requirements', 'requirements://list', async () => {
		const reqs = await db
			.select({
				id: requirement.id,
				externalId: requirement.externalId,
				title: requirement.title,
				description: requirement.description,
				source: requirement.source,
				createdAt: requirement.createdAt
			})
			.from(requirement)
			.where(eq(requirement.projectId, projectId))
			.orderBy(requirement.id);

		return { contents: [{ uri: 'requirements://list', text: JSON.stringify(reqs, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('custom-fields', 'custom-fields://list', async () => {
		const fields = await db
			.select({
				id: customField.id,
				name: customField.name,
				fieldType: customField.fieldType,
				options: customField.options,
				required: customField.required,
				sortOrder: customField.sortOrder
			})
			.from(customField)
			.where(eq(customField.projectId, projectId))
			.orderBy(customField.sortOrder);

		return { contents: [{ uri: 'custom-fields://list', text: JSON.stringify(fields, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('exploratory-sessions', 'exploratory-sessions://list', async () => {
		const sessions = await db
			.select({
				id: exploratorySession.id,
				title: exploratorySession.title,
				charter: exploratorySession.charter,
				status: exploratorySession.status,
				environment: exploratorySession.environment,
				tags: exploratorySession.tags,
				startedAt: exploratorySession.startedAt,
				completedAt: exploratorySession.completedAt
			})
			.from(exploratorySession)
			.where(eq(exploratorySession.projectId, projectId))
			.orderBy(desc(exploratorySession.startedAt))
			.limit(50);

		return { contents: [{ uri: 'exploratory-sessions://list', text: JSON.stringify(sessions, null, 2), mimeType: 'application/json' }] };
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

	server.tool(
		'delete-test-case',
		'Delete a test case by ID or key',
		{
			id: z.number().optional().describe('Test case ID'),
			key: z.string().optional().describe('Test case key (e.g., TC-0001)')
		},
		async ({ id, key }) => {
			let tcId: number | undefined;
			if (id) {
				tcId = id;
			} else if (key) {
				const found = await db.query.testCase.findFirst({
					where: and(eq(testCase.projectId, projectId), eq(testCase.key, key))
				});
				tcId = found?.id;
			}
			if (!tcId) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			await db.delete(testCase).where(and(eq(testCase.id, tcId), eq(testCase.projectId, projectId)));
			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: tcId }) }] };
		}
	);

	// ── Tag Tools ────────────────────────────────────────

	server.tool(
		'create-tag',
		'Create a new tag',
		{
			name: z.string().describe('Tag name'),
			color: z.string().optional().describe('Tag color hex (default: #6b7280)')
		},
		async ({ name, color }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(tag)
				.values({ projectId, name, color: color ?? '#6b7280', createdBy: proj.createdBy })
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'delete-tag',
		'Delete a tag by ID',
		{ tagId: z.number().describe('Tag ID') },
		async ({ tagId }) => {
			const t = await db.query.tag.findFirst({
				where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
			});
			if (!t) return { content: [{ type: 'text' as const, text: 'Tag not found' }], isError: true };

			await db.delete(testCaseTag).where(eq(testCaseTag.tagId, tagId));
			await db.delete(tag).where(eq(tag.id, tagId));
			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: tagId }) }] };
		}
	);

	server.tool(
		'add-tag-to-test-case',
		'Add a tag to a test case',
		{
			testCaseId: z.number().describe('Test case ID'),
			tagId: z.number().describe('Tag ID')
		},
		async ({ testCaseId, tagId }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			const t = await db.query.tag.findFirst({
				where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
			});
			if (!t) return { content: [{ type: 'text' as const, text: 'Tag not found' }], isError: true };

			await db
				.insert(testCaseTag)
				.values({ testCaseId, tagId })
				.onConflictDoNothing();

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, testCaseId, tagId }) }] };
		}
	);

	server.tool(
		'remove-tag-from-test-case',
		'Remove a tag from a test case',
		{
			testCaseId: z.number().describe('Test case ID'),
			tagId: z.number().describe('Tag ID')
		},
		async ({ testCaseId, tagId }) => {
			await db
				.delete(testCaseTag)
				.where(and(eq(testCaseTag.testCaseId, testCaseId), eq(testCaseTag.tagId, tagId)));

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, testCaseId, tagId }) }] };
		}
	);

	// ── Group Tools ──────────────────────────────────────

	server.tool(
		'list-groups',
		'List test case groups (sections)',
		{},
		async () => {
			const groups = await db
				.select({
					id: testCaseGroup.id,
					name: testCaseGroup.name,
					sortOrder: testCaseGroup.sortOrder,
					color: testCaseGroup.color
				})
				.from(testCaseGroup)
				.where(eq(testCaseGroup.projectId, projectId))
				.orderBy(testCaseGroup.sortOrder);

			return { content: [{ type: 'text' as const, text: JSON.stringify(groups, null, 2) }] };
		}
	);

	server.tool(
		'create-group',
		'Create a test case group (section)',
		{
			name: z.string().describe('Group name'),
			color: z.string().optional().describe('Group color hex')
		},
		async ({ name, color }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(testCaseGroup)
				.values({ projectId, name, color: color ?? null, createdBy: proj.createdBy })
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'delete-group',
		'Delete a test case group',
		{ groupId: z.number().describe('Group ID') },
		async ({ groupId }) => {
			const g = await db.query.testCaseGroup.findFirst({
				where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
			});
			if (!g) return { content: [{ type: 'text' as const, text: 'Group not found' }], isError: true };

			// Unassign test cases from this group
			await db
				.update(testCase)
				.set({ groupId: null })
				.where(and(eq(testCase.projectId, projectId), eq(testCase.groupId, groupId)));

			await db.delete(testCaseGroup).where(eq(testCaseGroup.id, groupId));
			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: groupId }) }] };
		}
	);

	// ── Test Suite Tools ─────────────────────────────────

	server.tool(
		'get-test-suite',
		'Get test suite details with its test cases',
		{ suiteId: z.number().describe('Test suite ID') },
		async ({ suiteId }) => {
			const suite = await db.query.testSuite.findFirst({
				where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
			});
			if (!suite) return { content: [{ type: 'text' as const, text: 'Test suite not found' }], isError: true };

			const items = await db
				.select({
					testCaseId: testSuiteItem.testCaseId,
					testCaseKey: testCase.key,
					testCaseTitle: testCaseVersion.title,
					addedAt: testSuiteItem.addedAt
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

			const values = testCaseIds.map((tcId) => ({ suiteId, testCaseId: tcId }));
			if (values.length > 0) {
				await db.insert(testSuiteItem).values(values).onConflictDoNothing();
			}

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

			if (testCaseIds.length > 0) {
				await db
					.delete(testSuiteItem)
					.where(and(eq(testSuiteItem.suiteId, suiteId), inArray(testSuiteItem.testCaseId, testCaseIds)));
			}

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, suiteId, removedCount: testCaseIds.length }) }] };
		}
	);

	// ── Test Plan Tools ──────────────────────────────────

	server.tool(
		'get-test-plan',
		'Get test plan details with its test cases',
		{ planId: z.number().describe('Test plan ID') },
		async ({ planId }) => {
			const plan = await db.query.testPlan.findFirst({
				where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
			});
			if (!plan) return { content: [{ type: 'text' as const, text: 'Test plan not found' }], isError: true };

			const items = await db
				.select({
					testCaseId: testPlanTestCase.testCaseId,
					position: testPlanTestCase.position,
					testCaseKey: testCase.key,
					testCaseTitle: testCaseVersion.title,
					addedAt: testPlanTestCase.addedAt
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
			startDate: z.string().optional().describe('Start date (ISO 8601)'),
			endDate: z.string().optional().describe('End date (ISO 8601)')
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
		'Update a test plan (name, description, status, milestone, dates)',
		{
			planId: z.number().describe('Test plan ID'),
			name: z.string().optional().describe('New name'),
			description: z.string().optional().describe('New description'),
			status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional().describe('New status'),
			milestone: z.string().optional().describe('New milestone'),
			startDate: z.string().optional().describe('New start date (ISO 8601)'),
			endDate: z.string().optional().describe('New end date (ISO 8601)')
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

			// Get current max position
			const [maxPos] = await db
				.select({ value: sql<number>`coalesce(max(${testPlanTestCase.position}), -1)` })
				.from(testPlanTestCase)
				.where(eq(testPlanTestCase.testPlanId, planId));

			let pos = (maxPos?.value ?? -1) + 1;
			const values = testCaseIds.map((tcId) => ({
				testPlanId: planId,
				testCaseId: tcId,
				position: pos++
			}));

			if (values.length > 0) {
				await db.insert(testPlanTestCase).values(values).onConflictDoNothing();
			}

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, planId, addedCount: values.length }) }] };
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

			if (testCaseIds.length > 0) {
				await db
					.delete(testPlanTestCase)
					.where(and(eq(testPlanTestCase.testPlanId, planId), inArray(testPlanTestCase.testCaseId, testCaseIds)));
			}

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, planId, removedCount: testCaseIds.length }) }] };
		}
	);

	server.tool(
		'create-run-from-plan',
		'Create a test run from a test plan',
		{
			planId: z.number().describe('Test plan ID'),
			environment: z.string().describe('Environment name'),
			runName: z.string().optional().describe('Custom run name (default: plan name)')
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

			const result = await db.transaction(async (tx) => {
				const [run] = await tx
					.insert(testRun)
					.values({
						projectId,
						name: runName ?? plan.name,
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

				return { ...run, executionCount: executionValues.length, planId };
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
		}
	);

	// ── Template Tools ───────────────────────────────────

	server.tool(
		'get-template',
		'Get a test case template by ID',
		{ templateId: z.number().describe('Template ID') },
		async ({ templateId }) => {
			const tmpl = await db.query.testCaseTemplate.findFirst({
				where: and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId))
			});
			if (!tmpl) return { content: [{ type: 'text' as const, text: 'Template not found' }], isError: true };

			return { content: [{ type: 'text' as const, text: JSON.stringify(tmpl, null, 2) }] };
		}
	);

	server.tool(
		'create-template',
		'Create a new test case template',
		{
			name: z.string().describe('Template name'),
			description: z.string().optional(),
			priority: z.string().optional().describe('Default priority (default: MEDIUM)'),
			precondition: z.string().optional(),
			steps: z.array(z.object({ action: z.string(), expected: z.string().optional() })).optional()
		},
		async ({ name, description, priority, precondition, steps }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const formattedSteps = (steps ?? []).map((s, i) => ({
				order: i + 1,
				action: s.action,
				expected: s.expected ?? ''
			}));

			const [created] = await db
				.insert(testCaseTemplate)
				.values({
					projectId,
					name,
					description: description ?? null,
					priority: priority ?? 'MEDIUM',
					precondition: precondition ?? null,
					steps: formattedSteps,
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'create-test-case-from-template',
		'Create a new test case from a template',
		{
			templateId: z.number().describe('Template ID'),
			title: z.string().describe('Test case title (overrides template)')
		},
		async ({ templateId, title }) => {
			const tmpl = await db.query.testCaseTemplate.findFirst({
				where: and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId))
			});
			if (!tmpl) return { content: [{ type: 'text' as const, text: 'Template not found' }], isError: true };

			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [maxRow] = await db
				.select({ maxKey: sql<string>`max(key)` })
				.from(testCase)
				.where(eq(testCase.projectId, projectId));

			const maxNum = maxRow?.maxKey ? parseInt(maxRow.maxKey.replace(/^TC-/, ''), 10) : 0;
			const nextKey = `TC-${String(maxNum + 1).padStart(4, '0')}`;

			const result = await db.transaction(async (tx) => {
				const [tc] = await tx
					.insert(testCase)
					.values({ projectId, key: nextKey, createdBy: proj.createdBy, sortOrder: maxNum + 1 })
					.returning();

				const [version] = await tx
					.insert(testCaseVersion)
					.values({
						testCaseId: tc.id,
						versionNo: 1,
						title,
						precondition: tmpl.precondition,
						steps: tmpl.steps,
						expectedResult: null,
						priority: tmpl.priority,
						updatedBy: proj.createdBy
					})
					.returning();

				await tx.update(testCase).set({ latestVersionId: version.id }).where(eq(testCase.id, tc.id));
				return { ...tc, latestVersion: version };
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
		}
	);

	// ── Requirement Tools ────────────────────────────────

	server.tool(
		'create-requirement',
		'Create a new requirement',
		{
			title: z.string().describe('Requirement title'),
			externalId: z.string().optional().describe('External ID (e.g., JIRA key)'),
			description: z.string().optional(),
			source: z.string().optional().describe('Source system (e.g., Jira, Confluence)')
		},
		async ({ title, externalId, description, source }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(requirement)
				.values({
					projectId,
					title,
					externalId: externalId ?? null,
					description: description ?? null,
					source: source ?? null,
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'link-requirement-test-case',
		'Link a requirement to a test case',
		{
			requirementId: z.number().describe('Requirement ID'),
			testCaseId: z.number().describe('Test case ID')
		},
		async ({ requirementId, testCaseId: tcId }) => {
			const req = await db.query.requirement.findFirst({
				where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
			});
			if (!req) return { content: [{ type: 'text' as const, text: 'Requirement not found' }], isError: true };

			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, tcId), eq(testCase.projectId, projectId))
			});
			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			await db
				.insert(requirementTestCase)
				.values({ requirementId, testCaseId: tcId })
				.onConflictDoNothing();

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, requirementId, testCaseId: tcId }) }] };
		}
	);

	server.tool(
		'get-traceability-matrix',
		'Get requirements traceability matrix with test case coverage',
		{},
		async () => {
			const reqs = await db
				.select({
					id: requirement.id,
					externalId: requirement.externalId,
					title: requirement.title,
					source: requirement.source
				})
				.from(requirement)
				.where(eq(requirement.projectId, projectId))
				.orderBy(requirement.id);

			const links = await db
				.select({
					requirementId: requirementTestCase.requirementId,
					testCaseId: requirementTestCase.testCaseId,
					testCaseKey: testCase.key,
					testCaseTitle: testCaseVersion.title
				})
				.from(requirementTestCase)
				.innerJoin(testCase, eq(requirementTestCase.testCaseId, testCase.id))
				.leftJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
				.innerJoin(requirement, eq(requirementTestCase.requirementId, requirement.id))
				.where(eq(requirement.projectId, projectId));

			const linkMap = new Map<number, typeof links>();
			for (const l of links) {
				const list = linkMap.get(l.requirementId) ?? [];
				list.push(l);
				linkMap.set(l.requirementId, list);
			}

			const matrix = reqs.map((r) => ({
				...r,
				testCases: (linkMap.get(r.id) ?? []).map((l) => ({
					testCaseId: l.testCaseId,
					key: l.testCaseKey,
					title: l.testCaseTitle
				})),
				covered: (linkMap.get(r.id) ?? []).length > 0
			}));

			const summary = {
				totalRequirements: reqs.length,
				coveredRequirements: matrix.filter((r) => r.covered).length,
				uncoveredRequirements: matrix.filter((r) => !r.covered).length,
				coveragePercent: reqs.length > 0 ? Math.round((matrix.filter((r) => r.covered).length / reqs.length) * 100) : 0
			};

			return { content: [{ type: 'text' as const, text: JSON.stringify({ summary, matrix }, null, 2) }] };
		}
	);

	// ── Issue Link Tools ─────────────────────────────────

	server.tool(
		'list-issue-links',
		'List issue links for a test case or all project issue links',
		{
			testCaseId: z.number().optional().describe('Filter by test case ID'),
			executionId: z.number().optional().describe('Filter by execution ID')
		},
		async ({ testCaseId: tcId, executionId }) => {
			let condition = eq(issueLink.projectId, projectId);
			if (tcId) condition = and(condition, eq(issueLink.testCaseId, tcId))!;
			if (executionId) condition = and(condition, eq(issueLink.testExecutionId, executionId))!;

			const links = await db
				.select({
					id: issueLink.id,
					testCaseId: issueLink.testCaseId,
					testExecutionId: issueLink.testExecutionId,
					externalUrl: issueLink.externalUrl,
					externalKey: issueLink.externalKey,
					title: issueLink.title,
					status: issueLink.status,
					provider: issueLink.provider,
					createdAt: issueLink.createdAt
				})
				.from(issueLink)
				.where(condition)
				.orderBy(desc(issueLink.createdAt));

			return { content: [{ type: 'text' as const, text: JSON.stringify(links, null, 2) }] };
		}
	);

	server.tool(
		'create-issue-link',
		'Link an external issue to a test case or execution',
		{
			externalUrl: z.string().describe('External issue URL'),
			externalKey: z.string().optional().describe('External issue key (e.g., PROJ-123)'),
			title: z.string().optional().describe('Issue title'),
			provider: z.string().describe('Provider (jira, github, gitlab, custom)'),
			testCaseId: z.number().optional().describe('Test case ID to link to'),
			executionId: z.number().optional().describe('Execution ID to link to')
		},
		async ({ externalUrl, externalKey, title, provider, testCaseId: tcId, executionId }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(issueLink)
				.values({
					projectId,
					testCaseId: tcId ?? null,
					testExecutionId: executionId ?? null,
					externalUrl,
					externalKey: externalKey ?? null,
					title: title ?? null,
					provider,
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	// ── Exploratory Session Tools ────────────────────────

	server.tool(
		'create-exploratory-session',
		'Create a new exploratory testing session',
		{
			title: z.string().describe('Session title'),
			charter: z.string().optional().describe('Test charter (what to explore)'),
			environment: z.string().optional().describe('Environment name'),
			tags: z.array(z.string()).optional().describe('Session tags')
		},
		async ({ title, charter, environment, tags: sessionTags }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(exploratorySession)
				.values({
					projectId,
					title,
					charter: charter ?? null,
					environment: environment ?? null,
					tags: sessionTags ?? [],
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'get-exploratory-session',
		'Get exploratory session details with notes',
		{ sessionId: z.number().describe('Session ID') },
		async ({ sessionId }) => {
			const session = await db.query.exploratorySession.findFirst({
				where: and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
			});
			if (!session) return { content: [{ type: 'text' as const, text: 'Session not found' }], isError: true };

			const notes = await db
				.select({
					id: sessionNote.id,
					content: sessionNote.content,
					noteType: sessionNote.noteType,
					timestamp: sessionNote.timestamp,
					createdAt: sessionNote.createdAt
				})
				.from(sessionNote)
				.where(eq(sessionNote.sessionId, sessionId))
				.orderBy(sessionNote.timestamp);

			return { content: [{ type: 'text' as const, text: JSON.stringify({ ...session, notes }, null, 2) }] };
		}
	);

	server.tool(
		'update-exploratory-session',
		'Update exploratory session (pause, resume, complete)',
		{
			sessionId: z.number().describe('Session ID'),
			status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).optional().describe('New status'),
			summary: z.string().optional().describe('Session summary (for completion)')
		},
		async ({ sessionId, status, summary }) => {
			const session = await db.query.exploratorySession.findFirst({
				where: and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
			});
			if (!session) return { content: [{ type: 'text' as const, text: 'Session not found' }], isError: true };

			const updates: Record<string, unknown> = {};
			if (status !== undefined) updates.status = status;
			if (summary !== undefined) updates.summary = summary;
			if (status === 'COMPLETED') updates.completedAt = new Date();

			await db.update(exploratorySession).set(updates).where(eq(exploratorySession.id, sessionId));

			const updated = await db.query.exploratorySession.findFirst({ where: eq(exploratorySession.id, sessionId) });
			return { content: [{ type: 'text' as const, text: JSON.stringify(updated, null, 2) }] };
		}
	);

	server.tool(
		'add-session-note',
		'Add a note to an exploratory session',
		{
			sessionId: z.number().describe('Session ID'),
			content: z.string().describe('Note content'),
			noteType: z.enum(['NOTE', 'BUG', 'QUESTION', 'IDEA']).optional().describe('Note type (default: NOTE)'),
			timestamp: z.number().optional().describe('Elapsed seconds from session start')
		},
		async ({ sessionId, content: noteContent, noteType, timestamp: ts }) => {
			const session = await db.query.exploratorySession.findFirst({
				where: and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
			});
			if (!session) return { content: [{ type: 'text' as const, text: 'Session not found' }], isError: true };

			// Calculate elapsed seconds if not provided
			const elapsed = ts ?? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);

			const [created] = await db
				.insert(sessionNote)
				.values({
					sessionId,
					content: noteContent,
					noteType: noteType ?? 'NOTE',
					timestamp: elapsed
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	// ── Comment Tools ────────────────────────────────────

	server.tool(
		'add-test-case-comment',
		'Add a comment to a test case',
		{
			testCaseId: z.number().describe('Test case ID'),
			content: z.string().describe('Comment content')
		},
		async ({ testCaseId: tcId, content: commentContent }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, tcId), eq(testCase.projectId, projectId))
			});
			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(testCaseComment)
				.values({ testCaseId: tcId, userId: proj.createdBy, content: commentContent })
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'list-test-case-comments',
		'List comments on a test case',
		{ testCaseId: z.number().describe('Test case ID') },
		async ({ testCaseId: tcId }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, tcId), eq(testCase.projectId, projectId))
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
				.where(eq(testCaseComment.testCaseId, tcId))
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
		async ({ runId, executionId, content: commentContent }) => {
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
				.values({ testExecutionId: executionId, userId: proj.createdBy, content: commentContent })
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	// ── Approval Workflow Tool ───────────────────────────

	server.tool(
		'update-approval-status',
		'Update test case approval status (DRAFT → IN_REVIEW → APPROVED/REJECTED)',
		{
			testCaseId: z.number().describe('Test case ID'),
			toStatus: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED']).describe('New approval status'),
			comment: z.string().optional().describe('Approval comment')
		},
		async ({ testCaseId: tcId, toStatus, comment: approvalComment }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, tcId), eq(testCase.projectId, projectId))
			});
			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const fromStatus = tc.approvalStatus ?? 'DRAFT';

			await db.transaction(async (tx) => {
				await tx
					.update(testCase)
					.set({ approvalStatus: toStatus })
					.where(eq(testCase.id, tcId));

				await tx.insert(approvalHistory).values({
					testCaseId: tcId,
					fromStatus,
					toStatus,
					userId: proj.createdBy,
					comment: approvalComment ?? null
				});
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, testCaseId: tcId, fromStatus, toStatus }) }] };
		}
	);

	return server;
}
