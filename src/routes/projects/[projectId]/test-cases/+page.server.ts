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
	testRun,
	testExecution
} from '$lib/server/db/schema';
import { eq, and, ilike, or, desc, asc, exists, sql, inArray } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ params, url, parent, cookies }) => {
	await parent();
	const projectId = Number(params.projectId);

	const search = url.searchParams.get('search') ?? '';
	const priority = url.searchParams.get('priority') ?? '';
	const tagId = url.searchParams.get('tagId') ?? '';

	// Parse selected run IDs: URL param takes priority, otherwise fall back to cookie
	const cookieKey = `tc_runIds_${projectId}`;
	const runIdsParam = url.searchParams.has('runIds')
		? url.searchParams.get('runIds')!
		: (cookies.get(cookieKey) ?? '');
	const selectedRunIds = runIdsParam
		.split(',')
		.map(Number)
		.filter((id) => !isNaN(id) && id > 0);

	const conditions = [eq(testCase.projectId, projectId)];

	if (search) {
		const searchPattern = `%${search}%`;
		conditions.push(
			or(ilike(testCaseVersion.title, searchPattern), ilike(testCase.key, searchPattern))!
		);
	}

	if (priority && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
		conditions.push(
			eq(
				testCaseVersion.priority,
				priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
			)
		);
	}

	if (tagId) {
		const tagIdNum = Number(tagId);
		if (!isNaN(tagIdNum)) {
			conditions.push(
				exists(
					db
						.select({ one: sql`1` })
						.from(testCaseTag)
						.where(
							and(
								eq(testCaseTag.testCaseId, testCase.id),
								eq(testCaseTag.tagId, tagIdNum)
							)
						)
				)
			);
		}
	}

	const where = and(...conditions);

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
			sortOrder: testCase.sortOrder
		})
		.from(testCase)
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.innerJoin(user, eq(testCaseVersion.updatedBy, user.id))
		.where(where);

	const testCases = await baseQuery.orderBy(asc(testCase.sortOrder));
	const total = testCases.length;

	// Batch load tags for test cases in this project, then filter to current page
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
	const projectTags = await db
		.select({ id: tag.id, name: tag.name, color: tag.color })
		.from(tag)
		.where(eq(tag.projectId, projectId))
		.orderBy(tag.name);

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

	// Load execution data for selected runs
	let executionMap: Record<number, Record<number, { executionId: number; status: string }>> = {};

	if (selectedRunIds.length > 0 && tcIdSet.size > 0) {
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
	}

	// Persist selected run IDs to cookie
	if (selectedRunIds.length > 0) {
		cookies.set(cookieKey, selectedRunIds.join(','), { path: '/', maxAge: 60 * 60 * 24 * 365 });
	} else {
		cookies.delete(cookieKey, { path: '/' });
	}

	return {
		testCases: testCases.map((tc) => ({
			...tc,
			tags: tagsByTestCase[tc.id] ?? []
		})),
		total,
		search,
		priority,
		tagId,
		groups,
		projectTags,
		projectRuns,
		selectedRunIds,
		executionMap
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

		if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
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
					priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
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
