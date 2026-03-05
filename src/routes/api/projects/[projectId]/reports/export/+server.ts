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
import { eq, and, gt, inArray } from 'drizzle-orm';
import { requireAuth, requireProjectAccess } from '$lib/server/auth-utils';

const BATCH_SIZE = 100;

function formatCsvRow(cells: (string | null | undefined)[]): string {
	return cells.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',');
}

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

	if (runIds.length > 20) {
		error(400, 'Cannot export more than 20 runs at once');
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

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			try {
				// BOM + header row
				controller.enqueue(encoder.encode('\uFEFF' + formatCsvRow(headers) + '\n'));

				// Process one run at a time to keep memory usage bounded
				for (const runId of runIds) {
					let lastId = 0;
					let hasMore = true;

					while (hasMore) {
						const batch = await db
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
							.where(and(eq(testExecution.testRunId, runId), gt(testExecution.id, lastId)))
							.orderBy(testExecution.id)
							.limit(BATCH_SIZE);

						if (batch.length === 0) {
							hasMore = false;
							break;
						}

						const batchIds = batch.map((e) => e.id);

						const failures = await db
							.select({
								testExecutionId: testFailureDetail.testExecutionId,
								errorMessage: testFailureDetail.errorMessage
							})
							.from(testFailureDetail)
							.where(inArray(testFailureDetail.testExecutionId, batchIds));

						const failuresByExec = new Map<number, string[]>();
						for (const f of failures) {
							const arr = failuresByExec.get(f.testExecutionId) ?? [];
							if (f.errorMessage) arr.push(f.errorMessage);
							failuresByExec.set(f.testExecutionId, arr);
						}

						const run = runMap.get(runId);
						const csvChunk = batch
							.map((e) =>
								formatCsvRow([
									e.testCaseKey,
									e.testCaseTitle,
									e.priority,
									run?.name,
									run?.environment,
									e.status,
									e.executedBy,
									e.executedAt ? new Date(e.executedAt).toISOString() : '',
									e.comment,
									failuresByExec.get(e.id)?.join('; ')
								])
							)
							.join('\n');

						controller.enqueue(encoder.encode(csvChunk + '\n'));

						lastId = batch[batch.length - 1].id;
						hasMore = batch.length === BATCH_SIZE;
					}
				}

				controller.close();
			} catch {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="multi_run_export.csv"`
		}
	});
};
