import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider, oidcAccount } from '$lib/server/db/schema';
import { user, session } from '$lib/server/db/auth.schema';
import { and, eq } from 'drizzle-orm';
import { randomUUID, createHmac } from 'crypto';
import { decrypt } from '$lib/server/crypto';
import { env } from '$env/dynamic/private';

/** Sign a cookie value using HMAC-SHA256, matching better-auth's format: `value.base64signature` */
function signSessionCookie(value: string, secret: string): string {
	const signature = createHmac('sha256', secret).update(value).digest('base64');
	return `${value}.${signature}`;
}

export const GET: RequestHandler = async ({ params, url, cookies, locals }) => {
	console.log('[OIDC Callback] Start for slug:', params.slug);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const errorParam = url.searchParams.get('error');

	if (errorParam) {
		console.error('[OIDC Callback] IdP returned error:', errorParam, url.searchParams.get('error_description'));
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	if (!code || !state) {
		console.error('[OIDC Callback] Missing code or state');
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	// Restore cookie state
	const cookieValue = cookies.get(`oidc_${params.slug}`);
	if (!cookieValue) {
		console.error('[OIDC Callback] Cookie not found: oidc_' + params.slug);
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	let cookieData: { codeVerifier: string; state: string; link?: boolean };
	try {
		cookieData = JSON.parse(decrypt(cookieValue));
	} catch (e) {
		console.error('[OIDC Callback] Cookie decrypt failed:', e);
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	if (cookieData.state !== state) {
		console.error('[OIDC Callback] State mismatch');
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	// Clean up cookie
	cookies.delete(`oidc_${params.slug}`, { path: '/' });

	// Get provider
	const [provider] = await db
		.select()
		.from(oidcProvider)
		.where(and(eq(oidcProvider.slug, params.slug), eq(oidcProvider.enabled, true)));

	if (!provider) error(404, 'Provider not found');

	// Decrypt client secret
	const clientSecret = decrypt(provider.clientSecretEncrypted);

	// Token exchange
	const tokenRes = await fetch(provider.tokenUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: `${env.ORIGIN}/auth/oidc/${params.slug}/callback`,
			client_id: provider.clientId,
			client_secret: clientSecret,
			code_verifier: cookieData.codeVerifier
		})
	});

	if (!tokenRes.ok) {
		const errorBody = await tokenRes.text();
		console.error('[OIDC Callback] Token exchange failed:', tokenRes.status, errorBody);
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	const tokenData = await tokenRes.json();
	console.log('[OIDC Callback] Token exchange success, has id_token:', !!tokenData.id_token);
	const accessToken = tokenData.access_token;

	// Extract user info from ID token or userinfo endpoint
	let sub: string | undefined;
	let email: string | undefined;
	let name: string | undefined;

	// Try parsing ID token payload (base64url-encoded JWT)
	if (tokenData.id_token) {
		try {
			const payload = JSON.parse(
				Buffer.from(tokenData.id_token.split('.')[1], 'base64url').toString()
			);
			sub = payload.sub;
			email = payload.email;
			name = payload.name;
		} catch {
			// Fall through to userinfo
		}
	}

	// Fetch userinfo if needed
	if ((!sub || !email) && provider.userinfoUrl && accessToken) {
		try {
			const userinfoRes = await fetch(provider.userinfoUrl, {
				headers: { Authorization: `Bearer ${accessToken}` }
			});
			if (userinfoRes.ok) {
				const userinfo = await userinfoRes.json();
				sub = sub || userinfo.sub;
				email = email || userinfo.email;
				name = name || userinfo.name;
			}
		} catch {
			// Continue with what we have
		}
	}

	console.log('[OIDC Callback] User info - sub:', sub, 'email:', email, 'name:', name);

	if (!sub) {
		console.error('[OIDC Callback] No sub claim found');
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	// Link mode: attach to current user's session
	if (cookieData.link && locals.user) {
		await db.insert(oidcAccount).values({
			userId: locals.user.id,
			providerId: provider.id,
			externalId: sub,
			email: email || null,
			name: name || null
		}).onConflictDoNothing();

		redirect(302, '/auth/account');
	}

	// Account matching logic
	let userId: string | undefined;

	// 1. Check existing oidcAccount by (providerId, externalId)
	const [existingAccount] = await db
		.select({ userId: oidcAccount.userId })
		.from(oidcAccount)
		.where(
			and(eq(oidcAccount.providerId, provider.id), eq(oidcAccount.externalId, sub))
		);

	if (existingAccount) {
		userId = existingAccount.userId;
	}

	// 2. Try email matching if no existing link
	if (!userId && email) {
		const [existingUser] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, email));

		if (existingUser) {
			userId = existingUser.id;
			// Create oidc account link
			await db.insert(oidcAccount).values({
				userId,
				providerId: provider.id,
				externalId: sub,
				email: email || null,
				name: name || null
			}).onConflictDoNothing();
		}
	}

	// 3. Auto-register if no match
	if (!userId) {
		if (!provider.autoRegister) {
			redirect(302, '/auth/login?error=oidc_no_auto_register');
		}

		userId = randomUUID();
		await db.insert(user).values({
			id: userId,
			name: name || email || sub,
			email: email || `${sub}@oidc.local`,
			emailVerified: !!email
		});

		await db.insert(oidcAccount).values({
			userId,
			providerId: provider.id,
			externalId: sub,
			email: email || null,
			name: name || null
		});
	}

	// Check if user is banned
	const [existingUser] = await db
		.select({ banned: user.banned })
		.from(user)
		.where(eq(user.id, userId));

	if (existingUser?.banned) {
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	// Create session
	const sessionId = randomUUID();
	const sessionToken = randomUUID();
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

	await db.insert(session).values({
		id: sessionId,
		token: sessionToken,
		userId,
		expiresAt,
		createdAt: new Date(),
		updatedAt: new Date()
	});

	console.log('[OIDC Callback] Session created for userId:', userId, '→ redirecting to /projects');

	// Set session cookie with HMAC signature (matching better-auth's signed cookie format)
	const secret = env.BETTER_AUTH_SECRET;
	if (!secret) error(500, 'BETTER_AUTH_SECRET not configured');

	const signedToken = signSessionCookie(sessionToken, secret);
	cookies.set('better-auth.session_token', signedToken, {
		path: '/',
		httpOnly: true,
		secure: env.ORIGIN?.startsWith('https') ?? false,
		sameSite: 'lax',
		expires: expiresAt
	});

	redirect(302, '/projects');
};
