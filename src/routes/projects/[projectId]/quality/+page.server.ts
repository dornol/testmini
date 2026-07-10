import type { PageServerLoad } from './$types';
import { db, col } from '$lib/server/db';
import { module, testCase, testRun } from '$lib/server/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { parseId } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = parseId(params.projectId, 'project ID');

	const [modules, riskRows, caseTotals, recentAutomationRuns] = await Promise.all([
		db
			.select({
				id: module.id,
				name: module.name,
				parentModuleId: module.parentModuleId,
				testCaseCount: sql<number>`(select count(*)::int from module_test_case where module_id = ${col(module.id)})`,
				passCount: sql<number>`(select count(distinct mtc.test_case_id)::int from module_test_case mtc join test_case tc on tc.id = mtc.test_case_id join test_execution te on te.test_case_version_id = tc.latest_version_id where mtc.module_id = ${col(module.id)} and te.status = 'PASS' and te.id = (select max(te2.id) from test_execution te2 where te2.test_case_version_id = tc.latest_version_id))`,
				failCount: sql<number>`(select count(distinct mtc.test_case_id)::int from module_test_case mtc join test_case tc on tc.id = mtc.test_case_id join test_execution te on te.test_case_version_id = tc.latest_version_id where mtc.module_id = ${col(module.id)} and te.status = 'FAIL' and te.id = (select max(te2.id) from test_execution te2 where te2.test_case_version_id = tc.latest_version_id))`
			})
			.from(module)
			.where(eq(module.projectId, projectId))
			.orderBy(module.sortOrder, module.name),
		db
			.select({ riskLevel: testCase.riskLevel, count: sql<number>`count(*)::int` })
			.from(testCase)
			.where(eq(testCase.projectId, projectId))
			.groupBy(testCase.riskLevel),
		db
			.select({
				total: sql<number>`count(*)::int`,
				automated: sql<number>`count(${testCase.automationKey})::int`,
				assessed: sql<number>`count(${testCase.riskLevel})::int`
			})
			.from(testCase)
			.where(eq(testCase.projectId, projectId)),
		db
			.select({
				id: testRun.id,
				name: testRun.name,
				environment: testRun.environment,
				createdAt: testRun.createdAt,
				total: sql<number>`(select count(*)::int from test_execution te join test_case_version tcv on tcv.id = te.test_case_version_id join test_case tc on tc.id = tcv.test_case_id where te.test_run_id = ${col(testRun.id)} and tc.automation_key is not null)`,
				passed: sql<number>`(select count(*)::int from test_execution te join test_case_version tcv on tcv.id = te.test_case_version_id join test_case tc on tc.id = tcv.test_case_id where te.test_run_id = ${col(testRun.id)} and tc.automation_key is not null and te.status = 'PASS')`,
				failed: sql<number>`(select count(*)::int from test_execution te join test_case_version tcv on tcv.id = te.test_case_version_id join test_case tc on tc.id = tcv.test_case_id where te.test_run_id = ${col(testRun.id)} and tc.automation_key is not null and te.status = 'FAIL')`
			})
			.from(testRun)
			.where(
				sql`${testRun.projectId} = ${projectId} and exists (select 1 from test_execution te join test_case_version tcv on tcv.id = te.test_case_version_id join test_case tc on tc.id = tcv.test_case_id where te.test_run_id = ${col(testRun.id)} and tc.automation_key is not null)`
			)
			.orderBy(desc(testRun.createdAt))
			.limit(8)
	]);

	const totals = caseTotals[0] ?? { total: 0, automated: 0, assessed: 0 };
	return {
		modules,
		risk: riskRows.filter((row) => row.riskLevel !== null),
		totals,
		recentAutomationRuns
	};
};
