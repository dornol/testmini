import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { updateTestCaseSchema, type UpdateTestCaseInput } from '$lib/schemas/test-case.schema';
import { zodAdapter, validateForm, parsePositiveFormId } from '$lib/server/form-utils';
import { db, findTestCaseWithLatestVersion } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	user,
	tag,
	testCaseTag,
	testCaseAssignee,
	projectMember,
	customField,
	issueLink,
	issueTrackerConfig,
	testCaseParameter,
	testCaseDataSet
} from '$lib/server/db/schema';
import { createTagSchema } from '$lib/schemas/tag.schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseId } from '$lib/server/auth-utils';
import { loadTestCaseMetadata } from '$lib/server/queries';
import { cacheDelete } from '$lib/server/cache';
import { parseOptionalFormString, parseOptionalTrimmedFormString } from '$lib/server/form-utils';
import { assertContentLengthUnderLimit } from '$lib/server/request-size';

const MAX_TEST_CASE_EDIT_FORM_BODY_SIZE = 256 * 1024;
const MAX_TEST_CASE_ACTION_FORM_BODY_SIZE = 16 * 1024;
const MAX_USER_ID_LENGTH = 255;

function assertTestCaseEditFormBodySize(request: Request): void {
	assertContentLengthUnderLimit(
		request,
		MAX_TEST_CASE_EDIT_FORM_BODY_SIZE,
		'Test case edit form body is too large'
	);
}

function assertTestCaseActionFormBodySize(request: Request): void {
	assertContentLengthUnderLimit(
		request,
		MAX_TEST_CASE_ACTION_FORM_BODY_SIZE,
		'Test case action form body is too large'
	);
}

function parseUserId(value: FormDataEntryValue | null): string | null {
	if (typeof value !== 'string') return null;
	const userId = value.trim();
	if (!userId || userId.length > MAX_USER_ID_LENGTH || /[\x00-\x1F\x7F]/.test(userId)) {
		return null;
	}
	return userId;
}

async function requireActionTestCase(testCaseId: number, projectId: number) {
	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) {
		error(404, 'Test case not found');
	}
	return tc;
}

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	await parent();
	const authUser = requireAuth(locals);
	const testCaseId = parseId(params.testCaseId, 'test case ID');

	// Get test case with latest version
	const tc = await findTestCaseWithLatestVersion(
		testCaseId,
		parseId(params.projectId, 'project ID')
	);

	if (!tc) {
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
	const form = await superValidate(
		{
			title: latest?.title ?? '',
			precondition: latest?.precondition ?? '',
			steps: (latest?.steps ?? []).map((s: { action: string; expected: string }) => ({
				action: s.action,
				expected: s.expected
			})),
			stepFormat: (latest?.stepFormat as 'STEPS' | 'GHERKIN') ?? 'STEPS',
			expectedResult: latest?.expectedResult ?? '',
			priority: latest?.priority ?? 'MEDIUM',
			revision: latest?.revision ?? 1,
			automationKey: tc.automationKey ?? '',
			customFields: (latest?.customFields as Record<string, unknown>) ?? {}
		},
		zodAdapter(updateTestCaseSchema)
	);

	const projectId = parseId(params.projectId, 'project ID');

	// Load project tags, assigned tags, assignees, and project members
	const { assignedTags, projectTags, assignedAssignees, projectMembers } =
		await loadTestCaseMetadata(testCaseId, projectId);

	// Load custom field definitions
	const customFieldDefs = await db
		.select()
		.from(customField)
		.where(eq(customField.projectId, projectId))
		.orderBy(asc(customField.sortOrder), asc(customField.id));

	// Load issue links for this test case
	const issueLinks = await db
		.select()
		.from(issueLink)
		.where(eq(issueLink.testCaseId, testCaseId))
		.orderBy(desc(issueLink.createdAt));

	// Check if issue tracker is configured
	const trackerConfig = await db.query.issueTrackerConfig.findFirst({
		where: and(eq(issueTrackerConfig.projectId, projectId), eq(issueTrackerConfig.enabled, true))
	});

	// Load parameters and data sets
	const parameters = await db
		.select()
		.from(testCaseParameter)
		.where(eq(testCaseParameter.testCaseId, testCaseId))
		.orderBy(asc(testCaseParameter.orderIndex));

	const dataSets = await db
		.select()
		.from(testCaseDataSet)
		.where(eq(testCaseDataSet.testCaseId, testCaseId))
		.orderBy(asc(testCaseDataSet.orderIndex));

	return {
		testCaseDetail: {
			id: tc.id,
			key: tc.key,
			automationKey: tc.automationKey ?? null,
			approvalStatus: tc.approvalStatus,
			createdBy: tc.createdBy,
			createdAt: tc.createdAt,
			latestVersion: latest
		},
		versions,
		form,
		projectTags,
		assignedTags,
		assignedAssignees,
		projectMembers,
		currentUserId: authUser.id,
		customFieldDefs,
		issueLinks,
		hasIssueTracker: !!trackerConfig,
		parameters,
		dataSets
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertTestCaseEditFormBodySize(request);

		const form = await validateForm(updateTestCaseSchema, request);

		if (!form.valid) {
			return fail(400, { form });
		}

		const {
			title,
			precondition,
			steps,
			stepFormat,
			expectedResult,
			priority,
			revision,
			automationKey,
			customFields: customFieldValues
		} = form.data as UpdateTestCaseInput;

		// Optimistic lock check
		const tc = await findTestCaseWithLatestVersion(testCaseId, projectId);

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

		// Validate automationKey uniqueness within project if changed
		if (automationKey !== undefined) {
			const trimmedAk = automationKey?.trim() || null;
			if (trimmedAk) {
				const existingAk = await db.query.testCase.findFirst({
					where: and(eq(testCase.projectId, projectId), eq(testCase.automationKey, trimmedAk))
				});
				if (existingAk && existingAk.id !== testCaseId) {
					return message(form, 'Automation key already exists in this project', { status: 409 });
				}
			}
			await db
				.update(testCase)
				.set({ automationKey: trimmedAk })
				.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)));
		}

		await db.transaction(async (tx) => {
			const [version] = await tx
				.insert(testCaseVersion)
				.values({
					testCaseId,
					versionNo: nextVersionNo,
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
					revision: nextRevision,
					updatedBy: authUser.id
				})
				.returning();
			if (!version) {
				error(500, 'Failed to create test case version');
			}

			await tx
				.update(testCase)
				.set({ latestVersionId: version.id })
				.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)));
		});

		return message(form, 'Test case updated successfully');
	},

	createTag: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertTestCaseActionFormBodySize(request);

		const formData = await request.formData();
		const name = parseOptionalTrimmedFormString(formData.get('name'));
		const color = parseOptionalFormString(formData.get('color'));

		const parsed = createTagSchema.safeParse({ name, color });
		if (!parsed.success) {
			return fail(400, { error: 'Invalid tag data' });
		}

		await requireActionTestCase(testCaseId, projectId);

		// Check duplicate
		const existing = await db.query.tag.findFirst({
			where: and(eq(tag.projectId, projectId), eq(tag.name, parsed.data.name))
		});

		if (existing) {
			// Tag exists, just assign it
			const alreadyAssigned = await db.query.testCaseTag.findFirst({
				where: and(eq(testCaseTag.testCaseId, testCaseId), eq(testCaseTag.tagId, existing.id))
			});
			if (!alreadyAssigned) {
				await db.insert(testCaseTag).values({ testCaseId, tagId: existing.id });
			}
			return { tagCreatedAndAssigned: true };
		}

		await db.transaction(async (tx) => {
			const [newTag] = await tx
				.insert(tag)
				.values({
					projectId,
					name: parsed.data.name,
					color: parsed.data.color,
					createdBy: authUser.id
				})
				.returning();
			if (!newTag) {
				error(500, 'Failed to create tag');
			}

			await tx.insert(testCaseTag).values({ testCaseId, tagId: newTag.id });
		});

		cacheDelete(`project:${projectId}:tags`);
		return { tagCreatedAndAssigned: true };
	},

	assignTag: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertTestCaseActionFormBodySize(request);

		const formData = await request.formData();
		const tagId = parsePositiveFormId(formData.get('tagId'));

		if (!tagId) {
			return fail(400, { error: 'Invalid tagId' });
		}

		await requireActionTestCase(testCaseId, projectId);

		// Verify tag belongs to project
		const t = await db.query.tag.findFirst({
			where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
		});

		if (!t) {
			return fail(404, { error: 'Tag not found' });
		}

		// Check not already assigned
		const existing = await db.query.testCaseTag.findFirst({
			where: and(eq(testCaseTag.testCaseId, testCaseId), eq(testCaseTag.tagId, tagId))
		});

		if (!existing) {
			await db.insert(testCaseTag).values({ testCaseId, tagId });
		}

		return { tagAssigned: true };
	},

	removeTag: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertTestCaseActionFormBodySize(request);

		const formData = await request.formData();
		const tagId = parsePositiveFormId(formData.get('tagId'));

		if (!tagId) {
			return fail(400, { error: 'Invalid tagId' });
		}

		await requireActionTestCase(testCaseId, projectId);

		const existingTag = await db.query.tag.findFirst({
			where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
		});

		if (!existingTag) {
			return fail(404, { error: 'Tag not found' });
		}

		await db
			.delete(testCaseTag)
			.where(and(eq(testCaseTag.testCaseId, testCaseId), eq(testCaseTag.tagId, tagId)));

		return { tagRemoved: true };
	},

	assignAssignee: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertTestCaseActionFormBodySize(request);

		const formData = await request.formData();
		const userId = parseUserId(formData.get('userId'));

		if (!userId) {
			return fail(400, { error: 'Missing userId' });
		}

		await requireActionTestCase(testCaseId, projectId);

		// Verify user is a project member
		const member = await db.query.projectMember.findFirst({
			where: and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId))
		});

		if (!member) {
			return fail(404, { error: 'User is not a project member' });
		}

		// Check not already assigned
		const existing = await db.query.testCaseAssignee.findFirst({
			where: and(eq(testCaseAssignee.testCaseId, testCaseId), eq(testCaseAssignee.userId, userId))
		});

		if (!existing) {
			await db.insert(testCaseAssignee).values({ testCaseId, userId });
		}

		return { assigneeAssigned: true };
	},

	removeAssignee: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertTestCaseActionFormBodySize(request);

		const formData = await request.formData();
		const userId = parseUserId(formData.get('userId'));

		if (!userId) {
			return fail(400, { error: 'Missing userId' });
		}

		await requireActionTestCase(testCaseId, projectId);

		await db
			.delete(testCaseAssignee)
			.where(and(eq(testCaseAssignee.testCaseId, testCaseId), eq(testCaseAssignee.userId, userId)));

		return { assigneeRemoved: true };
	},

	delete: async ({ locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN']);

		const tc = await db.query.testCase.findFirst({
			where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
		});

		if (!tc) {
			error(404, 'Test case not found');
		}

		await db
			.delete(testCase)
			.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)));

		return { deleted: true };
	}
};
