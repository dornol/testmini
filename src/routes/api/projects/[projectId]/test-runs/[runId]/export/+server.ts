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

export const GET: RequestHandler = async ({ params, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const runId = Number(params.runId);
	await requireProjectAccess(authUser, projectId);

	if (isNaN(runId)) {
		error(400, 'Invalid run ID');
	}

	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	const fileName = `${run.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${run.environment}.csv`;

	const headers = [
		'Test Case Key',
		'Title',
		'Priority',
		'Version',
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

				let lastId = 0;
				let hasMore = true;

				while (hasMore) {
					const batch = await db
						.select({
							id: testExecution.id,
							testCaseKey: testCase.key,
							testCaseTitle: testCaseVersion.title,
							priority: testCaseVersion.priority,
							versionNo: testCaseVersion.versionNo,
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

					const csvChunk = batch
						.map((e) =>
							formatCsvRow([
								e.testCaseKey,
								e.testCaseTitle,
								e.priority,
								`v${e.versionNo}`,
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

				controller.close();
			} catch {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${fileName}"`
		}
	});
};
