import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testRun, testExecution, testCaseVersion } from '$lib/server/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ projectId, url }) => {
	const runIdsParam = url.searchParams.get('runIds');
	if (!runIdsParam) return badRequest('runIds parameter required');

	const runIds = runIdsParam
		.split(',')
		.map(Number)
		.filter((id) => !isNaN(id) && id > 0);

	if (runIds.length < 2) return badRequest('At least 2 run IDs required');

	// Verify runs belong to project
	const runs = await db
		.select({ id: testRun.id, name: testRun.name, environment: testRun.environment })
		.from(testRun)
		.where(and(eq(testRun.projectId, projectId), inArray(testRun.id, runIds)));

	if (runs.length < 2) return badRequest('At least 2 valid runs required');

	// Get executions for all runs
	const executions = await db
		.select({
			runId: testExecution.testRunId,
			testCaseVersionId: testExecution.testCaseVersionId,
			status: testExecution.status,
			title: testCaseVersion.title,
			testCaseId: sql<number>`(select id from test_case where latest_version_id = ${testExecution.testCaseVersionId} limit 1)::int`
		})
		.from(testExecution)
		.innerJoin(testCaseVersion, eq(testCaseVersion.id, testExecution.testCaseVersionId))
		.where(inArray(testExecution.testRunId, runs.map((r) => r.id)));

	// Build matrix: testCaseId -> { env -> status }
	const matrixMap = new Map<number, { testCaseId: number; title: string; results: Record<string, string> }>();

	for (const exec of executions) {
		const tcId = exec.testCaseId;
		if (!tcId) continue;
		const run = runs.find((r) => r.id === exec.runId);
		if (!run) continue;

		if (!matrixMap.has(tcId)) {
			matrixMap.set(tcId, { testCaseId: tcId, title: exec.title, results: {} });
		}
		matrixMap.get(tcId)!.results[run.environment] = exec.status;
	}

	// Per-environment pass rates
	const envStats = runs.map((run) => {
		const runExecs = executions.filter((e) => e.runId === run.id);
		const total = runExecs.length;
		const passed = runExecs.filter((e) => e.status === 'PASS').length;
		const failed = runExecs.filter((e) => e.status === 'FAIL').length;
		return {
			runId: run.id,
			environment: run.environment,
			name: run.name,
			total,
			passed,
			failed,
			passRate: total > 0 ? Math.round((passed / total) * 100) : 0
		};
	});

	// Detect env-specific failures: test cases that fail in some envs but pass in others
	const envSpecificFailures = Array.from(matrixMap.values()).filter((entry) => {
		const statuses = Object.values(entry.results);
		return statuses.includes('FAIL') && statuses.includes('PASS');
	});

	return json({
		environments: runs.map((r) => r.environment),
		runs: runs.map((r) => ({ id: r.id, name: r.name, environment: r.environment })),
		matrix: Array.from(matrixMap.values()),
		envStats,
		envSpecificFailures: envSpecificFailures.map((f) => ({
			testCaseId: f.testCaseId,
			title: f.title,
			failedIn: Object.entries(f.results)
				.filter(([, s]) => s === 'FAIL')
				.map(([env]) => env),
			passedIn: Object.entries(f.results)
				.filter(([, s]) => s === 'PASS')
				.map(([env]) => env)
		}))
	});
});
