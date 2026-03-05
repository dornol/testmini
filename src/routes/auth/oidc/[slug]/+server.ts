import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { encrypt } from '$lib/server/crypto';
import { env } from '$env/dynamic/private';
import { childLogger } from '$lib/server/logger';

const log = childLogger('oidc-auth');

export const GET: RequestHandler = async ({ params, cookies, url }) => {
	log.info({ slug: params.slug }, 'Authorization start');

	const [provider] = await db
		.select()
		.from(oidcProvider)
		.where(and(eq(oidcProvider.slug, params.slug), eq(oidcProvider.enabled, true)));

	if (!provider) {
		log.warn({ slug: params.slug }, 'Provider not found');
		error(404, 'Provider not found');
	}
	log.info({ providerName: provider.name, authorizationUrl: provider.authorizationUrl }, 'Provider found, redirecting');

	const codeVerifier = randomBytes(32).toString('base64url');
	const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
	const state = randomUUID();

	const isLinkMode = url.searchParams.get('link') === 'true';

	// Store state in encrypted cookie
	const cookieData = JSON.stringify({ codeVerifier, state, link: isLinkMode });
	const encryptedCookie = encrypt(cookieData);

	cookies.set(`oidc_${params.slug}`, encryptedCookie, {
		path: '/',
		httpOnly: true,
		secure: env.ORIGIN?.startsWith('https') ?? false,
		sameSite: 'lax',
		maxAge: 300 // 5 minutes
	});

	const authUrl = new URL(provider.authorizationUrl);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('client_id', provider.clientId);
	authUrl.searchParams.set(
		'redirect_uri',
		`${env.ORIGIN}/auth/oidc/${params.slug}/callback`
	);
	authUrl.searchParams.set('scope', provider.scopes);
	authUrl.searchParams.set('code_challenge', codeChallenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');
	authUrl.searchParams.set('state', state);

	redirect(302, authUrl.toString());
};
