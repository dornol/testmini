import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	testRun,
	testExecution,
	testCaseVersion,
	testCase,
	testFailureDetail,
	user
} from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth, requireProjectAccess } from '$lib/server/auth-utils';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectAccess(authUser, projectId);

	const runsParam = url.searchParams.get('runs');
	if (!runsParam) {
		error(400, 'Missing runs parameter');
	}

	const runIds = runsParam
		.split(',')
		.map(Number)
		.filter((n) => !isNaN(n) && n > 0);

	if (runIds.length === 0) {
		error(400, 'No valid run IDs provided');
	}

	// Verify all runs belong to this project
	const runs = await db
		.select({ id: testRun.id, name: testRun.name, environment: testRun.environment })
		.from(testRun)
		.where(and(inArray(testRun.id, runIds), eq(testRun.projectId, projectId)));

	if (runs.length !== runIds.length) {
		error(404, 'Some runs not found in this project');
	}

	const runMap = new Map(runs.map((r) => [r.id, r]));

	const executions = await db
		.select({
			id: testExecution.id,
			testRunId: testExecution.testRunId,
			testCaseKey: testCase.key,
			testCaseTitle: testCaseVersion.title,
			priority: testCaseVersion.priority,
			status: testExecution.status,
			comment: testExecution.comment,
			executedBy: user.name,
			executedAt: testExecution.executedAt
		})
		.from(testExecution)
		.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
		.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
		.leftJoin(user, eq(testExecution.executedBy, user.id))
		.where(inArray(testExecution.testRunId, runIds))
		.orderBy(testCase.key);

	// Gather failure details
	const failures = await db
		.select({
			testExecutionId: testFailureDetail.testExecutionId,
			errorMessage: testFailureDetail.errorMessage
		})
		.from(testFailureDetail)
		.innerJoin(testExecution, eq(testFailureDetail.testExecutionId, testExecution.id))
		.where(inArray(testExecution.testRunId, runIds));

	const failuresByExec = new Map<number, string[]>();
	for (const f of failures) {
		const arr = failuresByExec.get(f.testExecutionId) ?? [];
		if (f.errorMessage) arr.push(f.errorMessage);
		failuresByExec.set(f.testExecutionId, arr);
	}

	const headers = [
		'Key',
		'Title',
		'Priority',
		'Run Name',
		'Environment',
		'Status',
		'Executed By',
		'Executed At',
		'Comment',
		'Error Message'
	];

	const rows = executions.map((e) => {
		const run = runMap.get(e.testRunId);
		return [
			e.testCaseKey,
			e.testCaseTitle,
			e.priority,
			run?.name ?? '',
			run?.environment ?? '',
			e.status,
			e.executedBy ?? '',
			e.executedAt ? new Date(e.executedAt).toISOString() : '',
			e.comment ?? '',
			failuresByExec.get(e.id)?.join('; ') ?? ''
		];
	});

	const csvContent =
		'\uFEFF' +
		[headers, ...rows]
			.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
			.join('\n');

	return new Response(csvContent, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="multi_run_export.csv"`
		}
	});
};
