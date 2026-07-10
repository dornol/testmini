import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseGroup,
	tag,
	testCaseTag,
	testExecution,
	project
} from '$lib/server/db/schema';
import { and, eq, asc, inArray } from 'drizzle-orm';
import { csvResponse } from '$lib/server/csv-utils';
import { withProjectAccess } from '$lib/server/api-handler';
import { buildTestCaseConditions } from '$lib/server/test-case-filters';
import {
	parseCanonicalPositiveInteger,
	parseCanonicalPositiveIntegerList
} from '$lib/server/search-param-validation';

export const GET = withProjectAccess(async ({ url, projectId }) => {
	const format = url.searchParams.get('format') ?? 'csv';
	if (!['csv', 'json'].includes(format)) {
		error(400, 'Invalid format. Use csv or json.');
	}

	const search = url.searchParams.get('search') ?? '';
	const priority = url.searchParams.get('priority') ?? '';
	const tagIds = url.searchParams.get('tagIds') ?? '';
	const groupId = url.searchParams.get('groupId') ?? '';
	const createdBy = url.searchParams.get('createdBy') ?? '';
	const assigneeId = url.searchParams.get('assigneeId') ?? '';
	const suiteId = url.searchParams.get('suiteId') ?? '';
	const execStatus = url.searchParams.get('execStatus') ?? '';
	const approvalStatus = url.searchParams.get('approvalStatus') ?? '';
	const retestNeeded = url.searchParams.get('retestNeeded') ?? '';
	const customFieldFilters: { fieldId: number; value: string }[] = [];
	for (const [key, value] of url.searchParams.entries()) {
		if (key.startsWith('cf_') && value) {
			const fieldId = parseCanonicalPositiveInteger(key.slice(3));
			if (fieldId !== null) customFieldFilters.push({ fieldId, value });
		}
	}

	const where = buildTestCaseConditions({
		projectId,
		search,
		priority,
		tagIds,
		groupId,
		createdBy,
		assigneeId,
		suiteId,
		approvalStatus,
		retestNeeded,
		customFieldFilters
	});

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
		const execStatuses = execStatus.split(',').filter(Boolean);
		const hasNotExecuted = execStatuses.includes('NOT_EXECUTED');
		const otherStatuses = execStatuses.filter((status) => status !== 'NOT_EXECUTED');
		const baseTestCaseIds = testCasesBase.map((tc) => tc.id);
		const executions = await db
			.select({
				testRunId: testExecution.testRunId,
				testCaseId: testCase.id,
				status: testExecution.status
			})
			.from(testExecution)
			.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
			.where(
				and(inArray(testExecution.testRunId, selectedRunIds), inArray(testCase.id, baseTestCaseIds))
			);

		const executionMap = new Map<number, Map<number, string>>();
		for (const execution of executions) {
			if (!executionMap.has(execution.testCaseId)) {
				executionMap.set(execution.testCaseId, new Map());
			}
			executionMap.get(execution.testCaseId)!.set(execution.testRunId, execution.status);
		}

		testCases = testCasesBase.filter((tc) => {
			const tcExecutions = executionMap.get(tc.id);
			const isNotExecuted =
				!tcExecutions || selectedRunIds.every((runId) => !tcExecutions.has(runId));
			if (hasNotExecuted && isNotExecuted) return true;
			if (otherStatuses.length > 0 && tcExecutions) {
				return selectedRunIds.some((runId) => {
					const status = tcExecutions.get(runId);
					return status ? otherStatuses.includes(status) : false;
				});
			}
			return false;
		});
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
