import { validatePublicHttpsUrl } from './url-safety';

export interface OidcProviderUrlInput {
	issuerUrl?: string | null;
	jwksUri?: string | null;
	authorizationUrl?: string | null;
	tokenUrl?: string | null;
	userinfoUrl?: string | null;
}

const REQUIRED_URL_FIELDS: Array<keyof OidcProviderUrlInput> = ['authorizationUrl', 'tokenUrl'];
const OPTIONAL_URL_FIELDS: Array<keyof OidcProviderUrlInput> = [
	'issuerUrl',
	'jwksUri',
	'userinfoUrl'
];

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
