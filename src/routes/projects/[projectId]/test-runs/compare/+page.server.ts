import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testRun,
	testExecution,
	testCaseVersion,
	testCase
} from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

type ComparisonRow = {
	testCaseId: number;
	key: string;
	title: string;
	priority: string;
	statusA: string | null;
	statusB: string | null;
};

export const load: PageServerLoad = async ({ params, url, parent }) => {
	await parent();
	const projectId = Number(params.projectId);

	const runAId = Number(url.searchParams.get('runA'));
	const runBId = Number(url.searchParams.get('runB'));

	if (isNaN(runAId) || isNaN(runBId) || runAId === runBId) {
		error(400, 'Provide two different run IDs as runA and runB');
	}

	// Load both runs
	const [runA, runB] = await Promise.all([
		db.query.testRun.findFirst({
			where: and(eq(testRun.id, runAId), eq(testRun.projectId, projectId))
		}),
		db.query.testRun.findFirst({
			where: and(eq(testRun.id, runBId), eq(testRun.projectId, projectId))
		})
	]);

	if (!runA || !runB) {
		error(404, 'One or both test runs not found');
	}

	// Load executions for both runs
	const [execsA, execsB] = await Promise.all([
		db
			.select({
				testCaseId: testCase.id,
				key: testCase.key,
				title: testCaseVersion.title,
				priority: testCaseVersion.priority,
				status: testExecution.status
			})
			.from(testExecution)
			.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
			.where(eq(testExecution.testRunId, runAId))
			.orderBy(testCase.key),
		db
			.select({
				testCaseId: testCase.id,
				key: testCase.key,
				title: testCaseVersion.title,
				priority: testCaseVersion.priority,
				status: testExecution.status
			})
			.from(testExecution)
			.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
			.where(eq(testExecution.testRunId, runBId))
			.orderBy(testCase.key)
	]);

	// Merge by testCaseId
	const mapA = new Map(execsA.map((e) => [e.testCaseId, e]));
	const mapB = new Map(execsB.map((e) => [e.testCaseId, e]));

	const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
	const rows: ComparisonRow[] = [];

	for (const id of allIds) {
		const a = mapA.get(id);
		const b = mapB.get(id);
		rows.push({
			testCaseId: id,
			key: a?.key ?? b?.key ?? '',
			title: a?.title ?? b?.title ?? '',
			priority: a?.priority ?? b?.priority ?? 'MEDIUM',
			statusA: a?.status ?? null,
			statusB: b?.status ?? null
		});
	}

	rows.sort((x, y) => x.key.localeCompare(y.key));

	// Summary stats
	let same = 0;
	let regression = 0;
	let improvement = 0;
	let changed = 0;
	let onlyInA = 0;
	let onlyInB = 0;

	for (const r of rows) {
		if (r.statusA === null) {
			onlyInB++;
		} else if (r.statusB === null) {
			onlyInA++;
		} else if (r.statusA === r.statusB) {
			same++;
		} else if (r.statusA === 'PASS' && r.statusB === 'FAIL') {
			regression++;
		} else if (r.statusA === 'FAIL' && r.statusB === 'PASS') {
			improvement++;
		} else {
			changed++;
		}
	}

	return {
		runA: { id: runA.id, name: runA.name, environment: runA.environment, status: runA.status },
		runB: { id: runB.id, name: runB.name, environment: runB.environment, status: runB.status },
		rows,
		summary: { same, regression, improvement, changed, onlyInA, onlyInB }
	};
};
