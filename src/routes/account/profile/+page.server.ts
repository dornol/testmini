import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider, oidcAccount, userPreference } from '$lib/server/db/schema';
import { account, user } from '$lib/server/db/auth.schema';
import { eq, and, asc, count } from 'drizzle-orm';
import { requireAuth } from '$lib/server/auth-utils';
import { auth } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	const authUser = requireAuth(locals);

	// Get user details
	const [userData] = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			createdAt: user.createdAt
		})
		.from(user)
		.where(eq(user.id, authUser.id));

	// Check if user has a password-based account
	const [passwordAccount] = await db
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, authUser.id), eq(account.providerId, 'credential')));

	const hasPassword = !!passwordAccount;

	// Get linked OIDC accounts
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
		.where(eq(oidcAccount.userId, authUser.id));

	// Get available providers
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

	let pref: {
		locale: string | null;
		theme: string | null;
		notificationSettings: { enableInApp?: boolean; mutedTypes?: string[] } | null;
	} | undefined;
	try {
		pref = await db.query.userPreference.findFirst({
			where: eq(userPreference.userId, authUser.id)
		});
	} catch {
		// table may not exist yet
	}

	return {
		userData,
		hasPassword,
		linkedAccounts,
		availableProviders,
		preferences: pref ?? { locale: null, theme: null, notificationSettings: null }
	};
};

export const actions: Actions = {
	updateName: async ({ request, locals }) => {
		const authUser = requireAuth(locals);

		const formData = await request.formData();
		const name = (formData.get('name') as string)?.trim();

		if (!name || name.length < 1 || name.length > 100) {
			return fail(400, { error: 'Name is required (1-100 characters)' });
		}

		await db.update(user).set({ name }).where(eq(user.id, authUser.id));

		return { nameSuccess: true };
	},

	changePassword: async ({ request, locals }) => {
		const authUser = requireAuth(locals);

		const formData = await request.formData();
		const currentPassword = formData.get('currentPassword') as string;
		const newPassword = formData.get('newPassword') as string;
		const confirmPassword = formData.get('confirmPassword') as string;

		if (!currentPassword || !newPassword) {
			return fail(400, { passwordError: 'All fields are required' });
		}

		if (newPassword !== confirmPassword) {
			return fail(400, { passwordError: 'password_mismatch' });
		}

		if (newPassword.length < 8) {
			return fail(400, { passwordError: 'Password must be at least 8 characters' });
		}

		try {
			await auth.api.changePassword({
				headers: request.headers,
				body: {
					currentPassword,
					newPassword
				}
			});
		} catch {
			return fail(400, { passwordError: 'password_wrong' });
		}

		return { passwordSuccess: true };
	},

	unlink: async ({ request, locals }) => {
		const authUser = requireAuth(locals);

		const formData = await request.formData();
		const accountId = Number(formData.get('accountId'));
		if (!accountId) return fail(400, { error: 'Invalid account ID' });

		// Verify ownership
		const [oidcAcc] = await db
			.select({ id: oidcAccount.id })
			.from(oidcAccount)
			.where(and(eq(oidcAccount.id, accountId), eq(oidcAccount.userId, authUser.id)));

		if (!oidcAcc) return fail(404, { error: 'Account not found' });

		// Ensure user has at least one other auth method
		const [oidcCount] = await db
			.select({ count: count() })
			.from(oidcAccount)
			.where(eq(oidcAccount.userId, authUser.id));

		const [passwordAccount] = await db
			.select({ id: account.id })
			.from(account)
			.where(and(eq(account.userId, authUser.id), eq(account.providerId, 'credential')));

		if (oidcCount.count <= 1 && !passwordAccount) {
			return fail(400, { error: 'Cannot unlink the last authentication method' });
		}

		await db.delete(oidcAccount).where(eq(oidcAccount.id, accountId));

		return { unlinkSuccess: true };
	}
};
