import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { tag } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';
import { createTagSchema, updateTagSchema } from '$lib/schemas/tag.schema';
import { cacheDelete } from '$lib/server/cache';

export const load: PageServerLoad = async ({ params }) => {
	const projectId = Number(params.projectId);

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
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const name = (formData.get('name') as string)?.trim();
		const color = formData.get('color') as string;

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

		await db.insert(tag).values({
			projectId,
			name: parsed.data.name,
			color: parsed.data.color,
			createdBy: authUser.id
		});

		cacheDelete(`project:${projectId}:tags`);
		return { created: true };
	},

	update: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const tagId = Number(formData.get('tagId'));
		const name = (formData.get('name') as string)?.trim();
		const color = formData.get('color') as string;

		const parsed = updateTagSchema.safeParse({ tagId, name, color });
		if (!parsed.success) {
			return fail(400, { errors: parsed.error.flatten().fieldErrors });
		}

		const existing = await db.query.tag.findFirst({
			where: eq(tag.id, tagId)
		});

		if (!existing || existing.projectId !== projectId) {
			return fail(404, { error: 'Tag not found' });
		}

		// Check duplicate name (excluding current tag)
		const duplicate = await db.query.tag.findFirst({
			where: and(eq(tag.projectId, projectId), eq(tag.name, parsed.data.name))
		});

		if (duplicate && duplicate.id !== tagId) {
			return fail(400, { duplicate: true });
		}

		await db
			.update(tag)
			.set({ name: parsed.data.name, color: parsed.data.color })
			.where(eq(tag.id, tagId));

		cacheDelete(`project:${projectId}:tags`);
		return { updated: true };
	},

	delete: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const tagId = Number(formData.get('tagId'));

		if (!tagId) {
			return fail(400, { error: 'Missing tagId' });
		}

		const existing = await db.query.tag.findFirst({
			where: eq(tag.id, tagId)
		});

		if (!existing || existing.projectId !== projectId) {
			return fail(404, { error: 'Tag not found' });
		}

		await db.delete(tag).where(eq(tag.id, tagId));

		cacheDelete(`project:${projectId}:tags`);
		return { deleted: true };
	}
};
