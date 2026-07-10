import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseGroup,
	tag,
	testCaseTag,
	project
} from '$lib/server/db/schema';
import { and, eq, asc, inArray } from 'drizzle-orm';
import { csvResponse } from '$lib/server/csv-utils';
import { withProjectAccess } from '$lib/server/api-handler';
import {
	applyExecutionStatusFilter,
	buildTestCaseConditions,
	loadTestCaseExecutionMap,
	parseTestCaseFilterParams
} from '$lib/server/test-case-filters';
import {
	parseCanonicalPositiveIntegerList,
	parseRequiredCanonicalPositiveIntegerList
} from '$lib/server/search-param-validation';

export const GET = withProjectAccess(async ({ url, projectId }) => {
	const format = url.searchParams.get('format') ?? 'csv';
	if (!['csv', 'json'].includes(format)) {
		error(400, 'Invalid format. Use csv or json.');
	}

	const filterParams = parseTestCaseFilterParams(projectId, url.searchParams);
	const execStatus = filterParams.execStatus ?? '';

	const selectedIdsParam = url.searchParams.get('ids');
	let selectedTestCaseIds: number[] = [];
	if (selectedIdsParam !== null && selectedIdsParam.trim() !== '') {
		try {
			selectedTestCaseIds = parseRequiredCanonicalPositiveIntegerList(selectedIdsParam, 'ids');
		} catch {
			error(400, 'ids must contain only positive integers');
		}
	}

	let where = buildTestCaseConditions(filterParams);
	if (selectedTestCaseIds.length > 0) {
		where = and(where, inArray(testCase.id, selectedTestCaseIds))!;
	}

	const testCasesBase = await db
		.select({
			id: testCase.id,
			key: testCase.key,
			groupId: testCase.groupId,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority,
			precondition: testCaseVersion.precondition,
			steps: testCaseVersion.steps,
			expectedResult: testCaseVersion.expectedResult
		})
		.from(testCase)
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(where)
		.orderBy(asc(testCase.key));

	let selectedRunIds: number[] = [];
	if (execStatus) {
		if (url.searchParams.has('runIds')) {
			selectedRunIds = parseCanonicalPositiveIntegerList(url.searchParams.get('runIds')!);
		} else {
			const projectRow = await db.query.project.findFirst({
				where: eq(project.id, projectId),
				columns: { selectedRunIds: true }
			});
			selectedRunIds = (projectRow?.selectedRunIds ?? []) as number[];
		}
	}

	let testCases = testCasesBase;
	if (execStatus && selectedRunIds.length > 0 && testCasesBase.length > 0) {
		const executionMap = await loadTestCaseExecutionMap(
			selectedRunIds,
			projectId,
			new Set(testCasesBase.map((tc) => tc.id))
		);
		testCases = applyExecutionStatusFilter(testCasesBase, executionMap, execStatus, selectedRunIds);
	}

	// Load groups for name mapping
	const groups = await db
		.select({ id: testCaseGroup.id, name: testCaseGroup.name })
		.from(testCaseGroup)
		.where(eq(testCaseGroup.projectId, projectId));
	const groupMap = new Map(groups.map((g) => [g.id, g.name]));

	// Load tags only for exported test cases
	const tcIdSet = new Set(testCases.map((tc) => tc.id));
	const tcIds = [...tcIdSet];
	const tcTags =
		tcIds.length > 0
			? await db
					.select({
						testCaseId: testCaseTag.testCaseId,
						tagName: tag.name
					})
					.from(testCaseTag)
					.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
					.where(inArray(testCaseTag.testCaseId, tcIds))
					.orderBy(tag.name)
			: [];

	const tagsByTc = new Map<number, string[]>();
	for (const row of tcTags) {
		const arr = tagsByTc.get(row.testCaseId) ?? [];
		arr.push(row.tagName);
		tagsByTc.set(row.testCaseId, arr);
	}

	const rows = testCases.map((tc) => ({
		key: tc.key,
		title: tc.title,
		priority: tc.priority,
		precondition: tc.precondition ?? '',
		steps: tc.steps,
		expectedResult: tc.expectedResult ?? '',
		tags: tagsByTc.get(tc.id) ?? [],
		group: tc.groupId ? (groupMap.get(tc.groupId) ?? '') : ''
	}));

	if (format === 'json') {
		return new Response(JSON.stringify({ testCases: rows }, null, 2), {
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Content-Disposition': `attachment; filename="test-cases.json"`
			}
		});
	}

	// CSV with UTF-8 BOM for Excel compatibility
	const csvHeaders = [
		'Key',
		'Title',
		'Priority',
		'Precondition',
		'Steps',
		'Expected Result',
		'Tags',
		'Group'
	];
	const csvRows = rows.map((r) => [
		r.key,
		r.title,
		r.priority,
		r.precondition,
		JSON.stringify(r.steps),
		r.expectedResult,
		r.tags.join('; '),
		r.group
	]);

	return csvResponse(csvHeaders, csvRows, 'test-cases.csv');
});
