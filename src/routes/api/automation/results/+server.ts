import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { project, testCase, testRun, testExecution, testFailureDetail } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { authenticateApiKey } from '$lib/server/api-key-auth';

interface AutomationResult {
	automationKey: string;
	status: 'PASS' | 'FAIL' | 'SKIP';
	errorMessage?: string;
	duration?: number;
}

interface AutomationResultsRequest {
	environment?: string;
	runName?: string;
	results: AutomationResult[];
}

export const POST: RequestHandler = async ({ request }) => {
	// Authenticate via API key (no user session)
	const auth = await authenticateApiKey(request);
	if (!auth) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const { projectId } = auth;

	let body: AutomationResultsRequest;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const { results } = body;

	if (!Array.isArray(results) || results.length === 0) {
		return json({ error: 'results array is required and must not be empty' }, { status: 400 });
	}

	// Validate each result entry
	const validStatuses = ['PASS', 'FAIL', 'SKIP'];
	for (const r of results) {
		if (!r.automationKey || typeof r.automationKey !== 'string') {
			return json({ error: 'Each result must have an automationKey' }, { status: 400 });
		}
		if (!validStatuses.includes(r.status)) {
			return json(
				{ error: `Invalid status "${r.status}". Must be PASS, FAIL, or SKIP` },
				{ status: 400 }
			);
		}
	}

	// Build run name and environment
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const runName =
		body.runName ??
		`CI Run ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

	const envInput = (body.environment ?? 'QA').toUpperCase();
	const validEnvs = ['DEV', 'QA', 'STAGE', 'PROD'];
	const environment = (validEnvs.includes(envInput) ? envInput : 'QA') as
		| 'DEV'
		| 'QA'
		| 'STAGE'
		| 'PROD';

	// Verify project exists and get creator for run attribution
	const projectRecord = await db.query.project.findFirst({
		where: eq(project.id, projectId)
	});

	if (!projectRecord) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const createdBy = projectRecord.createdBy;

	// Look up test cases by automationKey within the project
	const automationKeys = [...new Set(results.map((r) => r.automationKey))];

	const matchedCases = await db
		.select({
			id: testCase.id,
			automationKey: testCase.automationKey,
			latestVersionId: testCase.latestVersionId
		})
		.from(testCase)
		.where(and(eq(testCase.projectId, projectId), inArray(testCase.automationKey, automationKeys)));

	const caseByKey = new Map(matchedCases.map((tc) => [tc.automationKey!, tc]));
	const unmatched: string[] = automationKeys.filter((k) => !caseByKey.has(k));

	const finalResults: { automationKey: string; status: string; testCaseId: number | null }[] = [];

	const runId = await db.transaction(async (tx) => {
		// 1. Create test run
		const [run] = await tx
			.insert(testRun)
			.values({
				projectId,
				name: runName,
				environment,
				status: 'IN_PROGRESS',
				startedAt: now,
				createdBy
			})
			.returning();

		// 2. Create executions for each result
		for (const result of results) {
			const tc = caseByKey.get(result.automationKey);

			if (!tc || !tc.latestVersionId) {
				finalResults.push({
					automationKey: result.automationKey,
					status: result.status,
					testCaseId: null
				});
				continue;
			}

			const executionStatus: 'PASS' | 'FAIL' | 'SKIPPED' =
				result.status === 'PASS' ? 'PASS' : result.status === 'FAIL' ? 'FAIL' : 'SKIPPED';

			const [execution] = await tx
				.insert(testExecution)
				.values({
					testRunId: run.id,
					testCaseVersionId: tc.latestVersionId,
					status: executionStatus,
					executedAt: now,
					executedBy: createdBy
				})
				.returning();

			// 3. For FAIL results with errorMessage, record failure detail
			if (result.status === 'FAIL' && result.errorMessage) {
				await tx.insert(testFailureDetail).values({
					testExecutionId: execution.id,
					errorMessage: result.errorMessage,
					failureEnvironment: environment,
					comment: result.duration != null ? `Duration: ${result.duration}ms` : null,
					createdBy
				});
			}

			finalResults.push({
				automationKey: result.automationKey,
				status: result.status,
				testCaseId: tc.id
			});
		}

		// 4. Mark run as completed
		await tx
			.update(testRun)
			.set({ status: 'COMPLETED', finishedAt: new Date() })
			.where(eq(testRun.id, run.id));

		return run.id;
	});

	const matched = finalResults.filter((r) => r.testCaseId !== null).length;

	return json({
		runId,
		matched,
		unmatched,
		results: finalResults
	});
};
