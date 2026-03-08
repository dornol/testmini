import { db } from './db';
import { tag, testCaseTag, testCaseAssignee, projectMember, user, priorityConfig, environmentConfig } from './db/schema';
import { eq, asc } from 'drizzle-orm';

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
export function loadProjectPriorities(projectId: number) {
	return db
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
}

/** Load all environment configs for a project */
export function loadProjectEnvironments(projectId: number) {
	return db
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
