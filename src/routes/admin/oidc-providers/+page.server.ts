import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider, oidcAccount } from '$lib/server/db/schema';
import { eq, count, asc } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';

export const load: PageServerLoad = async () => {
	const providers = await db
		.select({
			id: oidcProvider.id,
			name: oidcProvider.name,
			slug: oidcProvider.slug,
			providerType: oidcProvider.providerType,
			enabled: oidcProvider.enabled,
			displayOrder: oidcProvider.displayOrder,
			createdAt: oidcProvider.createdAt,
			accountCount: count(oidcAccount.id)
		})
		.from(oidcProvider)
		.leftJoin(oidcAccount, eq(oidcAccount.providerId, oidcProvider.id))
		.groupBy(oidcProvider.id)
		.orderBy(asc(oidcProvider.displayOrder), asc(oidcProvider.name));

	return { providers };
};

export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const providerId = Number(formData.get('providerId'));
		if (!providerId) return fail(400, { error: 'Invalid provider ID' });

		const [provider] = await db
			.select({ enabled: oidcProvider.enabled })
			.from(oidcProvider)
			.where(eq(oidcProvider.id, providerId));

		if (!provider) return fail(404, { error: 'Provider not found' });

		await db
			.update(oidcProvider)
			.set({ enabled: !provider.enabled })
			.where(eq(oidcProvider.id, providerId));

		return { success: true, enabled: !provider.enabled };
	},

	deleteProvider: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const providerId = Number(formData.get('providerId'));
		if (!providerId) return fail(400, { error: 'Invalid provider ID' });

		const [accountCount] = await db
			.select({ count: count() })
			.from(oidcAccount)
			.where(eq(oidcAccount.providerId, providerId));

		if (accountCount.count > 0) {
			await db
				.update(oidcProvider)
				.set({ enabled: false })
				.where(eq(oidcProvider.id, providerId));
			return { success: true, disabled: true };
		}

		await db.delete(oidcProvider).where(eq(oidcProvider.id, providerId));
		return { success: true, deleted: true };
	}
};
