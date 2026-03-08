import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { updateTestCaseSchema, type UpdateTestCaseInput } from '$lib/schemas/test-case.schema';
import { db, findTestCaseWithLatestVersion } from '$lib/server/db';
import { testCase, testCaseVersion, user, tag, testCaseTag, testCaseAssignee, projectMember, customField, issueLink, issueTrackerConfig } from '$lib/server/db/schema';
import { createTagSchema } from '$lib/schemas/tag.schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';
import { loadTestCaseMetadata } from '$lib/server/queries';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	await parent();
	const authUser = requireAuth(locals);
	const testCaseId = Number(params.testCaseId);

	if (isNaN(testCaseId)) {
		error(400, 'Invalid test case ID');
	}

	// Get test case with latest version
	const tc = await findTestCaseWithLatestVersion(testCaseId, Number(params.projectId));

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
			steps: (latest?.steps ?? []).map((s: { action: string; expected: string }) => ({ action: s.action, expected: s.expected })),
			expectedResult: latest?.expectedResult ?? '',
			priority: latest?.priority ?? 'MEDIUM',
			revision: latest?.revision ?? 1,
			automationKey: tc.automationKey ?? '',
			customFields: (latest?.customFields as Record<string, unknown>) ?? {}
		},
		// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
		zod(updateTestCaseSchema)
	);

	const projectId = Number(params.projectId);

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

	return {
		testCaseDetail: {
			id: tc.id,
			key: tc.key,
			automationKey: tc.automationKey ?? null,
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
		hasIssueTracker: !!trackerConfig
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const testCaseId = Number(params.testCaseId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
		const form = await superValidate(request, zod(updateTestCaseSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { title, precondition, steps, expectedResult, priority, revision, automationKey, customFields: customFieldValues } =
			form.data as UpdateTestCaseInput;

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
					where: and(
						eq(testCase.projectId, projectId),
						eq(testCase.automationKey, trimmedAk)
					)
				});
				if (existingAk && existingAk.id !== testCaseId) {
					return message(form, 'Automation key already exists in this project', { status: 409 });
				}
			}
			await db
				.update(testCase)
				.set({ automationKey: trimmedAk })
				.where(eq(testCase.id, testCaseId));
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
					expectedResult: expectedResult || null,
					priority,
					customFields: customFieldValues && Object.keys(customFieldValues).length > 0 ? customFieldValues : null,
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

	createTag: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const testCaseId = Number(params.testCaseId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const name = (formData.get('name') as string)?.trim();
		const color = formData.get('color') as string;

		const parsed = createTagSchema.safeParse({ name, color });
		if (!parsed.success) {
			return fail(400, { error: 'Invalid tag data' });
		}

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

		// Create new tag and assign
		const [newTag] = await db
			.insert(tag)
			.values({
				projectId,
				name: parsed.data.name,
				color: parsed.data.color,
				createdBy: authUser.id
			})
			.returning();

		await db.insert(testCaseTag).values({ testCaseId, tagId: newTag.id });

		return { tagCreatedAndAssigned: true };
	},

	assignTag: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const testCaseId = Number(params.testCaseId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const tagId = Number(formData.get('tagId'));

		if (!tagId) {
			return fail(400, { error: 'Missing tagId' });
		}

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
		const projectId = Number(params.projectId);
		const testCaseId = Number(params.testCaseId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const tagId = Number(formData.get('tagId'));

		if (!tagId) {
			return fail(400, { error: 'Missing tagId' });
		}

		await db
			.delete(testCaseTag)
			.where(and(eq(testCaseTag.testCaseId, testCaseId), eq(testCaseTag.tagId, tagId)));

		return { tagRemoved: true };
	},

	assignAssignee: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const testCaseId = Number(params.testCaseId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const userId = formData.get('userId') as string;

		if (!userId) {
			return fail(400, { error: 'Missing userId' });
		}

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
		const projectId = Number(params.projectId);
		const testCaseId = Number(params.testCaseId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const userId = formData.get('userId') as string;

		if (!userId) {
			return fail(400, { error: 'Missing userId' });
		}

		await db
			.delete(testCaseAssignee)
			.where(and(eq(testCaseAssignee.testCaseId, testCaseId), eq(testCaseAssignee.userId, userId)));

		return { assigneeRemoved: true };
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
