import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { createTestCaseSchema, type CreateTestCaseInput } from '$lib/schemas/test-case.schema';
import { emptyForm, validateForm } from '$lib/server/form-utils';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, customField } from '$lib/server/db/schema';
import { eq, and, sql, asc } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseId } from '$lib/server/auth-utils';
import { assertContentLengthUnderLimit } from '$lib/server/request-size';
import { cacheDeleteProjectAnalytics } from '$lib/server/cache';

const MAX_TEST_CASE_CREATE_FORM_BODY_SIZE = 256 * 1024;

export const load: PageServerLoad = async ({ parent, params }) => {
	const { userRole } = await parent();
	if (userRole === 'VIEWER') {
		redirect(303, '../test-cases');
	}

	const projectId = parseId(params.projectId, 'project ID');
	const [form, customFieldDefs] = await Promise.all([
		emptyForm(createTestCaseSchema),
		db
			.select({
				id: customField.id,
				name: customField.name,
				fieldType: customField.fieldType,
				options: customField.options,
				required: customField.required
			})
			.from(customField)
			.where(eq(customField.projectId, projectId))
			.orderBy(asc(customField.sortOrder), asc(customField.id))
	]);
	return { form, customFieldDefs };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const user = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertContentLengthUnderLimit(
			request,
			MAX_TEST_CASE_CREATE_FORM_BODY_SIZE,
			'Test case create form body is too large'
		);

		const form = await validateForm(createTestCaseSchema, request);

		if (!form.valid) {
			return fail(400, { form });
		}

		const {
			title,
			precondition,
			steps,
			expectedResult,
			priority,
			automationKey,
			stepFormat,
			customFields: customFieldValues
		} = form.data as CreateTestCaseInput;

		// Validate automationKey uniqueness before transaction
		if (automationKey) {
			const existingAk = await db.query.testCase.findFirst({
				where: and(eq(testCase.projectId, projectId), eq(testCase.automationKey, automationKey))
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
			if (!created) {
				error(500, 'Failed to create test case');
			}

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
					stepFormat: stepFormat ?? 'STEPS',
					expectedResult: expectedResult || null,
					priority,
					customFields:
						customFieldValues && Object.keys(customFieldValues).length > 0
							? customFieldValues
							: null,
					updatedBy: user.id
				})
				.returning();
			if (!version) {
				error(500, 'Failed to create test case version');
			}

			// Update latestVersionId
			await tx
				.update(testCase)
				.set({ latestVersionId: version.id })
				.where(eq(testCase.id, created.id));

			return created;
		});

		cacheDeleteProjectAnalytics(projectId);
		redirect(303, `/projects/${projectId}/test-cases/${newTestCase.id}`);
	}
};
