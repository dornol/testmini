import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { priorityConfig } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';
import { createPrioritySchema, updatePrioritySchema } from '$lib/schemas/priority.schema';

export const load: PageServerLoad = async ({ params }) => {
	const projectId = Number(params.projectId);

	const priorities = await db
		.select({
			id: priorityConfig.id,
			name: priorityConfig.name,
			color: priorityConfig.color,
			position: priorityConfig.position,
			isDefault: priorityConfig.isDefault,
			createdAt: priorityConfig.createdAt
		})
		.from(priorityConfig)
		.where(eq(priorityConfig.projectId, projectId))
		.orderBy(asc(priorityConfig.position));

	return { priorities };
};

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const name = (formData.get('name') as string)?.trim();
		const color = formData.get('color') as string;
		const isDefault = formData.get('isDefault') === 'true';

		const parsed = createPrioritySchema.safeParse({ name, color, isDefault });
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { errors, name, color });
		}

		// Check duplicate
		const existing = await db.query.priorityConfig.findFirst({
			where: and(eq(priorityConfig.projectId, projectId), eq(priorityConfig.name, parsed.data.name))
		});

		if (existing) {
			return fail(400, { duplicate: true, name, color });
		}

		// Get max position
		const all = await db
			.select({ position: priorityConfig.position })
			.from(priorityConfig)
			.where(eq(priorityConfig.projectId, projectId))
			.orderBy(asc(priorityConfig.position));
		const maxPos = all.length > 0 ? Math.max(...all.map((p) => p.position)) : -1;

		await db.transaction(async (tx) => {
			// If this is set as default, unset other defaults
			if (parsed.data.isDefault) {
				await tx
					.update(priorityConfig)
					.set({ isDefault: false })
					.where(eq(priorityConfig.projectId, projectId));
			}

			await tx.insert(priorityConfig).values({
				projectId,
				name: parsed.data.name,
				color: parsed.data.color,
				position: maxPos + 1,
				isDefault: parsed.data.isDefault,
				createdBy: authUser.id
			});
		});

		return { created: true };
	},

	update: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const priorityId = Number(formData.get('priorityId'));
		const name = (formData.get('name') as string)?.trim();
		const color = formData.get('color') as string;
		const isDefault = formData.get('isDefault') === 'true';

		const parsed = updatePrioritySchema.safeParse({ priorityId, name, color, isDefault });
		if (!parsed.success) {
			return fail(400, { errors: parsed.error.flatten().fieldErrors });
		}

		const existing = await db.query.priorityConfig.findFirst({
			where: eq(priorityConfig.id, priorityId)
		});

		if (!existing || existing.projectId !== projectId) {
			return fail(404, { error: 'Priority not found' });
		}

		// Check duplicate name (excluding current)
		const duplicate = await db.query.priorityConfig.findFirst({
			where: and(eq(priorityConfig.projectId, projectId), eq(priorityConfig.name, parsed.data.name))
		});

		if (duplicate && duplicate.id !== priorityId) {
			return fail(400, { duplicate: true });
		}

		await db.transaction(async (tx) => {
			// If setting as default, unset others
			if (parsed.data.isDefault) {
				await tx
					.update(priorityConfig)
					.set({ isDefault: false })
					.where(eq(priorityConfig.projectId, projectId));
			}

			// If name changed, update all test case versions using the old name
			if (existing.name !== parsed.data.name) {
				await tx.execute(
					// raw SQL to update priority text in test_case_version
					// safe because we validated the new name
					`UPDATE test_case_version SET priority = '${parsed.data.name.replace(/'/g, "''")}' WHERE test_case_id IN (SELECT id FROM test_case WHERE project_id = ${projectId}) AND priority = '${existing.name.replace(/'/g, "''")}'`
				);
				await tx.execute(
					`UPDATE test_case_template SET priority = '${parsed.data.name.replace(/'/g, "''")}' WHERE project_id = ${projectId} AND priority = '${existing.name.replace(/'/g, "''")}'`
				);
			}

			await tx
				.update(priorityConfig)
				.set({
					name: parsed.data.name,
					color: parsed.data.color,
					isDefault: parsed.data.isDefault
				})
				.where(eq(priorityConfig.id, priorityId));
		});

		return { updated: true };
	},

	delete: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const priorityId = Number(formData.get('priorityId'));

		if (!priorityId) {
			return fail(400, { error: 'Missing priorityId' });
		}

		const existing = await db.query.priorityConfig.findFirst({
			where: eq(priorityConfig.id, priorityId)
		});

		if (!existing || existing.projectId !== projectId) {
			return fail(404, { error: 'Priority not found' });
		}

		await db.delete(priorityConfig).where(eq(priorityConfig.id, priorityId));

		return { deleted: true };
	},

	reorder: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const orderJson = formData.get('order') as string;
		let order: number[];
		try {
			order = JSON.parse(orderJson);
		} catch {
			return fail(400, { error: 'Invalid order data' });
		}

		await db.transaction(async (tx) => {
			for (let i = 0; i < order.length; i++) {
				await tx
					.update(priorityConfig)
					.set({ position: i })
					.where(and(eq(priorityConfig.id, order[i]), eq(priorityConfig.projectId, projectId)));
			}
		});

		return { reordered: true };
	}
};
