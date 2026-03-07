import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseComment, user as userTable } from '$lib/server/db/schema';
import { eq, and, asc, isNull } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';

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
	const { content, parentId } = body as { content?: string; parentId?: number };

	if (!content || typeof content !== 'string' || content.trim().length === 0) {
		return badRequest('Content is required');
	}

	if (content.trim().length > 10000) {
		return badRequest('Content is too long (max 10000 characters)');
	}

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
			content: content.trim(),
			parentId: parentId ?? null
		})
		.returning();

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
