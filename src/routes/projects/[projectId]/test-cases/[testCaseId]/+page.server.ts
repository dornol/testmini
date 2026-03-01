import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { updateTestCaseSchema, type UpdateTestCaseInput } from '$lib/schemas/test-case.schema';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, user } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const testCaseId = Number(params.testCaseId);

	if (isNaN(testCaseId)) {
		error(400, 'Invalid test case ID');
	}

	// Get test case with latest version
	const tc = await db.query.testCase.findFirst({
		where: eq(testCase.id, testCaseId),
		with: {
			latestVersion: true
		}
	});

	if (!tc || tc.projectId !== Number(params.projectId)) {
		error(404, 'Test case not found');
	}

	// Get version history
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

	// Pre-fill edit form with latest version data
	const latest = tc.latestVersion;
	// @ts-ignore zod 3.24 type mismatch with superforms adapter
	const form = await superValidate(
		{
			title: latest?.title ?? '',
			precondition: latest?.precondition ?? '',
			steps: (latest?.steps ?? []).map((s: { action: string; expected: string }) => ({ action: s.action, expected: s.expected })),
			expectedResult: latest?.expectedResult ?? '',
			priority: latest?.priority ?? 'MEDIUM',
			revision: latest?.revision ?? 1
		},
		// @ts-ignore zod 3.24 type mismatch with superforms adapter
		zod(updateTestCaseSchema)
	);

	return {
		testCaseDetail: {
			id: tc.id,
			key: tc.key,
			createdAt: tc.createdAt,
			latestVersion: latest
		},
		versions,
		form
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const testCaseId = Number(params.testCaseId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		// @ts-ignore zod 3.24 type mismatch with superforms adapter
		const form = await superValidate(request, zod(updateTestCaseSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { title, precondition, steps, expectedResult, priority, revision } =
			form.data as UpdateTestCaseInput;

		// Optimistic lock check
		const tc = await db.query.testCase.findFirst({
			where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)),
			with: { latestVersion: true }
		});

		if (!tc) {
			error(404, 'Test case not found');
		}

		if (tc.latestVersion && tc.latestVersion.revision !== revision) {
			return message(
				form,
				'This test case has been modified by another user. Please refresh and try again.',
				{ status: 409 }
			);
		}

		const nextVersionNo = tc.latestVersion ? tc.latestVersion.versionNo + 1 : 1;
		const nextRevision = (tc.latestVersion?.revision ?? 0) + 1;

		const numberedSteps = steps.map((s, i) => ({
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

		return message(form, 'Test case updated successfully');
	},

	delete: async ({ locals, params }) => {
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

		return { deleted: true };
	}
};
