import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseComment, testCaseAssignee, projectMember, user as userTable } from '$lib/server/db/schema';
import { eq, and, asc, isNull } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';
import { createNotification } from '$lib/server/notifications';
import { validateCommentContent } from '$lib/server/crud-helpers';

/** Extract @mentioned names from comment content */
function extractMentions(content: string): string[] {
	const matches = content.match(/@(\w+)/g);
	if (!matches) return [];
	return [...new Set(matches.map((m) => m.slice(1)).filter(Boolean))];
}

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	if (isNaN(projectId) || isNaN(testCaseId)) {
		error(400, 'Invalid parameters');
	}

	// Verify test case belongs to project
	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});

	if (!tc) {
		error(404, 'Test case not found');
	}

	const comments = await db
		.select({
			id: testCaseComment.id,
			testCaseId: testCaseComment.testCaseId,
			userId: testCaseComment.userId,
			content: testCaseComment.content,
			parentId: testCaseComment.parentId,
			createdAt: testCaseComment.createdAt,
			updatedAt: testCaseComment.updatedAt,
			userName: userTable.name,
			userEmail: userTable.email,
			userImage: userTable.image
		})
		.from(testCaseComment)
		.innerJoin(userTable, eq(testCaseComment.userId, userTable.id))
		.where(eq(testCaseComment.testCaseId, testCaseId))
		.orderBy(asc(testCaseComment.createdAt));

	return json(comments);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, user, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	// Verify test case belongs to project
	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});

	if (!tc) {
		error(404, 'Test case not found');
	}

	const body = await parseJsonBody(request);
	const { content: rawContent, parentId } = body as { content?: string; parentId?: number };

	const contentOrError = validateCommentContent(rawContent);
	if (contentOrError instanceof Response) return contentOrError;
	const content = contentOrError;

	// If parentId given, verify it's a top-level comment on this test case
	if (parentId != null) {
		const parent = await db.query.testCaseComment.findFirst({
			where: and(
				eq(testCaseComment.id, parentId),
				eq(testCaseComment.testCaseId, testCaseId),
				isNull(testCaseComment.parentId)
			)
		});

		if (!parent) {
			return badRequest('Parent comment not found or is already a reply');
		}
	}

	const [inserted] = await db
		.insert(testCaseComment)
		.values({
			testCaseId,
			userId: user.id,
			content,
			parentId: parentId ?? null
		})
		.returning();

	// Notify assignees (exclude comment author)
	const assignees = await db
		.select({ userId: testCaseAssignee.userId })
		.from(testCaseAssignee)
		.where(eq(testCaseAssignee.testCaseId, testCaseId));

	const notifiedUserIds = new Set<string>([user.id]);

	for (const a of assignees) {
		if (!notifiedUserIds.has(a.userId)) {
			notifiedUserIds.add(a.userId);
			createNotification({
				userId: a.userId,
				type: 'COMMENT_ADDED',
				title: 'New comment',
				message: `${user.name ?? 'Someone'} commented on ${tc.key}`,
				link: `/projects/${projectId}/test-cases/${testCaseId}`,
				projectId
			});
		}
	}

	// Notify @mentioned users (only project members, exclude already notified)
	const mentionedNames = extractMentions(content);
	if (mentionedNames.length > 0) {
		const members = await db
			.select({ userId: projectMember.userId, userName: userTable.name })
			.from(projectMember)
			.innerJoin(userTable, eq(projectMember.userId, userTable.id))
			.where(eq(projectMember.projectId, projectId));

		for (const name of mentionedNames) {
			const member = members.find((m) => m.userName?.toLowerCase() === name.toLowerCase());
			if (member && !notifiedUserIds.has(member.userId)) {
				notifiedUserIds.add(member.userId);
				createNotification({
					userId: member.userId,
					type: 'MENTION',
					title: 'You were mentioned',
					message: `${user.name ?? 'Someone'} mentioned you in a comment on ${tc.key}`,
					link: `/projects/${projectId}/test-cases/${testCaseId}`,
					projectId
				});
			}
		}
	}

	// Return with user info
	const userData = await db.query.user.findFirst({
		where: eq(userTable.id, user.id)
	});

	return json(
		{
			...inserted,
			userName: userData?.name ?? null,
			userEmail: userData?.email ?? null,
			userImage: userData?.image ?? null
		},
		{ status: 201 }
	);
});
