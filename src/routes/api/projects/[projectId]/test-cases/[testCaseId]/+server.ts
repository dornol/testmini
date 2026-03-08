import { json, error } from '@sveltejs/kit';
import { db, findTestCaseWithLatestVersion } from '$lib/server/db';
import { testCase, testCaseVersion, user } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { loadTestCaseMetadata } from '$lib/server/queries';
import { badRequest, conflict } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	const tc = await findTestCaseWithLatestVersion(testCaseId, projectId);

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

	const { assignedTags, projectTags, assignedAssignees, projectMembers } =
		await loadTestCaseMetadata(testCaseId, projectId);

	return json({
		testCase: {
			id: tc.id,
			key: tc.key,
			automationKey: tc.automationKey ?? null,
			approvalStatus: tc.approvalStatus,
			createdAt: tc.createdAt,
			latestVersion: tc.latestVersion
		},
		versions,
		assignedTags,
		projectTags,
		assignedAssignees,
		projectMembers
	});
});

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, user, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	const body = await parseJsonBody(request);
	const { key, title, priority, automationKey } = body as {
		key?: string;
		title?: string;
		priority?: string;
		automationKey?: string | null;
	};

	const tc = await findTestCaseWithLatestVersion(testCaseId, projectId);

	if (!tc) {
		error(404, 'Test case not found');
	}

	// Key update: direct update on testCase table
	if (key !== undefined) {
		const trimmed = key.trim();
		if (!trimmed) {
			return badRequest('Key cannot be empty');
		}
		// Check uniqueness within project
		const existing = await db.query.testCase.findFirst({
			where: and(eq(testCase.projectId, projectId), eq(testCase.key, trimmed))
		});
		if (existing && existing.id !== testCaseId) {
			return conflict('Key already exists in this project');
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
				return conflict('Automation key already exists in this project');
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
				updatedBy: user.id
			})
			.returning();

		await db
			.update(testCase)
			.set({ latestVersionId: version.id })
			.where(eq(testCase.id, testCaseId));
	}

	return json({ success: true });
});

export const PUT = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, user, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	const body = await parseJsonBody(request);
	const { title, precondition, steps, expectedResult, priority, revision, stepFormat } = body as {
		title: string;
		precondition: string;
		steps: { action: string; expected: string }[];
		expectedResult: string;
		priority: string;
		revision: number;
		stepFormat?: 'STEPS' | 'GHERKIN';
	};

	if (!title || title.length < 1 || title.length > 200) {
		return badRequest('Title is required (1-200 characters)');
	}

	if (!priority) {
		return badRequest('Priority is required');
	}

	const tc = await findTestCaseWithLatestVersion(testCaseId, projectId);

	if (!tc) {
		error(404, 'Test case not found');
	}

	if (tc.latestVersion && tc.latestVersion.revision !== revision) {
		return conflict('This test case has been modified by another user. Please refresh and try again.');
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
				stepFormat: stepFormat ?? tc.latestVersion?.stepFormat ?? 'STEPS',
				expectedResult: expectedResult || null,
				priority,
				revision: nextRevision,
				updatedBy: user.id
			})
			.returning();

		await tx
			.update(testCase)
			.set({ latestVersionId: version.id })
			.where(eq(testCase.id, testCaseId));
	});

	return json({ success: true });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});

	if (!tc) {
		error(404, 'Test case not found');
	}

	await db.delete(testCase).where(eq(testCase.id, testCaseId));

	return json({ success: true });
});
