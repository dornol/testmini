import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider, oidcAccount } from '$lib/server/db/schema';
import { user, session } from '$lib/server/db/auth.schema';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { decrypt } from '$lib/server/crypto';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ params, url, cookies, locals }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const errorParam = url.searchParams.get('error');

	if (errorParam) {
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	if (!code || !state) {
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	// Restore cookie state
	const cookieValue = cookies.get(`oidc_${params.slug}`);
	if (!cookieValue) {
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	let cookieData: { codeVerifier: string; state: string; link?: boolean };
	try {
		cookieData = JSON.parse(decrypt(cookieValue));
	} catch {
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	if (cookieData.state !== state) {
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
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	const tokenData = await tokenRes.json();
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

	if (!sub) {
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

	// Set session cookie (same name as better-auth)
	cookies.set('better-auth.session_token', sessionToken, {
		path: '/',
		httpOnly: true,
		secure: env.ORIGIN?.startsWith('https') ?? false,
		sameSite: 'lax',
		expires: expiresAt
	});

	redirect(302, '/projects');
};
