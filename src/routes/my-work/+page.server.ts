import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	notification,
	project,
	projectMember,
	testCase,
	testCaseAssignee,
	testCaseVersion,
	testExecution,
	testPlan,
	testPlanTestCase,
	testRun
} from '$lib/server/db/schema';
import { and, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import {
	filterAndSortWorkItems,
	parseProjectFilter,
	parseWorkType,
	type WorkItem,
	type WorkType
} from '$lib/my-work';

const ITEM_LIMIT = 100;
const PRIORITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const userId = locals.user.id;
	const now = new Date();
	const dueThreshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

	const [assigned, approvals, executions, notifications, deadlines, availableProjects] =
		await Promise.all([
			db
				.select({
					id: testCase.id,
					projectId: project.id,
					projectName: project.name,
					key: testCase.key,
					title: testCaseVersion.title,
					priority: testCaseVersion.priority,
					retestNeeded: testCase.retestNeeded,
					assignedAt: testCaseAssignee.assignedAt
				})
				.from(testCaseAssignee)
				.innerJoin(testCase, eq(testCaseAssignee.testCaseId, testCase.id))
				.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
				.innerJoin(project, and(eq(testCase.projectId, project.id), eq(project.active, true)))
				.where(eq(testCaseAssignee.userId, userId))
				.orderBy(desc(testCaseAssignee.assignedAt))
				.limit(ITEM_LIMIT),
			db
				.select({
					id: testCase.id,
					projectId: project.id,
					projectName: project.name,
					key: testCase.key,
					title: testCaseVersion.title,
					priority: testCaseVersion.priority,
					updatedAt: testCase.updatedAt
				})
				.from(testCase)
				.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
				.innerJoin(project, and(eq(testCase.projectId, project.id), eq(project.active, true)))
				.innerJoin(
					projectMember,
					and(eq(projectMember.projectId, project.id), eq(projectMember.userId, userId))
				)
				.where(
					and(
						eq(testCase.approvalStatus, 'IN_REVIEW'),
						ne(testCase.createdBy, userId),
						inArray(projectMember.role, ['PROJECT_ADMIN', 'QA'])
					)
				)
				.orderBy(desc(testCase.updatedAt))
				.limit(ITEM_LIMIT),
			db
				.select({
					id: testExecution.id,
					projectId: project.id,
					projectName: project.name,
					runId: testRun.id,
					runName: testRun.name,
					caseKey: testCase.key,
					caseTitle: testCaseVersion.title,
					priority: testCaseVersion.priority,
					createdAt: testRun.createdAt
				})
				.from(testExecution)
				.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
				.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
				.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
				.innerJoin(
					testCaseAssignee,
					and(eq(testCaseAssignee.testCaseId, testCase.id), eq(testCaseAssignee.userId, userId))
				)
				.innerJoin(project, and(eq(testRun.projectId, project.id), eq(project.active, true)))
				.where(
					and(
						inArray(testExecution.status, ['PENDING', 'BLOCKED']),
						inArray(testRun.status, ['CREATED', 'IN_PROGRESS'])
					)
				)
				.orderBy(desc(testRun.createdAt))
				.limit(ITEM_LIMIT),
			db
				.select({
					id: notification.id,
					type: notification.type,
					title: notification.title,
					message: notification.message,
					link: notification.link,
					projectId: project.id,
					projectName: project.name,
					createdAt: notification.createdAt
				})
				.from(notification)
				.innerJoin(project, and(eq(notification.projectId, project.id), eq(project.active, true)))
				.innerJoin(
					projectMember,
					and(eq(projectMember.projectId, project.id), eq(projectMember.userId, userId))
				)
				.where(
					and(
						eq(notification.userId, userId),
						eq(notification.isRead, false),
						inArray(notification.type, ['MENTION', 'TEST_FAILED'])
					)
				)
				.orderBy(desc(notification.createdAt))
				.limit(ITEM_LIMIT),
			db
				.selectDistinct({
					id: testPlan.id,
					projectId: project.id,
					projectName: project.name,
					name: testPlan.name,
					endDate: testPlan.endDate,
					updatedAt: testPlan.updatedAt
				})
				.from(testPlan)
				.innerJoin(testPlanTestCase, eq(testPlanTestCase.testPlanId, testPlan.id))
				.innerJoin(testCaseAssignee, eq(testPlanTestCase.testCaseId, testCaseAssignee.testCaseId))
				.innerJoin(project, and(eq(testPlan.projectId, project.id), eq(project.active, true)))
				.where(
					and(
						eq(testCaseAssignee.userId, userId),
						inArray(testPlan.status, ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE']),
						gte(testPlan.endDate, now),
						lte(testPlan.endDate, dueThreshold)
					)
				)
				.orderBy(testPlan.endDate)
				.limit(ITEM_LIMIT),
			db
				.select({ id: project.id, name: project.name })
				.from(projectMember)
				.innerJoin(project, and(eq(projectMember.projectId, project.id), eq(project.active, true)))
				.where(eq(projectMember.userId, userId))
				.orderBy(project.name)
		]);

	const items: WorkItem[] = [
		...assigned.map((item) => ({
			id: `case-${item.id}`,
			type: (item.retestNeeded ? 'RETEST' : 'ASSIGNED') as WorkType,
			projectId: item.projectId,
			projectName: item.projectName,
			title: `${item.key} · ${item.title}`,
			subtitle: null,
			priority: item.priority,
			href: `/projects/${item.projectId}/test-cases/${item.id}`,
			createdAt: item.assignedAt,
			dueAt: null
		})),
		...approvals.map((item) => ({
			id: `approval-${item.id}`,
			type: 'APPROVAL' as const,
			projectId: item.projectId,
			projectName: item.projectName,
			title: `${item.key} · ${item.title}`,
			subtitle: null,
			priority: item.priority,
			href: `/projects/${item.projectId}/test-cases/${item.id}#approval`,
			createdAt: item.updatedAt,
			dueAt: null
		})),
		...executions.map((item) => ({
			id: `execution-${item.id}`,
			type: 'EXECUTION' as const,
			projectId: item.projectId,
			projectName: item.projectName,
			title: `${item.caseKey} · ${item.caseTitle}`,
			subtitle: item.runName,
			priority: item.priority,
			href: `/projects/${item.projectId}/test-runs/${item.runId}?execution=${item.id}`,
			createdAt: item.createdAt,
			dueAt: null
		})),
		...notifications.map((item) => ({
			id: `notification-${item.id}`,
			type: (item.type === 'MENTION' ? 'MENTION' : 'FAILURE') as WorkType,
			projectId: item.projectId,
			projectName: item.projectName,
			title: item.title,
			subtitle: item.message,
			priority: item.type === 'TEST_FAILED' ? 'HIGH' : null,
			href: item.link || `/projects/${item.projectId}`,
			createdAt: item.createdAt,
			dueAt: null
		})),
		...deadlines.map((item) => ({
			id: `deadline-${item.id}`,
			type: 'DUE_SOON' as const,
			projectId: item.projectId,
			projectName: item.projectName,
			title: item.name,
			subtitle: null,
			priority: 'HIGH',
			href: `/projects/${item.projectId}/test-plans/${item.id}`,
			createdAt: item.updatedAt,
			dueAt: item.endDate
		}))
	];

	const type = parseWorkType(url.searchParams.get('type'));
	const projectId = parseProjectFilter(url.searchParams.get('project'));
	const rawPriority = url.searchParams.get('priority')?.toUpperCase() ?? null;
	const priority = rawPriority && PRIORITIES.has(rawPriority) ? rawPriority : null;
	const filteredItems = filterAndSortWorkItems(items, { type, projectId, priority });

	return {
		items: filteredItems,
		projects: availableProjects,
		filters: { type, projectId, priority },
		counts: Object.fromEntries(
			['ALL', ...(['ASSIGNED', 'APPROVAL', 'EXECUTION', 'MENTION', 'FAILURE', 'RETEST', 'DUE_SOON'] as const)].map(
				(category) => [category, category === 'ALL' ? items.length : items.filter((item) => item.type === category).length]
			)
		)
	};
};
