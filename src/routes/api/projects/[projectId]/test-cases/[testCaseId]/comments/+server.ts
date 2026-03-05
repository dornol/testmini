import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseComment, user } from '$lib/server/db/schema';
import { eq, and, asc, isNull } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';

export const GET: RequestHandler = async ({ params, locals }) => {
	requireAuth(locals);
	const projectId = Number(params.projectId);
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
			userName: user.name,
			userEmail: user.email,
			userImage: user.image
		})
		.from(testCaseComment)
		.innerJoin(user, eq(testCaseComment.userId, user.id))
		.where(eq(testCaseComment.testCaseId, testCaseId))
		.orderBy(asc(testCaseComment.createdAt));

	return json(comments);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const testCaseId = Number(params.testCaseId);

	if (isNaN(projectId) || isNaN(testCaseId)) {
		error(400, 'Invalid parameters');
	}

	// Require non-VIEWER project membership
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

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
		return json({ error: 'Content is required' }, { status: 400 });
	}

	if (content.trim().length > 10000) {
		return json({ error: 'Content is too long (max 10000 characters)' }, { status: 400 });
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
			return json({ error: 'Parent comment not found or is already a reply' }, { status: 400 });
		}
	}

	const [inserted] = await db
		.insert(testCaseComment)
		.values({
			testCaseId,
			userId: authUser.id,
			content: content.trim(),
			parentId: parentId ?? null
		})
		.returning();

	// Return with user info
	const userData = await db.query.user.findFirst({
		where: eq(user.id, authUser.id)
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
};
