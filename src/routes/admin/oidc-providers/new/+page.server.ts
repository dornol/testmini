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

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

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
