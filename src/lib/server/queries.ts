import { db } from './db';
import { tag, testCaseTag, testCaseAssignee, projectMember, user } from './db/schema';
import { eq } from 'drizzle-orm';

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
