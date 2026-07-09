import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testRun,
	testExecution,
	testCaseVersion,
	testCase,
	testFailureDetail,
	user as userTable
} from '$lib/server/db/schema';
import { eq, and, gt, inArray } from 'drizzle-orm';
import { formatCsvRow } from '$lib/server/csv-utils';
import { withProjectAccess } from '$lib/server/api-handler';

const BATCH_SIZE = 100;
const MAX_RUN_IDS = 20;

function parseRunIds(value: string): number[] {
	const tokens = value
		.split(',')
		.map((token) => token.trim())
		.filter(Boolean);
	if (tokens.length === 0) {
		error(400, 'No valid run IDs provided');
	}

	const runIds: number[] = [];
	for (const token of tokens) {
		if (!/^\d+$/.test(token)) {
			error(400, 'runs must contain only positive integers');
		}
		const id = Number(token);
		if (!Number.isSafeInteger(id) || id <= 0) {
			error(400, 'runs must contain only positive integers');
		}
		runIds.push(id);
	}

	return [...new Set(runIds)];
}

export const GET = withProjectAccess(async ({ url, projectId }) => {
	const runsParam = url.searchParams.get('runs');
	if (!runsParam) {
		error(400, 'Missing runs parameter');
	}

	const runIds = parseRunIds(runsParam);

	if (runIds.length > MAX_RUN_IDS) {
		error(400, `Cannot export more than ${MAX_RUN_IDS} runs at once`);
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
								executedBy: userTable.name,
								executedAt: testExecution.executedAt
							})
							.from(testExecution)
							.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
							.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
							.leftJoin(userTable, eq(testExecution.executedBy, userTable.id))
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
});
