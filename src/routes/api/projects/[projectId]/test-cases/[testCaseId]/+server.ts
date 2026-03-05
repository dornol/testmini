import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, user, tag, testCaseTag, testCaseAssignee, projectMember } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';

export const GET: RequestHandler = async ({ params, locals }) => {
	requireAuth(locals);
	const projectId = Number(params.projectId);
	const testCaseId = Number(params.testCaseId);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)),
		with: { latestVersion: true }
	});

	if (!tc) {
		error(404, 'Test case not found');
	}

	const versions = await db
		.select({
			id: testCaseVersion.id,
			versionNo: testCaseVersion.versionNo,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority,
			updatedBy: user.name,
			createdAt: testCaseVersion.createdAt
		})
		.from(testCaseVersion)
		.innerJoin(user, eq(testCaseVersion.updatedBy, user.id))
		.where(eq(testCaseVersion.testCaseId, testCaseId))
		.orderBy(desc(testCaseVersion.versionNo));

	const [assignedTags, projectTags, assignedAssignees, projectMembers] = await Promise.all([
		db
			.select({ id: tag.id, name: tag.name, color: tag.color })
			.from(testCaseTag)
			.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
			.where(eq(testCaseTag.testCaseId, testCaseId))
			.orderBy(tag.name),
		db
			.select({ id: tag.id, name: tag.name, color: tag.color })
			.from(tag)
			.where(eq(tag.projectId, projectId))
			.orderBy(tag.name),
		db
			.select({
				userId: testCaseAssignee.userId,
				userName: user.name,
				userImage: user.image
			})
			.from(testCaseAssignee)
			.innerJoin(user, eq(testCaseAssignee.userId, user.id))
			.where(eq(testCaseAssignee.testCaseId, testCaseId))
			.orderBy(user.name),
		db
			.select({
				userId: projectMember.userId,
				userName: user.name,
				userImage: user.image
			})
			.from(projectMember)
			.innerJoin(user, eq(projectMember.userId, user.id))
			.where(eq(projectMember.projectId, projectId))
			.orderBy(user.name)
	]);

	return json({
		testCase: {
			id: tc.id,
			key: tc.key,
			automationKey: tc.automationKey ?? null,
			createdAt: tc.createdAt,
			latestVersion: tc.latestVersion
		},
		versions,
		assignedTags,
		projectTags,
		assignedAssignees,
		projectMembers
	});
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const testCaseId = Number(params.testCaseId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const body = await parseJsonBody(request);
	const { key, title, priority, automationKey } = body as {
		key?: string;
		title?: string;
		priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
		automationKey?: string | null;
	};

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)),
		with: { latestVersion: true }
	});

	if (!tc) {
		error(404, 'Test case not found');
	}

	// Key update: direct update on testCase table
	if (key !== undefined) {
		const trimmed = key.trim();
		if (!trimmed) {
			return json({ error: 'Key cannot be empty' }, { status: 400 });
		}
		// Check uniqueness within project
		const existing = await db.query.testCase.findFirst({
			where: and(eq(testCase.projectId, projectId), eq(testCase.key, trimmed))
		});
		if (existing && existing.id !== testCaseId) {
			return json({ error: 'Key already exists in this project' }, { status: 409 });
		}
		await db.update(testCase).set({ key: trimmed }).where(eq(testCase.id, testCaseId));
	}

	// Automation key update
	if (automationKey !== undefined) {
		const trimmedAk = typeof automationKey === 'string' ? automationKey.trim() || null : null;
		if (trimmedAk) {
			const existingAk = await db.query.testCase.findFirst({
				where: and(eq(testCase.projectId, projectId), eq(testCase.automationKey, trimmedAk))
			});
			if (existingAk && existingAk.id !== testCaseId) {
				return json({ error: 'Automation key already exists in this project' }, { status: 409 });
			}
		}
		await db.update(testCase).set({ automationKey: trimmedAk }).where(eq(testCase.id, testCaseId));
	}

	// Title or priority update: create a new version to preserve history
	if (title !== undefined || priority !== undefined) {
		if (!tc.latestVersion) {
			error(500, 'No latest version found');
		}
		const latest = tc.latestVersion;
		const nextVersionNo = latest.versionNo + 1;
		const nextRevision = latest.revision + 1;

		const [version] = await db
			.insert(testCaseVersion)
			.values({
				testCaseId,
				versionNo: nextVersionNo,
				title: title ?? latest.title,
				precondition: latest.precondition,
				steps: latest.steps,
				expectedResult: latest.expectedResult,
				priority: priority ?? latest.priority,
				revision: nextRevision,
				updatedBy: authUser.id
			})
			.returning();

		await db
			.update(testCase)
			.set({ latestVersionId: version.id })
			.where(eq(testCase.id, testCaseId));
	}

	return json({ success: true });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const testCaseId = Number(params.testCaseId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const body = await parseJsonBody(request);
	const { title, precondition, steps, expectedResult, priority, revision } = body as {
		title: string;
		precondition: string;
		steps: { action: string; expected: string }[];
		expectedResult: string;
		priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
		revision: number;
	};

	if (!title || title.length < 1 || title.length > 200) {
		return json({ error: 'Title is required (1-200 characters)' }, { status: 400 });
	}

	if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
		return json({ error: 'Invalid priority' }, { status: 400 });
	}

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)),
		with: { latestVersion: true }
	});

	if (!tc) {
		error(404, 'Test case not found');
	}

	if (tc.latestVersion && tc.latestVersion.revision !== revision) {
		return json(
			{ error: 'This test case has been modified by another user. Please refresh and try again.' },
			{ status: 409 }
		);
	}

	const nextVersionNo = tc.latestVersion ? tc.latestVersion.versionNo + 1 : 1;
	const nextRevision = (tc.latestVersion?.revision ?? 0) + 1;

	const numberedSteps = (steps ?? []).map((s, i) => ({
		order: i + 1,
		action: s.action,
		expected: s.expected
	}));

	await db.transaction(async (tx) => {
		const [version] = await tx
			.insert(testCaseVersion)
			.values({
				testCaseId,
				versionNo: nextVersionNo,
				title,
				precondition: precondition || null,
				steps: numberedSteps,
				expectedResult: expectedResult || null,
				priority,
				revision: nextRevision,
				updatedBy: authUser.id
			})
			.returning();

		await tx
			.update(testCase)
			.set({ latestVersionId: version.id })
			.where(eq(testCase.id, testCaseId));
	});

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const testCaseId = Number(params.testCaseId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN']);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});

	if (!tc) {
		error(404, 'Test case not found');
	}

	await db.delete(testCase).where(eq(testCase.id, testCaseId));

	return json({ success: true });
};
