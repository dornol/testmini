import { json, error } from '@sveltejs/kit';
import { db, findTestCaseWithLatestVersion } from '$lib/server/db';
import { testCase, testCaseVersion, user, customField } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { loadTestCaseMetadata, requireTestCase } from '$lib/server/queries';
import { badRequest, conflict } from '$lib/server/errors';
import {
	validateTestCasePatchPayload,
	validateTestCasePutPayload
} from '$lib/server/test-case-update-validation';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');

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

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, user, projectId }) => {
		const testCaseId = parseId(params.testCaseId, 'test case ID');

		const body = await parseJsonBody(request);
		const payload = validateTestCasePatchPayload(body);
		if (payload instanceof Response) return payload;
		const { key, title, priority, automationKey, customFields } = payload;

		const tc = await findTestCaseWithLatestVersion(testCaseId, projectId);

		if (!tc) {
			error(404, 'Test case not found');
		}

		// Key update: direct update on testCase table
		if (key !== undefined) {
			// Check uniqueness within project
			const existing = await db.query.testCase.findFirst({
				where: and(eq(testCase.projectId, projectId), eq(testCase.key, key))
			});
			if (existing && existing.id !== testCaseId) {
				return conflict('Key already exists in this project');
			}
			const [updatedTestCase] = await db
				.update(testCase)
				.set({ key })
				.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)))
				.returning({ id: testCase.id });
			if (!updatedTestCase) {
				error(404, 'Test case not found');
			}
		}

		// Automation key update
		if (automationKey !== undefined) {
			if (automationKey) {
				const existingAk = await db.query.testCase.findFirst({
					where: and(eq(testCase.projectId, projectId), eq(testCase.automationKey, automationKey))
				});
				if (existingAk && existingAk.id !== testCaseId) {
					return conflict('Automation key already exists in this project');
				}
			}
			const [updatedTestCase] = await db
				.update(testCase)
				.set({ automationKey })
				.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)))
				.returning({ id: testCase.id });
			if (!updatedTestCase) {
				error(404, 'Test case not found');
			}
		}

		// Title, priority, or customFields update: create a new version to preserve history
		if (title !== undefined || priority !== undefined || customFields !== undefined) {
			if (!tc.latestVersion) {
				error(500, 'No latest version found');
			}
			const latest = tc.latestVersion;
			const nextVersionNo = latest.versionNo + 1;
			const nextRevision = latest.revision + 1;

			// Merge custom fields: apply partial update over existing values
			let mergedCustomFields = (latest.customFields as Record<string, unknown>) ?? {};
			if (customFields !== undefined) {
				// Validate custom field names against project-defined fields (prevent mass assignment)
				const definedFields = await db
					.select({ name: customField.name })
					.from(customField)
					.where(eq(customField.projectId, projectId));
				const allowedFieldNames = new Set(definedFields.map((f) => f.name));

				const invalidKeys = Object.keys(customFields).filter((k) => !allowedFieldNames.has(k));
				if (invalidKeys.length > 0) {
					return badRequest(`Unknown custom field(s): ${invalidKeys.join(', ')}`);
				}

				mergedCustomFields = { ...mergedCustomFields, ...customFields };
				// Remove null entries
				for (const [k, v] of Object.entries(mergedCustomFields)) {
					if (v === null || v === undefined) delete mergedCustomFields[k];
				}
			}

			const [version] = await db
				.insert(testCaseVersion)
				.values({
					testCaseId,
					versionNo: nextVersionNo,
					title: title ?? latest.title,
					precondition: latest.precondition,
					steps: latest.steps,
					stepFormat: latest.stepFormat ?? 'STEPS',
					expectedResult: latest.expectedResult,
					priority: priority ?? latest.priority,
					customFields: Object.keys(mergedCustomFields).length > 0 ? mergedCustomFields : null,
					revision: nextRevision,
					updatedBy: user.id
				})
				.returning();

			const [updatedTestCase] = await db
				.update(testCase)
				.set({ latestVersionId: version.id })
				.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)))
				.returning({ id: testCase.id });
			if (!updatedTestCase) {
				error(404, 'Test case not found');
			}
		}

		return json({ success: true });
	}
);

export const PUT = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, user, projectId }) => {
		const testCaseId = parseId(params.testCaseId, 'test case ID');

		const body = await parseJsonBody(request);
		const payload = validateTestCasePutPayload(body);
		if (payload instanceof Response) return payload;
		const { title, precondition, steps, expectedResult, priority, revision, stepFormat } = payload;

		const tc = await findTestCaseWithLatestVersion(testCaseId, projectId);

		if (!tc) {
			error(404, 'Test case not found');
		}

		if (tc.latestVersion && tc.latestVersion.revision !== revision) {
			return conflict(
				'This test case has been modified by another user. Please refresh and try again.'
			);
		}

		const nextVersionNo = tc.latestVersion ? tc.latestVersion.versionNo + 1 : 1;
		const nextRevision = (tc.latestVersion?.revision ?? 0) + 1;

		await db.transaction(async (tx) => {
			const [version] = await tx
				.insert(testCaseVersion)
				.values({
					testCaseId,
					versionNo: nextVersionNo,
					title,
					precondition,
					steps,
					stepFormat: stepFormat ?? tc.latestVersion?.stepFormat ?? 'STEPS',
					expectedResult,
					priority,
					revision: nextRevision,
					updatedBy: user.id
				})
				.returning();

			const [updatedTestCase] = await tx
				.update(testCase)
				.set({ latestVersionId: version.id })
				.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)))
				.returning({ id: testCase.id });
			if (!updatedTestCase) {
				error(404, 'Test case not found');
			}
		});

		return json({ success: true });
	}
);

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');
	await requireTestCase(testCaseId, projectId);

	const [deleted] = await db
		.delete(testCase)
		.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)))
		.returning({ id: testCase.id });
	if (!deleted) {
		error(404, 'Test case not found');
	}

	return json({ success: true });
});
