import type { PageServerLoad, Actions } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider, oidcAccount } from '$lib/server/db/schema';
import { eq, and, ne, count } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin, parseId } from '$lib/server/auth-utils';
import { encrypt } from '$lib/server/crypto';
import {
	validateOidcProviderFields,
	validateOidcProviderUrls
} from '$lib/server/oidc-provider-validation';
import { assertContentLengthUnderLimit } from '$lib/server/request-size';

const MAX_OIDC_PROVIDER_FORM_BODY_SIZE = 16 * 1024;

function parseDisplayOrder(value: FormDataEntryValue | null): number {
	if (value === null || value === '') return 0;
	if (typeof value !== 'string') return 0;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;
	return parsed;
}

function parseTrimmedText(value: FormDataEntryValue | null): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed || null;
}

export const load: PageServerLoad = async ({ params }) => {
	const providerId = parseId(params.providerId, 'provider ID');

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

		const providerId = parseId(params.providerId, 'provider ID');

		assertContentLengthUnderLimit(
			request,
			MAX_OIDC_PROVIDER_FORM_BODY_SIZE,
			'OIDC provider form body is too large'
		);

		const formData = await request.formData();
		const name = parseTrimmedText(formData.get('name'));
		const slug = parseTrimmedText(formData.get('slug'));
		const providerType = parseTrimmedText(formData.get('providerType')) ?? 'OIDC';
		const clientId = parseTrimmedText(formData.get('clientId'));
		const clientSecret = parseTrimmedText(formData.get('clientSecret'));
		const issuerUrl = parseTrimmedText(formData.get('issuerUrl'));
		const jwksUri = parseTrimmedText(formData.get('jwksUri'));
		const authorizationUrl = parseTrimmedText(formData.get('authorizationUrl'));
		const tokenUrl = parseTrimmedText(formData.get('tokenUrl'));
		const userinfoUrl = parseTrimmedText(formData.get('userinfoUrl'));
		const scopes = parseTrimmedText(formData.get('scopes')) ?? 'openid profile email';
		const autoRegister = formData.get('autoRegister') === 'on';
		const iconUrl = parseTrimmedText(formData.get('iconUrl'));
		const displayOrder = parseDisplayOrder(formData.get('displayOrder'));

		const fieldValidation = await validateOidcProviderFields({
			name,
			slug,
			providerType,
			clientId,
			clientSecret,
			scopes,
			iconUrl
		});
		if (!fieldValidation.ok) {
			return fail(400, { error: fieldValidation.error });
		}

		const fields = fieldValidation.fields;

		if (!authorizationUrl || !tokenUrl) {
			return fail(400, { error: 'Missing required fields' });
		}

		const urlValidationError = await validateOidcProviderUrls({
			issuerUrl,
			jwksUri,
			authorizationUrl,
			tokenUrl,
			userinfoUrl
		});
		if (urlValidationError) {
			return fail(400, { error: urlValidationError });
		}

		const [provider] = await db
			.select({ id: oidcProvider.id })
			.from(oidcProvider)
			.where(eq(oidcProvider.id, providerId));

		if (!provider) return fail(404, { error: 'Provider not found' });

		const existing = await db
			.select({ id: oidcProvider.id })
			.from(oidcProvider)
			.where(and(eq(oidcProvider.slug, fields.slug), ne(oidcProvider.id, providerId)));

		if (existing.length > 0) {
			return fail(400, { error: 'A provider with this slug already exists' });
		}

		const updateData: Record<string, unknown> = {
			name: fields.name,
			slug: fields.slug,
			providerType: fields.providerType,
			clientId: fields.clientId,
			issuerUrl,
			jwksUri,
			authorizationUrl,
			tokenUrl,
			userinfoUrl,
			scopes: fields.scopes,
			autoRegister,
			iconUrl: fields.iconUrl,
			displayOrder
		};

		if (fields.clientSecret) {
			updateData.clientSecretEncrypted = encrypt(fields.clientSecret);
		}

		const [updated] = await db
			.update(oidcProvider)
			.set(updateData)
			.where(eq(oidcProvider.id, providerId))
			.returning();
		if (!updated) return fail(404, { error: 'Provider not found' });

		return { success: true };
	},

	deleteProvider: async ({ locals, params }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) return fail(403, { error: 'Admin access required' });

		const providerId = parseId(params.providerId, 'provider ID');

		const [provider] = await db
			.select({ id: oidcProvider.id })
			.from(oidcProvider)
			.where(eq(oidcProvider.id, providerId));

		if (!provider) return fail(404, { error: 'Provider not found' });

		const [accountCount] = await db
			.select({ count: count() })
			.from(oidcAccount)
			.where(eq(oidcAccount.providerId, providerId));

		if (accountCount.count > 0) {
			const [updated] = await db
				.update(oidcProvider)
				.set({ enabled: false })
				.where(eq(oidcProvider.id, providerId))
				.returning();
			if (!updated) return fail(404, { error: 'Provider not found' });
			return fail(400, { error: 'Provider has linked accounts. It has been disabled instead.' });
		}

		const [deleted] = await db
			.delete(oidcProvider)
			.where(eq(oidcProvider.id, providerId))
			.returning();
		if (!deleted) return fail(404, { error: 'Provider not found' });
		redirect(302, '/admin/oidc-providers');
	}
};
