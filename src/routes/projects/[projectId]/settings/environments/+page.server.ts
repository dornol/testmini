import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { environmentConfig, testRun } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';
import { createEnvironmentSchema, updateEnvironmentSchema } from '$lib/schemas/environment.schema';

export const load: PageServerLoad = async ({ params }) => {
	const projectId = Number(params.projectId);

	const environments = await db
		.select({
			id: environmentConfig.id,
			name: environmentConfig.name,
			color: environmentConfig.color,
			position: environmentConfig.position,
			isDefault: environmentConfig.isDefault,
			createdAt: environmentConfig.createdAt
		})
		.from(environmentConfig)
		.where(eq(environmentConfig.projectId, projectId))
		.orderBy(asc(environmentConfig.position));

	return { environments };
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

		const parsed = createEnvironmentSchema.safeParse({ name, color, isDefault });
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { errors, name, color });
		}

		const existing = await db.query.environmentConfig.findFirst({
			where: and(eq(environmentConfig.projectId, projectId), eq(environmentConfig.name, parsed.data.name))
		});

		if (existing) {
			return fail(400, { duplicate: true, name, color });
		}

		const all = await db
			.select({ position: environmentConfig.position })
			.from(environmentConfig)
			.where(eq(environmentConfig.projectId, projectId))
			.orderBy(asc(environmentConfig.position));
		const maxPos = all.length > 0 ? Math.max(...all.map((p) => p.position)) : -1;

		await db.transaction(async (tx) => {
			if (parsed.data.isDefault) {
				await tx
					.update(environmentConfig)
					.set({ isDefault: false })
					.where(eq(environmentConfig.projectId, projectId));
			}

			await tx.insert(environmentConfig).values({
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
		const environmentId = Number(formData.get('environmentId'));
		const name = (formData.get('name') as string)?.trim();
		const color = formData.get('color') as string;
		const isDefault = formData.get('isDefault') === 'true';

		const parsed = updateEnvironmentSchema.safeParse({ environmentId, name, color, isDefault });
		if (!parsed.success) {
			return fail(400, { errors: parsed.error.flatten().fieldErrors });
		}

		const existing = await db.query.environmentConfig.findFirst({
			where: eq(environmentConfig.id, environmentId)
		});

		if (!existing || existing.projectId !== projectId) {
			return fail(404, { error: 'Environment not found' });
		}

		const duplicate = await db.query.environmentConfig.findFirst({
			where: and(eq(environmentConfig.projectId, projectId), eq(environmentConfig.name, parsed.data.name))
		});

		if (duplicate && duplicate.id !== environmentId) {
			return fail(400, { duplicate: true });
		}

		await db.transaction(async (tx) => {
			if (parsed.data.isDefault) {
				await tx
					.update(environmentConfig)
					.set({ isDefault: false })
					.where(eq(environmentConfig.projectId, projectId));
			}

			// If name changed, update all test runs using the old name
			if (existing.name !== parsed.data.name) {
				await tx
					.update(testRun)
					.set({ environment: parsed.data.name })
					.where(and(eq(testRun.projectId, projectId), eq(testRun.environment, existing.name)));
			}

			await tx
				.update(environmentConfig)
				.set({
					name: parsed.data.name,
					color: parsed.data.color,
					isDefault: parsed.data.isDefault
				})
				.where(eq(environmentConfig.id, environmentId));
		});

		return { updated: true };
	},

	delete: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const environmentId = Number(formData.get('environmentId'));

		if (!environmentId) {
			return fail(400, { error: 'Missing environmentId' });
		}

		const existing = await db.query.environmentConfig.findFirst({
			where: eq(environmentConfig.id, environmentId)
		});

		if (!existing || existing.projectId !== projectId) {
			return fail(404, { error: 'Environment not found' });
		}

		await db.delete(environmentConfig).where(eq(environmentConfig.id, environmentId));

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
					.update(environmentConfig)
					.set({ position: i })
					.where(and(eq(environmentConfig.id, order[i]), eq(environmentConfig.projectId, projectId)));
			}
		});

		return { reordered: true };
	}
};
