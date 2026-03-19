import { error } from '@sveltejs/kit';
import { db } from './db';
import { tag, testCaseTag, testCaseAssignee, projectMember, user, priorityConfig, environmentConfig, team, teamMember, testCase } from './db/schema';
import { eq, and, asc, sql } from 'drizzle-orm';
import { cacheGet, cacheSet } from './cache';

/** Load tags assigned to a specific test case */
export function loadTestCaseTags(testCaseId: number) {
	return db
		.select({ id: tag.id, name: tag.name, color: tag.color })
		.from(testCaseTag)
		.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
		.where(eq(testCaseTag.testCaseId, testCaseId))
		.orderBy(tag.name);
}

/** Load all tags for a project (cached, 5-min TTL) */
type TagRow = { id: number; name: string; color: string };
export async function loadProjectTags(projectId: number): Promise<TagRow[]> {
	const cacheKey = `project:${projectId}:tags`;
	const cached = cacheGet<TagRow[]>(cacheKey);
	if (cached) return cached;

	const result = await db
		.select({ id: tag.id, name: tag.name, color: tag.color })
		.from(tag)
		.where(eq(tag.projectId, projectId))
		.orderBy(tag.name);

	cacheSet(cacheKey, result, 5 * 60 * 1000);
	return result;
}

/** Load assignees for a specific test case */
export function loadTestCaseAssignees(testCaseId: number) {
	return db
		.select({
			userId: testCaseAssignee.userId,
			userName: user.name,
			userImage: user.image
		})
		.from(testCaseAssignee)
		.innerJoin(user, eq(testCaseAssignee.userId, user.id))
		.where(eq(testCaseAssignee.testCaseId, testCaseId))
		.orderBy(user.name);
}

/** Load all members of a project (cached, 5-min TTL) */
type MemberRow = { userId: string; userName: string | null; userImage: string | null };
export async function loadProjectMembers(projectId: number): Promise<MemberRow[]> {
	const cacheKey = `project:${projectId}:members`;
	const cached = cacheGet<MemberRow[]>(cacheKey);
	if (cached) return cached;

	const result = await db
		.select({
			userId: projectMember.userId,
			userName: user.name,
			userImage: user.image
		})
		.from(projectMember)
		.innerJoin(user, eq(projectMember.userId, user.id))
		.where(eq(projectMember.projectId, projectId))
		.orderBy(user.name);

	cacheSet(cacheKey, result, 5 * 60 * 1000);
	return result;
}

/** Load all priority configs for a project */
type PriorityRow = { id: number; name: string; color: string; position: number; isDefault: boolean };
export async function loadProjectPriorities(projectId: number): Promise<PriorityRow[]> {
	const cacheKey = `project:${projectId}:priorities`;
	const cached = cacheGet<PriorityRow[]>(cacheKey);
	if (cached) return cached;

	const result = await db
		.select({
			id: priorityConfig.id,
			name: priorityConfig.name,
			color: priorityConfig.color,
			position: priorityConfig.position,
			isDefault: priorityConfig.isDefault
		})
		.from(priorityConfig)
		.where(eq(priorityConfig.projectId, projectId))
		.orderBy(asc(priorityConfig.position));

	cacheSet(cacheKey, result, 5 * 60 * 1000);
	return result;
}

/** Load all environment configs for a project */
type EnvironmentRow = { id: number; name: string; color: string; position: number; isDefault: boolean; baseUrl: string | null; credentials: string | null; memo: string | null };
export async function loadProjectEnvironments(projectId: number): Promise<EnvironmentRow[]> {
	const cacheKey = `project:${projectId}:environments`;
	const cached = cacheGet<EnvironmentRow[]>(cacheKey);
	if (cached) return cached;

	const result = await db
		.select({
			id: environmentConfig.id,
			name: environmentConfig.name,
			color: environmentConfig.color,
			position: environmentConfig.position,
			isDefault: environmentConfig.isDefault,
			baseUrl: environmentConfig.baseUrl,
			credentials: environmentConfig.credentials,
			memo: environmentConfig.memo
		})
		.from(environmentConfig)
		.where(eq(environmentConfig.projectId, projectId))
		.orderBy(asc(environmentConfig.position));

	cacheSet(cacheKey, result, 5 * 60 * 1000);
	return result;
}

/** Get the next position value for an orderable config table */
type OrderableConfigTable = typeof priorityConfig | typeof environmentConfig;
export async function getNextPosition(
	table: OrderableConfigTable,
	projectId: number
): Promise<number> {
	const all = await db
		.select({ position: table.position })
		.from(table)
		.where(eq(table.projectId, projectId))
		.orderBy(asc(table.position));
	return all.length > 0 ? Math.max(...all.map((p) => p.position)) + 1 : 0;
}

/** Load all members of a team */
export async function loadTeamMembers(teamId: number) {
	return db
		.select({
			id: teamMember.id,
			userId: teamMember.userId,
			role: teamMember.role,
			joinedAt: teamMember.joinedAt,
			userName: user.name,
			userEmail: user.email,
			userImage: user.image
		})
		.from(teamMember)
		.innerJoin(user, eq(teamMember.userId, user.id))
		.where(eq(teamMember.teamId, teamId))
		.orderBy(asc(teamMember.joinedAt));
}

/** Load all teams a user belongs to */
export async function loadUserTeams(userId: string) {
	return db
		.select({
			id: team.id,
			name: team.name,
			description: team.description,
			role: teamMember.role,
			createdAt: team.createdAt
		})
		.from(teamMember)
		.innerJoin(team, eq(teamMember.teamId, team.id))
		.where(eq(teamMember.userId, userId))
		.orderBy(asc(team.name));
}

/** Load tags for a batch of test cases in a project */
export async function loadBatchTags(
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

/** Load assignees for a batch of test cases */
export async function loadBatchAssignees(
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

/** Load all metadata for a test case detail view (tags, assignees, project tags, project members) */
export async function loadTestCaseMetadata(testCaseId: number, projectId: number) {
	const [assignedTags, projectTags, assignedAssignees, projectMembers] = await Promise.all([
		loadTestCaseTags(testCaseId),
		loadProjectTags(projectId),
		loadTestCaseAssignees(testCaseId),
		loadProjectMembers(projectId)
	]);
	return { assignedTags, projectTags, assignedAssignees, projectMembers };
}

/**
 * Batch-fetch the latest execution status for a set of test case IDs within a project.
 * Returns a Map from testCaseId to status string (e.g. 'PASS', 'FAIL').
 */
export async function loadLatestTestCaseExecutionMap(
	projectId: number,
	testCaseIds: number[]
): Promise<Map<number, string>> {
	const map = new Map<number, string>();
	if (testCaseIds.length === 0) return map;

	const latestExecs = await db.execute<{ test_case_id: number; status: string }>(sql`
		SELECT DISTINCT ON (tcv.test_case_id)
			tcv.test_case_id, te.status
		FROM test_execution te
		JOIN test_case_version tcv ON te.test_case_version_id = tcv.id
		JOIN test_run tr ON te.test_run_id = tr.id
		WHERE tr.project_id = ${projectId}
			AND tcv.test_case_id IN ${sql`(${sql.join(testCaseIds.map(id => sql`${id}`), sql`, `)})`}
		ORDER BY tcv.test_case_id, te.id DESC
	`);
	for (const row of latestExecs) {
		map.set(row.test_case_id, row.status);
	}
	return map;
}

/**
 * Look up a test case scoped to a project, throwing 404 if not found.
 */
export async function requireTestCase(testCaseId: number, projectId: number) {
	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) {
		error(404, 'Test case not found');
	}
	return tc;
}
