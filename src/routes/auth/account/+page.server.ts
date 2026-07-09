import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider, oidcAccount } from '$lib/server/db/schema';
import { account } from '$lib/server/db/auth.schema';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth } from '$lib/server/auth-utils';
import { parsePositiveFormId } from '$lib/server/form-utils';
import { unlinkOidcAccount } from '$lib/server/oidc-account-links';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	// Get linked OIDC accounts with provider info
	const linkedAccounts = await db
		.select({
			id: oidcAccount.id,
			externalId: oidcAccount.externalId,
			email: oidcAccount.email,
			name: oidcAccount.name,
			providerName: oidcProvider.name,
			providerSlug: oidcProvider.slug,
			providerIconUrl: oidcProvider.iconUrl
		})
		.from(oidcAccount)
		.innerJoin(oidcProvider, eq(oidcProvider.id, oidcAccount.providerId))
		.where(eq(oidcAccount.userId, user.id));

	// Get active providers that user hasn't linked yet
	const linkedProviderIds = linkedAccounts.map((a) => a.id);
	const allActiveProviders = await db
		.select({
			id: oidcProvider.id,
			name: oidcProvider.name,
			slug: oidcProvider.slug,
			iconUrl: oidcProvider.iconUrl
		})
		.from(oidcProvider)
		.where(eq(oidcProvider.enabled, true))
		.orderBy(asc(oidcProvider.displayOrder));

	const linkedProviderSlugs = new Set(linkedAccounts.map((a) => a.providerSlug));
	const availableProviders = allActiveProviders.filter((p) => !linkedProviderSlugs.has(p.slug));

	// Check if user has a password-based account
	const [passwordAccount] = await db
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, user.id), eq(account.providerId, 'credential')));

	const hasPassword = !!passwordAccount;

	return { linkedAccounts, availableProviders, hasPassword };
};

export const actions: Actions = {
	unlink: async ({ request, locals }) => {
		const user = requireAuth(locals);

		const formData = await request.formData();
		const accountId = parsePositiveFormId(formData.get('accountId'));
		if (!accountId) return fail(400, { error: 'Invalid account ID' });

		const result = await unlinkOidcAccount(user.id, accountId);
		if (!result.ok) return fail(result.status, { error: result.error });

		return { success: true };
	}
};
