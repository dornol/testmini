import type { PageServerLoad, Actions } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider, oidcAccount } from '$lib/server/db/schema';
import { eq, and, ne, count } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { encrypt } from '$lib/server/crypto';

export const load: PageServerLoad = async ({ params }) => {
	const providerId = Number(params.providerId);
	if (isNaN(providerId)) error(400, 'Invalid provider ID');

	const [provider] = await db
		.select({
			id: oidcProvider.id,
			name: oidcProvider.name,
			slug: oidcProvider.slug,
			providerType: oidcProvider.providerType,
			clientId: oidcProvider.clientId,
			issuerUrl: oidcProvider.issuerUrl,
			jwksUri: oidcProvider.jwksUri,
			authorizationUrl: oidcProvider.authorizationUrl,
			tokenUrl: oidcProvider.tokenUrl,
			userinfoUrl: oidcProvider.userinfoUrl,
			scopes: oidcProvider.scopes,
			enabled: oidcProvider.enabled,
			autoRegister: oidcProvider.autoRegister,
			iconUrl: oidcProvider.iconUrl,
			displayOrder: oidcProvider.displayOrder
		})
		.from(oidcProvider)
		.where(eq(oidcProvider.id, providerId));

	if (!provider) error(404, 'Provider not found');

	const [accountCount] = await db
		.select({ count: count() })
		.from(oidcAccount)
		.where(eq(oidcAccount.providerId, providerId));

	return { provider, accountCount: accountCount.count };
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) return fail(403, { error: 'Admin access required' });

		const providerId = Number(params.providerId);
		if (isNaN(providerId)) return fail(400, { error: 'Invalid provider ID' });

		const formData = await request.formData();
		const name = (formData.get('name') as string)?.trim();
		const slug = (formData.get('slug') as string)?.trim();
		const providerType = (formData.get('providerType') as string) || 'OIDC';
		const clientId = (formData.get('clientId') as string)?.trim();
		const clientSecret = (formData.get('clientSecret') as string)?.trim();
		const issuerUrl = (formData.get('issuerUrl') as string)?.trim() || null;
		const jwksUri = (formData.get('jwksUri') as string)?.trim() || null;
		const authorizationUrl = (formData.get('authorizationUrl') as string)?.trim();
		const tokenUrl = (formData.get('tokenUrl') as string)?.trim();
		const userinfoUrl = (formData.get('userinfoUrl') as string)?.trim() || null;
		const scopes = (formData.get('scopes') as string)?.trim() || 'openid profile email';
		const autoRegister = formData.get('autoRegister') === 'on';
		const iconUrl = (formData.get('iconUrl') as string)?.trim() || null;
		const displayOrder = Number(formData.get('displayOrder')) || 0;

		if (!name || !slug || !clientId || !authorizationUrl || !tokenUrl) {
			return fail(400, { error: 'Missing required fields' });
		}

		if (!/^[a-z0-9-]+$/.test(slug)) {
			return fail(400, { error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
		}

		const existing = await db
			.select({ id: oidcProvider.id })
			.from(oidcProvider)
			.where(and(eq(oidcProvider.slug, slug), ne(oidcProvider.id, providerId)));

		if (existing.length > 0) {
			return fail(400, { error: 'A provider with this slug already exists' });
		}

		const updateData: Record<string, unknown> = {
			name,
			slug,
			providerType,
			clientId,
			issuerUrl,
			jwksUri,
			authorizationUrl,
			tokenUrl,
			userinfoUrl,
			scopes,
			autoRegister,
			iconUrl,
			displayOrder
		};

		if (clientSecret) {
			updateData.clientSecretEncrypted = encrypt(clientSecret);
		}

		await db.update(oidcProvider).set(updateData).where(eq(oidcProvider.id, providerId));

		return { success: true };
	},

	deleteProvider: async ({ locals, params }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) return fail(403, { error: 'Admin access required' });

		const providerId = Number(params.providerId);
		if (isNaN(providerId)) return fail(400, { error: 'Invalid provider ID' });

		const [accountCount] = await db
			.select({ count: count() })
			.from(oidcAccount)
			.where(eq(oidcAccount.providerId, providerId));

		if (accountCount.count > 0) {
			await db
				.update(oidcProvider)
				.set({ enabled: false })
				.where(eq(oidcProvider.id, providerId));
			return fail(400, { error: 'Provider has linked accounts. It has been disabled instead.' });
		}

		await db.delete(oidcProvider).where(eq(oidcProvider.id, providerId));
		redirect(302, '/admin/oidc-providers');
	}
};
