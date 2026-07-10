import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseGroup,
	user,
	testRun,
	testExecution,
	projectMember,
	testSuite,
	customField,
	savedFilter,
	project,
	issueLink,
	issueTrackerConfig
} from '$lib/server/db/schema';
import { eq, and, desc, asc, sql, inArray, count } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseId } from '$lib/server/auth-utils';
import { loadProjectTags, loadBatchTags, loadBatchAssignees } from '$lib/server/queries';
import { buildTestCaseConditions } from '$lib/server/test-case-filters';
import {
	parseCanonicalPositiveInteger,
	parseCanonicalPositiveIntegerList,
	parsePositiveIntegerSearchParam
} from '$lib/server/search-param-validation';
import { parseOptionalFormString, parseOptionalTrimmedFormString } from '$lib/server/form-utils';
import { assertContentLengthUnderLimit } from '$lib/server/request-size';
import { cacheDeleteProjectAnalytics } from '$lib/server/cache';

const MAX_TEST_CASE_QUICK_CREATE_FORM_BODY_SIZE = 16 * 1024;

async function loadExecutionMap(
	selectedRunIds: number[],
	projectId: number,
	tcIds: Set<number>
): Promise<Record<number, Record<number, { executionId: number; status: string }>>> {
	const executionMap: Record<number, Record<number, { executionId: number; status: string }>> = {};
	if (selectedRunIds.length === 0 || tcIds.size === 0) return executionMap;

	const executions = await db
		.select({
			executionId: testExecution.id,
			testRunId: testExecution.testRunId,
			testCaseId: testCase.id,
			status: testExecution.status
		})
		.from(testExecution)
		.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
		.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
		.where(
			and(inArray(testExecution.testRunId, selectedRunIds), eq(testCase.projectId, projectId))
		);

	for (const exec of executions) {
		if (!executionMap[exec.testCaseId]) {
			executionMap[exec.testCaseId] = {};
		}
		executionMap[exec.testCaseId][exec.testRunId] = {
			executionId: exec.executionId,
			status: exec.status
		};
	}
	return executionMap;
}

function applyExecStatusFilter<T extends { id: number }>(
	testCases: T[],
	executionMap: Record<number, Record<number, { executionId: number; status: string }>>,
	execStatus: string,
	selectedRunIds: number[]
): T[] {
	if (!execStatus || selectedRunIds.length === 0) return testCases;

	const execStatuses = execStatus.split(',').filter(Boolean);
	if (execStatuses.length === 0) return testCases;

	const hasNotExecuted = execStatuses.includes('NOT_EXECUTED');
	const otherStatuses = execStatuses.filter((s) => s !== 'NOT_EXECUTED');
	return testCases.filter((tc) => {
		const tcExecs = executionMap[tc.id];
		const isNotExecuted = !tcExecs || selectedRunIds.every((rid) => !tcExecs[rid]);
		if (hasNotExecuted && isNotExecuted) return true;
		if (otherStatuses.length > 0 && tcExecs) {
			return selectedRunIds.some(
				(rid) => tcExecs[rid] && otherStatuses.includes(tcExecs[rid].status)
			);
		}
		return false;
	});
}

export const load: PageServerLoad = async ({ params, url, parent, cookies, locals }) => {
	await parent();
	const projectId = parseId(params.projectId, 'project ID');

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
	const requestedPage = parsePositiveIntegerSearchParam(url.searchParams.get('page'), 1);
	const limit = parsePositiveIntegerSearchParam(url.searchParams.get('limit'), 100, {
		max: 200
	});

	// Parse selected run IDs: URL param takes priority, otherwise fall back to project setting
	let selectedRunIds: number[];
	if (url.searchParams.has('runIds')) {
		selectedRunIds = parseCanonicalPositiveIntegerList(url.searchParams.get('runIds')!);
	} else {
		const proj = await db.query.project.findFirst({
			where: eq(project.id, projectId),
			columns: { selectedRunIds: true }
		});
		selectedRunIds = (proj?.selectedRunIds ?? []) as number[];
	}

	// Parse custom field filters from URL params (cf_<fieldId>=value)
	const customFieldFilters: { fieldId: number; value: string }[] = [];
	for (const [key, value] of url.searchParams.entries()) {
		if (key.startsWith('cf_') && value) {
			const fieldId = parseCanonicalPositiveInteger(key.slice(3));
			if (fieldId !== null) {
				customFieldFilters.push({ fieldId, value });
			}
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

	// Load custom field definitions and column settings for this project
	const [projectCustomFields, projectRow] = await Promise.all([
		db
			.select({
				id: customField.id,
				name: customField.name,
				fieldType: customField.fieldType,
				options: customField.options
			})
			.from(customField)
			.where(eq(customField.projectId, projectId))
			.orderBy(asc(customField.sortOrder)),

		db.query.project.findFirst({
			where: eq(project.id, projectId),
			columns: { columnSettings: true }
		})
	]);
	const columnSettings = (projectRow?.columnSettings ?? null) as
		{ id: string; visible: boolean }[] | null;

	// Load groups for this project
	const groups = await db
		.select({
			id: testCaseGroup.id,
			name: testCaseGroup.name,
			sortOrder: testCaseGroup.sortOrder,
			color: testCaseGroup.color
		})
		.from(testCaseGroup)
		.where(eq(testCaseGroup.projectId, projectId))
		.orderBy(asc(testCaseGroup.sortOrder));

	const [countRow] = await db
		.select({ total: count() })
		.from(testCase)
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.innerJoin(user, eq(testCaseVersion.updatedBy, user.id))
		.where(where);
	const baseTotal = Number(countRow?.total ?? 0);
	const basePageCount = Math.max(1, Math.ceil(baseTotal / limit));
	const pageForBaseQuery = Math.min(requestedPage, basePageCount);
	const baseOffset = (pageForBaseQuery - 1) * limit;

	const selectTestCases = () =>
		db
			.select({
				id: testCase.id,
				key: testCase.key,
				title: testCaseVersion.title,
				priority: testCaseVersion.priority,
				updatedBy: user.name,
				groupId: testCase.groupId,
				sortOrder: testCase.sortOrder,
				approvalStatus: testCase.approvalStatus,
				retestNeeded: testCase.retestNeeded,
				customFields: testCaseVersion.customFields
			})
			.from(testCase)
			.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
			.innerJoin(user, eq(testCaseVersion.updatedBy, user.id))
			.where(where)
			.orderBy(asc(testCase.sortOrder));

	const needsPostFilterPagination = Boolean(execStatus && selectedRunIds.length > 0);
	const testCases = needsPostFilterPagination
		? await selectTestCases()
		: await selectTestCases().limit(limit).offset(baseOffset);

	const tcIdSet = new Set(testCases.map((tc) => tc.id));
	const [tagsByTestCase, assigneesByTestCase] = await Promise.all([
		loadBatchTags(projectId, tcIdSet),
		loadBatchAssignees(tcIdSet)
	]);

	// Load issue link counts per test case
	const issueLinkCounts =
		tcIdSet.size > 0
			? await db
					.select({ testCaseId: issueLink.testCaseId, count: sql<number>`count(*)`.as('count') })
					.from(issueLink)
					.where(inArray(issueLink.testCaseId, [...tcIdSet]))
					.groupBy(issueLink.testCaseId)
			: [];
	const issueLinkMap: Record<number, number> = {};
	for (const r of issueLinkCounts) {
		if (r.testCaseId) issueLinkMap[r.testCaseId] = Number(r.count);
	}

	// Check if project has an issue tracker configured
	const issueTrackerRow = await db.query.issueTrackerConfig.findFirst({
		where: eq(issueTrackerConfig.projectId, projectId),
		columns: { id: true }
	});
	const hasIssueTracker = !!issueTrackerRow;

	// Load project tags for filter UI
	const projectTags = await loadProjectTags(projectId);

	// Load project members for createdBy filter UI
	const projectMembers = await db
		.select({
			userId: projectMember.userId,
			userName: user.name
		})
		.from(projectMember)
		.innerJoin(user, eq(projectMember.userId, user.id))
		.where(eq(projectMember.projectId, projectId))
		.orderBy(user.name);

	// Load project suites for filter UI
	const projectSuites = await db
		.select({ id: testSuite.id, name: testSuite.name })
		.from(testSuite)
		.where(eq(testSuite.projectId, projectId))
		.orderBy(asc(testSuite.name));

	// Load all project runs for the run selector dropdown
	const projectRuns = await db
		.select({
			id: testRun.id,
			name: testRun.name,
			environment: testRun.environment,
			status: testRun.status
		})
		.from(testRun)
		.where(eq(testRun.projectId, projectId))
		.orderBy(desc(testRun.createdAt));

	const executionMap = await loadExecutionMap(selectedRunIds, projectId, tcIdSet);

	// Persist selected run IDs to project setting
	if (url.searchParams.has('runIds')) {
		const [updated] = await db
			.update(project)
			.set({ selectedRunIds })
			.where(eq(project.id, projectId))
			.returning();
		if (!updated) error(404, 'Project not found');
	}

	// Load saved filters for the current user
	const savedFilters = await db
		.select()
		.from(savedFilter)
		.where(
			and(
				eq(savedFilter.projectId, projectId),
				eq(savedFilter.userId, locals.user!.id),
				eq(savedFilter.filterType, 'test_cases')
			)
		)
		.orderBy(asc(savedFilter.sortOrder), asc(savedFilter.name));

	const allFilteredTestCases = applyExecStatusFilter(
		testCases,
		executionMap,
		execStatus,
		selectedRunIds
	);
	const total = needsPostFilterPagination ? allFilteredTestCases.length : baseTotal;
	const pageCount = Math.max(1, Math.ceil(total / limit));
	const page = Math.min(requestedPage, pageCount);
	const filteredTestCases = needsPostFilterPagination
		? allFilteredTestCases.slice((page - 1) * limit, page * limit)
		: allFilteredTestCases;

	return {
		testCases: filteredTestCases.map((tc) => ({
			...tc,
			tags: tagsByTestCase[tc.id] ?? [],
			assignees: assigneesByTestCase[tc.id] ?? [],
			issueLinkCount: issueLinkMap[tc.id] ?? 0
		})),
		pagination: {
			page,
			limit,
			total,
			pageCount,
			hasPrevious: page > 1,
			hasNext: page < pageCount
		},
		search,
		priority,
		tagIds,
		groupId,
		createdBy,
		assigneeId,
		suiteId,
		execStatus,
		approvalStatus,
		groups,
		projectTags,
		projectMembers,
		projectSuites,
		projectRuns,
		selectedRunIds,
		executionMap,
		projectCustomFields,
		customFieldFilters,
		savedFilters,
		columnSettings,
		hasIssueTracker
	};
};

export const actions: Actions = {
	quickCreate: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertContentLengthUnderLimit(
			request,
			MAX_TEST_CASE_QUICK_CREATE_FORM_BODY_SIZE,
			'Test case quick create form body is too large'
		);

		const formData = await request.formData();
		const title = parseOptionalTrimmedFormString(formData.get('title'));
		const priorityValue = parseOptionalFormString(formData.get('priority'));
		const priority = priorityValue ?? 'MEDIUM';
		const groupIdStr = parseOptionalFormString(formData.get('groupId'));
		const groupId =
			typeof groupIdStr === 'string' && groupIdStr
				? parseCanonicalPositiveInteger(groupIdStr)
				: null;

		if (title === null || !title || title.length < 1 || title.length > 200) {
			return fail(400, { error: 'Title is required (1-200 characters)' });
		}

		if (priorityValue === null || !priority) {
			return fail(400, { error: 'Invalid priority' });
		}

		if (groupIdStr === null || (groupIdStr && groupId === null)) {
			return fail(400, { error: 'Invalid group ID' });
		}

		await db.transaction(async (tx) => {
			// Generate key: TC-0001 format
			const [maxResult] = await tx
				.select({
					maxKey: sql<string>`max(key)`.as('max_key')
				})
				.from(testCase)
				.where(eq(testCase.projectId, projectId));

			let nextNum = 1;
			if (maxResult?.maxKey) {
				const match = maxResult.maxKey.match(/TC-(\d+)/);
				if (match) {
					nextNum = parseInt(match[1], 10) + 1;
				}
			}
			const key = `TC-${String(nextNum).padStart(4, '0')}`;

			// Compute sortOrder for the group (or uncategorized)
			const groupCondition =
				groupId !== null ? eq(testCase.groupId, groupId) : sql`${testCase.groupId} is null`;
			const [maxSortResult] = await tx
				.select({ maxOrder: sql<number>`coalesce(max(${testCase.sortOrder}), 0)` })
				.from(testCase)
				.where(and(eq(testCase.projectId, projectId), groupCondition));
			const sortOrder = (maxSortResult?.maxOrder ?? 0) + 1000;

			// Create test case
			const [created] = await tx
				.insert(testCase)
				.values({
					projectId,
					key,
					groupId: groupId || null,
					sortOrder,
					createdBy: authUser.id
				})
				.returning();
			if (!created) {
				error(500, 'Failed to create test case');
			}

			// Create first version with minimal data
			const [version] = await tx
				.insert(testCaseVersion)
				.values({
					testCaseId: created.id,
					versionNo: 1,
					title,
					precondition: null,
					steps: [],
					expectedResult: null,
					priority,
					updatedBy: authUser.id
				})
				.returning();
			if (!version) {
				error(500, 'Failed to create test case version');
			}

			// Update latestVersionId
			await tx
				.update(testCase)
				.set({ latestVersionId: version.id })
				.where(eq(testCase.id, created.id));
		});

		cacheDeleteProjectAnalytics(projectId);
		return { quickCreateSuccess: true };
	}
};
