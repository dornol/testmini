import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { encrypt } from '$lib/server/crypto';
import {
	validateOidcProviderFields,
	validateOidcProviderUrls
} from '$lib/server/oidc-provider-validation';

function parseDisplayOrder(value: FormDataEntryValue | null): number {
	if (value === null || value === '') return 0;
	if (typeof value !== 'string') return 0;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;
	return parsed;
}

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
		const displayOrder = parseDisplayOrder(formData.get('displayOrder'));

		const fieldValidation = await validateOidcProviderFields(
			{
				name,
				slug,
				providerType,
				clientId,
				clientSecret,
				scopes,
				iconUrl
			},
			{ requireClientSecret: true }
		);
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

		const existing = await db
			.select({ id: oidcProvider.id })
			.from(oidcProvider)
			.where(eq(oidcProvider.slug, fields.slug));

		if (existing.length > 0) {
			return fail(400, { error: 'A provider with this slug already exists' });
		}

		const clientSecretEncrypted = encrypt(fields.clientSecret!);

		try {
			await db.insert(oidcProvider).values({
				name: fields.name,
				slug: fields.slug,
				providerType: fields.providerType,
				clientId: fields.clientId,
				clientSecretEncrypted,
				issuerUrl,
				jwksUri,
				authorizationUrl,
				tokenUrl,
				userinfoUrl,
				scopes: fields.scopes,
				autoRegister,
				iconUrl: fields.iconUrl,
				displayOrder
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const cause = err instanceof Error && err.cause ? String(err.cause) : '';
			return fail(500, { error: `Failed to create OIDC provider: ${cause || message}` });
		}

		redirect(302, '/admin/oidc-providers');
	}
};
