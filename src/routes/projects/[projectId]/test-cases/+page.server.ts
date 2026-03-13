import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseGroup,
	user,
	tag,
	testCaseTag,
	testCaseAssignee,
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
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';
import { loadProjectTags } from '$lib/server/queries';
import { buildTestCaseConditions } from '$lib/server/test-case-filters';

async function loadBatchTags(
	projectId: number,
	tcIds: Set<number>
): Promise<Record<number, { id: number; name: string; color: string }[]>> {
	const tagsByTestCase: Record<number, { id: number; name: string; color: string }[]> = {};
	if (tcIds.size === 0) return tagsByTestCase;

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
		if (!tcIds.has(row.testCaseId)) continue;
		if (!tagsByTestCase[row.testCaseId]) {
			tagsByTestCase[row.testCaseId] = [];
		}
		tagsByTestCase[row.testCaseId].push({
			id: row.tagId,
			name: row.tagName,
			color: row.tagColor
		});
	}
	return tagsByTestCase;
}

async function loadBatchAssignees(
	tcIds: Set<number>
): Promise<Record<number, { userId: string; userName: string }[]>> {
	const assigneesByTestCase: Record<number, { userId: string; userName: string }[]> = {};
	if (tcIds.size === 0) return assigneesByTestCase;

	const tcAssignees = await db
		.select({
			testCaseId: testCaseAssignee.testCaseId,
			userId: testCaseAssignee.userId,
			userName: user.name
		})
		.from(testCaseAssignee)
		.innerJoin(user, eq(testCaseAssignee.userId, user.id))
		.orderBy(user.name);

	for (const row of tcAssignees) {
		if (!tcIds.has(row.testCaseId)) continue;
		if (!assigneesByTestCase[row.testCaseId]) {
			assigneesByTestCase[row.testCaseId] = [];
		}
		assigneesByTestCase[row.testCaseId].push({
			userId: row.userId,
			userName: row.userName
		});
	}
	return assigneesByTestCase;
}

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
			and(
				inArray(testExecution.testRunId, selectedRunIds),
				eq(testCase.projectId, projectId)
			)
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
			return selectedRunIds.some((rid) => tcExecs[rid] && otherStatuses.includes(tcExecs[rid].status));
		}
		return false;
	});
}

export const load: PageServerLoad = async ({ params, url, parent, cookies, locals }) => {
	await parent();
	const projectId = Number(params.projectId);

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

	// Parse selected run IDs: URL param takes priority, otherwise fall back to cookie
	const cookieKey = `tc_runIds_${projectId}`;
	const runIdsParam = url.searchParams.has('runIds')
		? url.searchParams.get('runIds')!
		: (cookies.get(cookieKey) ?? '');
	const selectedRunIds = runIdsParam
		.split(',')
		.map(Number)
		.filter((id) => !isNaN(id) && id > 0);

	// Parse custom field filters from URL params (cf_<fieldId>=value)
	const customFieldFilters: { fieldId: number; value: string }[] = [];
	for (const [key, value] of url.searchParams.entries()) {
		if (key.startsWith('cf_') && value) {
			const fieldId = Number(key.slice(3));
			if (!isNaN(fieldId) && fieldId > 0) {
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
		db.select({
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
	const columnSettings = (projectRow?.columnSettings ?? null) as { id: string; visible: boolean }[] | null;

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

	const baseQuery = db
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
		.where(where);

	const testCases = await baseQuery.orderBy(asc(testCase.sortOrder));

	const tcIdSet = new Set(testCases.map((tc) => tc.id));
	const [tagsByTestCase, assigneesByTestCase] = await Promise.all([
		loadBatchTags(projectId, tcIdSet),
		loadBatchAssignees(tcIdSet)
	]);

	// Load issue link counts per test case
	const issueLinkCounts = tcIdSet.size > 0 ? await db
		.select({ testCaseId: issueLink.testCaseId, count: sql<number>`count(*)`.as('count') })
		.from(issueLink)
		.where(inArray(issueLink.testCaseId, [...tcIdSet]))
		.groupBy(issueLink.testCaseId) : [];
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

	// Persist selected run IDs to cookie
	if (selectedRunIds.length > 0) {
		cookies.set(cookieKey, selectedRunIds.join(','), { path: '/', maxAge: 60 * 60 * 24 * 365 });
	} else {
		cookies.delete(cookieKey, { path: '/' });
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

	const filteredTestCases = applyExecStatusFilter(testCases, executionMap, execStatus, selectedRunIds);

	return {
		testCases: filteredTestCases.map((tc) => ({
			...tc,
			tags: tagsByTestCase[tc.id] ?? [],
			assignees: assigneesByTestCase[tc.id] ?? [],
			issueLinkCount: issueLinkMap[tc.id] ?? 0
		})),
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
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const title = (formData.get('title') as string)?.trim();
		const priority = (formData.get('priority') as string) || 'MEDIUM';
		const groupIdStr = formData.get('groupId') as string | null;
		const groupId = groupIdStr ? Number(groupIdStr) : null;

		if (!title || title.length < 1 || title.length > 200) {
			return fail(400, { error: 'Title is required (1-200 characters)' });
		}

		if (!priority) {
			return fail(400, { error: 'Invalid priority' });
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
			const groupCondition = groupId !== null
				? eq(testCase.groupId, groupId)
				: sql`${testCase.groupId} is null`;
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

			// Update latestVersionId
			await tx
				.update(testCase)
				.set({ latestVersionId: version.id })
				.where(eq(testCase.id, created.id));
		});

		return { quickCreateSuccess: true };
	}
};
