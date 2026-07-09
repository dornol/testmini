import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { tag, testCaseTag } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseId } from '$lib/server/auth-utils';
import { createTagSchema, updateTagSchema } from '$lib/schemas/tag.schema';
import { cacheDelete } from '$lib/server/cache';
import {
	parseOptionalFormString,
	parseOptionalTrimmedFormString,
	parsePositiveFormId
} from '$lib/server/form-utils';
import { assertContentLengthUnderLimit } from '$lib/server/request-size';

const MAX_TAG_FORM_BODY_SIZE = 16 * 1024;

function assertTagFormBodySize(request: Request): void {
	assertContentLengthUnderLimit(request, MAX_TAG_FORM_BODY_SIZE, 'Tag form body is too large');
}

export const load: PageServerLoad = async ({ params }) => {
	const projectId = parseId(params.projectId, 'project ID');

	const tags = await db
		.select({
			id: tag.id,
			name: tag.name,
			color: tag.color,
			createdAt: tag.createdAt
		})
		.from(tag)
		.where(eq(tag.projectId, projectId))
		.orderBy(tag.name);

	return { tags };
};

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertTagFormBodySize(request);

		const formData = await request.formData();
		const name = parseOptionalTrimmedFormString(formData.get('name'));
		const color = parseOptionalFormString(formData.get('color'));

		const parsed = createTagSchema.safeParse({ name, color });
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { errors, name, color });
		}

		// Check duplicate
		const existing = await db.query.tag.findFirst({
			where: and(eq(tag.projectId, projectId), eq(tag.name, parsed.data.name))
		});

		if (existing) {
			return fail(400, { duplicate: true, name, color });
		}

		const [created] = await db
			.insert(tag)
			.values({
				projectId,
				name: parsed.data.name,
				color: parsed.data.color,
				createdBy: authUser.id
			})
			.returning();
		if (!created) {
			return fail(500, { error: 'Failed to create tag' });
		}

		cacheDelete(`project:${projectId}:tags`);
		return { created: true };
	},

	update: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertTagFormBodySize(request);

		const formData = await request.formData();
		const tagId = parsePositiveFormId(formData.get('tagId'));
		const name = parseOptionalTrimmedFormString(formData.get('name'));
		const color = parseOptionalFormString(formData.get('color'));

		const parsed = updateTagSchema.safeParse({ tagId, name, color });
		if (!parsed.success) {
			return fail(400, { errors: parsed.error.flatten().fieldErrors });
		}

		const existing = await db.query.tag.findFirst({
			where: eq(tag.id, parsed.data.tagId)
		});

		if (!existing || existing.projectId !== projectId) {
			return fail(404, { error: 'Tag not found' });
		}

		// Check duplicate name (excluding current tag)
		const duplicate = await db.query.tag.findFirst({
			where: and(eq(tag.projectId, projectId), eq(tag.name, parsed.data.name))
		});

		if (duplicate && duplicate.id !== parsed.data.tagId) {
			return fail(400, { duplicate: true });
		}

		const [updated] = await db
			.update(tag)
			.set({ name: parsed.data.name, color: parsed.data.color })
			.where(and(eq(tag.id, parsed.data.tagId), eq(tag.projectId, projectId)))
			.returning();
		if (!updated) {
			return fail(404, { error: 'Tag not found' });
		}

		cacheDelete(`project:${projectId}:tags`);
		return { updated: true };
	},

	delete: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
		assertTagFormBodySize(request);

		const formData = await request.formData();
		const tagId = parsePositiveFormId(formData.get('tagId'));

		if (!tagId) {
			return fail(400, { error: 'Invalid tagId' });
		}

		const existing = await db.query.tag.findFirst({
			where: eq(tag.id, tagId)
		});

		if (!existing || existing.projectId !== projectId) {
			return fail(404, { error: 'Tag not found' });
		}

		const deleted = await db.transaction(async (tx) => {
			await tx.delete(testCaseTag).where(eq(testCaseTag.tagId, tagId));
			const [deletedTag] = await tx
				.delete(tag)
				.where(and(eq(tag.id, tagId), eq(tag.projectId, projectId)))
				.returning();
			return deletedTag;
		});
		if (!deleted) {
			return fail(404, { error: 'Tag not found' });
		}

		cacheDelete(`project:${projectId}:tags`);
		return { deleted: true };
	}
};
