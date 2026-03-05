import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { encrypt } from '$lib/server/crypto';

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

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

		if (!name || !slug || !clientId || !clientSecret || !authorizationUrl || !tokenUrl) {
			return fail(400, { error: 'Missing required fields' });
		}

		if (!/^[a-z0-9-]+$/.test(slug)) {
			return fail(400, { error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
		}

		const existing = await db
			.select({ id: oidcProvider.id })
			.from(oidcProvider)
			.where(eq(oidcProvider.slug, slug));

		if (existing.length > 0) {
			return fail(400, { error: 'A provider with this slug already exists' });
		}

		const clientSecretEncrypted = encrypt(clientSecret);

		await db.insert(oidcProvider).values({
			name,
			slug,
			providerType,
			clientId,
			clientSecretEncrypted,
			issuerUrl,
			jwksUri,
			authorizationUrl,
			tokenUrl,
			userinfoUrl,
			scopes,
			autoRegister,
			iconUrl,
			displayOrder
		});

		redirect(302, '/admin/oidc-providers');
	}
};
