import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createTestCaseSchema, type CreateTestCaseInput } from '$lib/schemas/test-case.schema';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ parent }) => {
	const { userRole } = await parent();
	if (userRole === 'VIEWER') {
		redirect(303, '../test-cases');
	}

	// @ts-ignore zod 3.24 type mismatch with superforms adapter
	const form = await superValidate(zod(createTestCaseSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const user = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		// @ts-ignore zod 3.24 type mismatch with superforms adapter
		const form = await superValidate(request, zod(createTestCaseSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { title, precondition, steps, expectedResult, priority, automationKey } =
			form.data as CreateTestCaseInput;

		// Validate automationKey uniqueness before transaction
		if (automationKey) {
			const existingAk = await db.query.testCase.findFirst({
				where: and(
					eq(testCase.projectId, projectId),
					eq(testCase.automationKey, automationKey)
				)
			});
			if (existingAk) {
				return fail(409, { form });
			}
		}

		const newTestCase = await db.transaction(async (tx) => {
			// Generate key: TC-0001 format
			const [maxResult] = await tx
				.select({
					maxKey: sql<string>`max(key)`.as('max_key')
				})
				.from(testCase)
				.where(eq(testCase.projectId, projectId));

			let nextNum = 1;
			if (maxResult?.maxKey) {
				const match = maxResult.maxKey.match(/TC-(\d+)/);
				if (match) {
					nextNum = parseInt(match[1], 10) + 1;
				}
			}
			const key = `TC-${String(nextNum).padStart(4, '0')}`;

			// Create test case
			const [created] = await tx
				.insert(testCase)
				.values({
					projectId,
					key,
					automationKey: automationKey || null,
					createdBy: user.id
				})
				.returning();

			// Create first version
			const numberedSteps = steps.map((s, i) => ({
				order: i + 1,
				action: s.action,
				expected: s.expected
			}));

			const [version] = await tx
				.insert(testCaseVersion)
				.values({
					testCaseId: created.id,
					versionNo: 1,
					title,
					precondition: precondition || null,
					steps: numberedSteps,
					expectedResult: expectedResult || null,
					priority,
					updatedBy: user.id
				})
				.returning();

			// Update latestVersionId
			await tx
				.update(testCase)
				.set({ latestVersionId: version.id })
				.where(eq(testCase.id, created.id));

			return created;
		});

		redirect(303, `/projects/${projectId}/test-cases/${newTestCase.id}`);
	}
};
