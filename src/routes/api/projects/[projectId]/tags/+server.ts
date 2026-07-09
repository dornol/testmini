import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { tag, testCaseTag } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { createTagSchema } from '$lib/schemas/tag.schema';
import { cacheDelete } from '$lib/server/cache';
import { badRequest, conflict } from '$lib/server/errors';
import { validatePositiveInteger, validateRequestBody } from '$lib/server/id-list-validation';
import { requireTestCase } from '$lib/server/queries';

const TAG_CREATE_FIELDS = new Set(['name', 'color', 'testCaseId']);

/** Create a new tag and optionally assign it to a test case */
export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, user, projectId }) => {
		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;
		if (Object.keys(bodyOrError).some((key) => !TAG_CREATE_FIELDS.has(key))) {
			return badRequest('Invalid tag field');
		}
		const { name, color } = bodyOrError as { name?: string; color?: string };

		const parsed = createTagSchema.safeParse({ name: name?.trim(), color });
		if (!parsed.success) {
			return badRequest(parsed.error.flatten().fieldErrors.name?.[0] ?? 'Invalid input');
		}

		let testCaseId: number | null = null;
		if (bodyOrError.testCaseId != null) {
			const testCaseIdOrError = validatePositiveInteger(bodyOrError.testCaseId, 'testCaseId');
			if (testCaseIdOrError instanceof Response) return testCaseIdOrError;
			testCaseId = testCaseIdOrError;
			await requireTestCase(testCaseId, projectId);
		}

		// Check duplicate
		const existing = await db.query.tag.findFirst({
			where: and(eq(tag.projectId, projectId), eq(tag.name, parsed.data.name))
		});

		if (existing) {
			// If tag already exists and testCaseId is provided, just assign it
			if (testCaseId != null) {
				const alreadyAssigned = await db.query.testCaseTag.findFirst({
					where: and(eq(testCaseTag.testCaseId, testCaseId), eq(testCaseTag.tagId, existing.id))
				});
				if (!alreadyAssigned) {
					const [assigned] = await db
						.insert(testCaseTag)
						.values({ testCaseId, tagId: existing.id })
						.returning();
					if (!assigned) {
						error(500, 'Failed to assign tag');
					}
				}
				return json({
					tag: { id: existing.id, name: existing.name, color: existing.color },
					assigned: true
				});
			}
			return conflict('A tag with this name already exists');
		}

		const newTag =
			testCaseId == null
				? (
						await db
							.insert(tag)
							.values({
								projectId,
								name: parsed.data.name,
								color: parsed.data.color,
								createdBy: user.id
							})
							.returning()
					)[0]
				: await db.transaction(async (tx) => {
						const [created] = await tx
							.insert(tag)
							.values({
								projectId,
								name: parsed.data.name,
								color: parsed.data.color,
								createdBy: user.id
							})
							.returning();
						if (!created) {
							error(500, 'Failed to create tag');
						}
						const [assigned] = await tx
							.insert(testCaseTag)
							.values({ testCaseId, tagId: created.id })
							.returning();
						if (!assigned) {
							error(500, 'Failed to assign tag');
						}
						return created;
					});

		if (!newTag) {
			error(500, 'Failed to create tag');
		}

		cacheDelete(`project:${projectId}:tags`);
		return json({
			tag: { id: newTag.id, name: newTag.name, color: newTag.color },
			assigned: testCaseId != null
		});
	}
);
