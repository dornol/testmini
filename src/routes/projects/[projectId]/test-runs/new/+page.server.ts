import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testRun,
	testExecution,
	tag,
	testCaseTag,
	testSuite,
	testSuiteItem,
	testCaseDataSet
} from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseId } from '$lib/server/auth-utils';
import { loadProjectTags } from '$lib/server/queries';
import { createTestRunSchema, type CreateTestRunInput } from '$lib/schemas/test-run.schema';
import { parsePositiveFormId } from '$lib/server/form-utils';
import { assertContentLengthUnderLimit } from '$lib/server/request-size';
import { cacheDeleteProjectAnalytics } from '$lib/server/cache';

const MAX_TEST_RUN_CREATE_FORM_BODY_SIZE = 256 * 1024;

function parseTextField(value: FormDataEntryValue | null): string | null {
	return typeof value === 'string' ? value : null;
}

export const load: PageServerLoad = async ({ params, parent, url }) => {
	const { userRole } = await parent();
	if (userRole === 'VIEWER') {
		redirect(303, '../test-runs');
	}

	const projectId = parseId(params.projectId, 'project ID');

	// Get all test cases with latest version for selection
	const testCases = await db
		.select({
			id: testCase.id,
			key: testCase.key,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority
		})
		.from(testCase)
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(eq(testCase.projectId, projectId))
		.orderBy(testCase.id);

	// Batch load tags for all test cases in this project
	const tcIdSet = new Set(testCases.map((tc) => tc.id));
	const tagsByTestCase: Record<number, { id: number; name: string; color: string }[]> = {};

	if (tcIdSet.size > 0) {
		const tcTags = await db
			.select({
				testCaseId: testCaseTag.testCaseId,
				tagId: tag.id,
				tagName: tag.name,
				tagColor: tag.color
			})
			.from(testCaseTag)
			.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
			.where(eq(tag.projectId, projectId))
			.orderBy(tag.name);

		for (const row of tcTags) {
			if (!tcIdSet.has(row.testCaseId)) continue;
			if (!tagsByTestCase[row.testCaseId]) {
				tagsByTestCase[row.testCaseId] = [];
			}
			tagsByTestCase[row.testCaseId].push({
				id: row.tagId,
				name: row.tagName,
				color: row.tagColor
			});
		}
	}

	// Load project tags for filter UI
	const projectTags = await loadProjectTags(projectId);

	// Load suites for "Load from Suite" dropdown
	const suites = await db
		.select({
			id: testSuite.id,
			name: testSuite.name,
			itemCount:
				sql<number>`(select count(*)::int from test_suite_item where suite_id = ${col(testSuite.id)})`.as(
					'item_count'
				)
		})
		.from(testSuite)
		.where(eq(testSuite.projectId, projectId))
		.orderBy(testSuite.name);

	// If suiteId is provided, preload suite items
	const suiteIdParam = parsePositiveFormId(url.searchParams.get('suiteId'));
	let preselectedIds: number[] = [];
	if (suiteIdParam) {
		const suiteItems = await db
			.select({ testCaseId: testSuiteItem.testCaseId })
			.from(testSuiteItem)
			.innerJoin(testSuite, eq(testSuiteItem.suiteId, testSuite.id))
			.where(and(eq(testSuiteItem.suiteId, suiteIdParam), eq(testSuite.projectId, projectId)));
		preselectedIds = suiteItems.map((si) => si.testCaseId);
	}

	return {
		testCases: testCases.map((tc) => ({
			...tc,
			tags: tagsByTestCase[tc.id] ?? []
		})),
		projectTags,
		suites,
		preselectedIds
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const user = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertContentLengthUnderLimit(
			request,
			MAX_TEST_RUN_CREATE_FORM_BODY_SIZE,
			'Test run create form body is too large'
		);

		const formData = await request.formData();
		const name = parseTextField(formData.get('name'));
		const environment = parseTextField(formData.get('environment'));
		const testCaseIdsRaw = formData.getAll('testCaseIds');
		const parsedTestCaseIds = testCaseIdsRaw.map(parsePositiveFormId);
		if (parsedTestCaseIds.some((id) => id === null)) {
			return fail(400, {
				name,
				environment,
				testCaseIds: [],
				errors: { testCaseIds: ['Invalid test case IDs'] }
			});
		}
		const testCaseIds = parsedTestCaseIds as number[];

		const parsed = createTestRunSchema.safeParse({ name, environment, testCaseIds });
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { name, environment, testCaseIds, errors });
		}

		const input = parsed.data as CreateTestRunInput;

		// Get latest version IDs for selected test cases
		const selectedCases = await db
			.select({
				id: testCase.id,
				latestVersionId: testCase.latestVersionId
			})
			.from(testCase)
			.where(eq(testCase.projectId, projectId));

		const caseMap = new Map(selectedCases.map((c) => [c.id, c.latestVersionId]));

		// Load data sets for all selected test cases (for parameterized expansion)
		const allDataSets =
			input.testCaseIds.length > 0
				? await db
						.select()
						.from(testCaseDataSet)
						.where(eq(testCaseDataSet.testCaseId, input.testCaseIds[0]))
				: [];
		// Load for all test case IDs
		const dataSetsByTcId = new Map<number, typeof allDataSets>();
		if (input.testCaseIds.length > 0) {
			const dsRows = await db.select().from(testCaseDataSet).orderBy(testCaseDataSet.orderIndex);
			for (const row of dsRows) {
				if (!input.testCaseIds.includes(row.testCaseId)) continue;
				if (!dataSetsByTcId.has(row.testCaseId)) {
					dataSetsByTcId.set(row.testCaseId, []);
				}
				dataSetsByTcId.get(row.testCaseId)!.push(row);
			}
		}

		const newRun = await db.transaction(async (tx) => {
			const [run] = await tx
				.insert(testRun)
				.values({
					projectId,
					name: input.name,
					environment: input.environment,
					createdBy: user.id
				})
				.returning({ id: testRun.id });

			if (!run) {
				error(500, 'Failed to create test run');
			}

			const executionValues: {
				testRunId: number;
				testCaseVersionId: number;
				dataSetId?: number | null;
				parameterValues?: Record<string, string> | null;
			}[] = [];

			for (const tcId of input.testCaseIds) {
				const versionId = caseMap.get(tcId);
				if (!versionId) continue;

				const dataSets = dataSetsByTcId.get(tcId);
				if (dataSets && dataSets.length > 0) {
					// Expand: one execution per data set row
					for (const ds of dataSets) {
						executionValues.push({
							testRunId: run.id,
							testCaseVersionId: versionId,
							dataSetId: ds.id,
							parameterValues: ds.values as Record<string, string>
						});
					}
				} else {
					// No data sets: single execution as before
					executionValues.push({
						testRunId: run.id,
						testCaseVersionId: versionId
					});
				}
			}

			if (executionValues.length > 0) {
				const insertedExecutions = await tx
					.insert(testExecution)
					.values(executionValues)
					.returning({ id: testExecution.id });
				if (insertedExecutions.length !== executionValues.length) {
					error(500, 'Failed to create all test run executions');
				}
			}

			return run;
		});

		cacheDeleteProjectAnalytics(projectId);
		redirect(303, `/projects/${projectId}/test-runs/${newRun.id}`);
	}
};
