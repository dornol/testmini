import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { unauthorized, badRequest, notFound } from '$lib/server/errors';
import { db } from '$lib/server/db';
import {
	project,
	projectMember,
	testCase,
	testRun,
	testExecution,
	testFailureDetail
} from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { authenticateApiKey } from '$lib/server/api-key-auth';
import { createNotification } from '$lib/server/notifications';
import { parseJsonBody } from '$lib/server/auth-utils';

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

const MAX_RESULTS = 10_000;
const MAX_AUTOMATION_KEY_LENGTH = 255;
const MAX_RUN_NAME_LENGTH = 200;
const MAX_ENVIRONMENT_LENGTH = 64;
const MAX_ERROR_MESSAGE_LENGTH = 10_000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

function validateOptionalString(
	value: unknown,
	label: string,
	maxLength: number
): string | Response | undefined {
	if (value == null) return undefined;
	if (typeof value !== 'string') return badRequest(`${label} must be a string`);
	const trimmed = value.trim();
	if (!trimmed) return badRequest(`${label} must not be empty`);
	if (trimmed.length > maxLength)
		return badRequest(`${label} must not exceed ${maxLength} characters`);
	return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

export const POST: RequestHandler = async ({ request }) => {
	// Authenticate via API key (no user session)
	const auth = await authenticateApiKey(request);
	if (!auth) {
		return unauthorized('Unauthorized');
	}
	const { projectId } = auth;

	let body: AutomationResultsRequest;
	try {
		body = (await parseJsonBody(request)) as typeof body;
	} catch {
		return badRequest('Invalid request body');
	}
	if (!isRecord(body)) {
		return badRequest('Invalid request body');
	}

	const runNameInput = validateOptionalString(body.runName, 'runName', MAX_RUN_NAME_LENGTH);
	if (runNameInput instanceof Response) return runNameInput;

	const environmentInput = validateOptionalString(
		body.environment,
		'environment',
		MAX_ENVIRONMENT_LENGTH
	);
	if (environmentInput instanceof Response) return environmentInput;
	if (environmentInput && !/^[A-Za-z0-9 _.-]+$/.test(environmentInput)) {
		return badRequest('environment contains unsupported characters');
	}

	const { results } = body;

	if (!Array.isArray(results) || results.length === 0) {
		return badRequest('results array is required and must not be empty');
	}

	if (results.length > MAX_RESULTS) {
		return badRequest(`results array must not exceed ${MAX_RESULTS.toLocaleString()} entries`);
	}

	// Validate each result entry
	const validStatuses = ['PASS', 'FAIL', 'SKIP'];
	const normalizedResults: AutomationResult[] = [];
	const seenAutomationKeys = new Set<string>();
	for (const r of results) {
		if (!isRecord(r)) {
			return badRequest('Each result must be an object');
		}
		if (!r.automationKey || typeof r.automationKey !== 'string') {
			return badRequest('Each result must have an automationKey');
		}
		const automationKey = r.automationKey.trim();
		if (!automationKey) {
			return badRequest('Each result must have a non-empty automationKey');
		}
		if (automationKey.length > MAX_AUTOMATION_KEY_LENGTH) {
			return badRequest(`automationKey must not exceed ${MAX_AUTOMATION_KEY_LENGTH} characters`);
		}
		if (seenAutomationKeys.has(automationKey)) {
			return badRequest(`Duplicate automationKey "${automationKey}"`);
		}
		seenAutomationKeys.add(automationKey);
		if (!validStatuses.includes(r.status)) {
			return badRequest(`Invalid status "${r.status}". Must be PASS, FAIL, or SKIP`);
		}
		const errorMessageInput = validateOptionalString(
			r.errorMessage,
			'errorMessage',
			MAX_ERROR_MESSAGE_LENGTH
		);
		if (errorMessageInput instanceof Response) return errorMessageInput;
		if (
			r.duration != null &&
			(typeof r.duration !== 'number' ||
				!Number.isFinite(r.duration) ||
				!Number.isInteger(r.duration) ||
				r.duration < 0 ||
				r.duration > MAX_DURATION_MS)
		) {
			return badRequest(
				`duration must be an integer between 0 and ${MAX_DURATION_MS} milliseconds`
			);
		}
		normalizedResults.push({
			automationKey,
			status: r.status,
			errorMessage: errorMessageInput,
			duration: r.duration
		});
	}

	// Build run name and environment
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const runName =
		runNameInput ??
		`CI Run ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

	const environment = (environmentInput ?? 'QA').toUpperCase();

	// Verify project exists and get creator for run attribution
	const projectRecord = await db.query.project.findFirst({
		where: eq(project.id, projectId)
	});

	if (!projectRecord) {
		return notFound('Project not found');
	}

	const createdBy = projectRecord.createdBy;

	// Look up test cases by automationKey within the project
	const automationKeys = [...new Set(normalizedResults.map((r) => r.automationKey))];

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
		for (const result of normalizedResults) {
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
					executedBy: createdBy,
					startedAt: now,
					completedAt: now
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
			.where(and(eq(testRun.id, run.id), eq(testRun.projectId, projectId)));

		return run.id;
	});

	const matched = finalResults.filter((r) => r.testCaseId !== null).length;
	const failCount = finalResults.filter((r) => r.status === 'FAIL').length;

	// Notify project members about completed CI run
	const members = await db
		.select({ userId: projectMember.userId })
		.from(projectMember)
		.where(eq(projectMember.projectId, projectId));

	for (const m of members) {
		createNotification({
			userId: m.userId,
			type: 'TEST_RUN_COMPLETED',
			title: 'CI run completed',
			message: `"${runName}" finished — ${matched} matched, ${failCount} failed`,
			link: `/projects/${projectId}/test-runs/${runId}`,
			projectId
		});
	}

	return json({
		runId,
		matched,
		unmatched,
		results: finalResults
	});
};
