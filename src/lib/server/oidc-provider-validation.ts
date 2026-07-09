import { validatePublicHttpsUrl } from './url-safety';

export interface OidcProviderUrlInput {
	issuerUrl?: string | null;
	jwksUri?: string | null;
	authorizationUrl?: string | null;
	tokenUrl?: string | null;
	userinfoUrl?: string | null;
}

export interface OidcProviderFieldInput {
	name?: string | null;
	slug?: string | null;
	providerType?: string | null;
	clientId?: string | null;
	clientSecret?: string | null;
	scopes?: string | null;
	iconUrl?: string | null;
}

export interface ValidatedOidcProviderFields {
	name: string;
	slug: string;
	providerType: 'OIDC';
	clientId: string;
	clientSecret?: string;
	scopes: string;
	iconUrl: string | null;
}

export interface OidcProviderFieldValidationOptions {
	requireClientSecret?: boolean;
}

const REQUIRED_URL_FIELDS: Array<keyof OidcProviderUrlInput> = ['authorizationUrl', 'tokenUrl'];
const OPTIONAL_URL_FIELDS: Array<keyof OidcProviderUrlInput> = [
	'issuerUrl',
	'jwksUri',
	'userinfoUrl'
];
const MAX_NAME_LENGTH = 100;
const MAX_SLUG_LENGTH = 80;
const MAX_PROVIDER_TYPE_LENGTH = 20;
const MAX_CLIENT_ID_LENGTH = 500;
const MAX_CLIENT_SECRET_LENGTH = 4000;
const MAX_SCOPES_LENGTH = 500;
const MAX_ICON_URL_LENGTH = 2000;

function normalizeRequiredString(
	value: string | null | undefined,
	field: string,
	maxLength: number
): { ok: true; value: string } | { ok: false; error: string } {
	const normalized = value?.trim() ?? '';
	if (!normalized) return { ok: false, error: 'Missing required fields' };
	if (normalized.length > maxLength) {
		return { ok: false, error: `${field} must be ${maxLength} characters or less` };
	}
	return { ok: true, value: normalized };
}

export async function validateOidcProviderUrls(
	input: OidcProviderUrlInput
): Promise<string | null> {
	for (const field of REQUIRED_URL_FIELDS) {
		const value = input[field]?.trim();
		if (!value) return `${field} is required`;

		const validation = await validatePublicHttpsUrl(value);
		if (!validation.ok) return `${field}: ${validation.error ?? 'Invalid URL'}`;
	}

	for (const field of OPTIONAL_URL_FIELDS) {
		const value = input[field]?.trim();
		if (!value) continue;

		const validation = await validatePublicHttpsUrl(value);
		if (!validation.ok) return `${field}: ${validation.error ?? 'Invalid URL'}`;
	}

	return null;
}

export async function validateOidcProviderFields(
	input: OidcProviderFieldInput,
	options: OidcProviderFieldValidationOptions = {}
): Promise<{ ok: true; fields: ValidatedOidcProviderFields } | { ok: false; error: string }> {
	const name = normalizeRequiredString(input.name, 'Name', MAX_NAME_LENGTH);
	const slug = normalizeRequiredString(input.slug, 'Slug', MAX_SLUG_LENGTH);
	const clientId = normalizeRequiredString(input.clientId, 'Client ID', MAX_CLIENT_ID_LENGTH);
	const scopes = normalizeRequiredString(input.scopes, 'Scopes', MAX_SCOPES_LENGTH);
	const clientSecretValue = input.clientSecret?.trim() ?? '';

	if (!name.ok || !slug.ok || !clientId.ok || !scopes.ok) {
		const firstError = [name, slug, clientId, scopes].find((result) => !result.ok);
		return { ok: false, error: firstError?.error ?? 'Missing required fields' };
	}
	if (options.requireClientSecret && !clientSecretValue) {
		return { ok: false, error: 'Missing required fields' };
	}

	if (!/^[a-z0-9-]+$/.test(slug.value)) {
		return {
			ok: false,
			error: 'Slug must contain only lowercase letters, numbers, and hyphens'
		};
	}

	const providerType = input.providerType?.trim() || 'OIDC';
	if (providerType.length > MAX_PROVIDER_TYPE_LENGTH || providerType !== 'OIDC') {
		return { ok: false, error: 'providerType must be OIDC' };
	}

	if (clientSecretValue.length > MAX_CLIENT_SECRET_LENGTH) {
		return {
			ok: false,
			error: `Client secret must be ${MAX_CLIENT_SECRET_LENGTH} characters or less`
		};
	}

	const iconUrl = input.iconUrl?.trim() || null;
	if (iconUrl) {
		if (iconUrl.length > MAX_ICON_URL_LENGTH) {
			return {
				ok: false,
				error: `iconUrl must be ${MAX_ICON_URL_LENGTH} characters or less`
			};
		}
		const validation = await validatePublicHttpsUrl(iconUrl);
		if (!validation.ok) {
			return { ok: false, error: `iconUrl: ${validation.error ?? 'Invalid URL'}` };
		}
	}

	return {
		ok: true,
		fields: {
			name: name.value,
			slug: slug.value,
			providerType: 'OIDC',
			clientId: clientId.value,
			clientSecret: clientSecretValue || undefined,
			scopes: scopes.value,
			iconUrl
		}
	};
}
