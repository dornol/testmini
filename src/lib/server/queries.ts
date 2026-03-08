import { db } from './db';
import { tag, testCaseTag, testCaseAssignee, projectMember, user, priorityConfig, environmentConfig, team, teamMember } from './db/schema';
import { eq, asc } from 'drizzle-orm';
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

/** Load all tags for a project */
export function loadProjectTags(projectId: number) {
	return db
		.select({ id: tag.id, name: tag.name, color: tag.color })
		.from(tag)
		.where(eq(tag.projectId, projectId))
		.orderBy(tag.name);
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

/** Load all members of a project */
export function loadProjectMembers(projectId: number) {
	return db
		.select({
			userId: projectMember.userId,
			userName: user.name,
			userImage: user.image
		})
		.from(projectMember)
		.innerJoin(user, eq(projectMember.userId, user.id))
		.where(eq(projectMember.projectId, projectId))
		.orderBy(user.name);
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
type EnvironmentRow = { id: number; name: string; color: string; position: number; isDefault: boolean };
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
			isDefault: environmentConfig.isDefault
		})
		.from(environmentConfig)
		.where(eq(environmentConfig.projectId, projectId))
		.orderBy(asc(environmentConfig.position));

	cacheSet(cacheKey, result, 5 * 60 * 1000);
	return result;
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
