import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { oidcProvider, oidcAccount } from '$lib/server/db/schema';
import { user, session } from '$lib/server/db/auth.schema';
import { and, eq } from 'drizzle-orm';
import { randomUUID, createHmac } from 'crypto';
import { decrypt } from '$lib/server/crypto';
import { verifyIdToken, parseIdTokenPayload } from '$lib/server/oidc-jwt';
import { env } from '$env/dynamic/private';
import { childLogger } from '$lib/server/logger';
import { logAudit } from '$lib/server/audit';
import { createNotification } from '$lib/server/notifications';

const log = childLogger('oidc-callback');

/** Sign a cookie value using HMAC-SHA256, matching better-auth's format: `value.base64signature` */
function signSessionCookie(value: string, secret: string): string {
	const signature = createHmac('sha256', secret).update(value).digest('base64');
	return `${value}.${signature}`;
}

/** Exchange the authorization code for tokens at the provider's token endpoint */
async function exchangeToken(
	provider: { tokenUrl: string; clientId: string; clientSecretEncrypted: string },
	code: string,
	codeVerifier: string,
	slug: string,
	clientSecret: string
): Promise<{ tokenData: Record<string, unknown>; accessToken: string } | null> {
	const tokenRes = await fetch(provider.tokenUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: `${env.ORIGIN}/auth/oidc/${slug}/callback`,
			client_id: provider.clientId,
			client_secret: clientSecret,
			code_verifier: codeVerifier
		})
	});

	if (!tokenRes.ok) {
		const errorBody = await tokenRes.text();
		return null;
	}

	const tokenData = await tokenRes.json();
	return { tokenData, accessToken: tokenData.access_token };
}

/** Resolve user identity (sub, email, name) from ID token verification and/or userinfo endpoint */
async function resolveUserInfo(
	tokenData: Record<string, unknown>,
	provider: { jwksUri: string | null; issuerUrl: string | null; clientId: string; userinfoUrl: string | null },
	accessToken: string,
	callbackLog: typeof log
): Promise<{ sub?: string; email?: string; name?: string }> {
	let sub: string | undefined;
	let email: string | undefined;
	let name: string | undefined;

	if (tokenData.id_token) {
		const jwksUri = provider.jwksUri ?? null;
		const issuerUrl = provider.issuerUrl ?? null;

		if (jwksUri && issuerUrl) {
			const result = await verifyIdToken({
				idToken: tokenData.id_token as string,
				jwksUri,
				issuer: issuerUrl,
				audience: provider.clientId
			});

			if (result.verified && result.claims) {
				callbackLog.info('ID token signature and claims verified');
				sub = result.claims.sub;
				email = result.claims.email;
				name = result.claims.name;
			} else {
				callbackLog.warn({ warning: result.warning }, 'ID token verification failed');
			}
		} else {
			callbackLog.warn(
				'Provider has no jwksUri configured — ID token signature is NOT verified. Set jwksUri via the discovery endpoint.'
			);
			const payload = parseIdTokenPayload(tokenData.id_token as string);
			if (payload) {
				sub = payload.sub;
				email = payload.email;
				name = payload.name;
			}
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

	callbackLog.info({ hasSub: !!sub, hasEmail: !!email, hasName: !!name }, 'User info resolved');
	return { sub, email, name };
}

/** Match an existing account or create a new user, returning the userId and registration status */
async function matchOrCreateUser(
	sub: string,
	email: string | undefined,
	name: string | undefined,
	provider: { id: number; slug: string; autoRegister: boolean | null },
	callbackLog: typeof log
): Promise<{ userId: string; isNewUser: boolean; isPendingApproval: boolean }> {
	let userId: string | undefined;
	let isNewUser = false;
	let isPendingApproval = false;

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
		const approved = !!provider.autoRegister;
		userId = randomUUID();
		await db.insert(user).values({
			id: userId,
			name: name || email || sub,
			email: email || `${sub}@oidc.local`,
			emailVerified: !!email,
			approved
		});

		await db.insert(oidcAccount).values({
			userId,
			providerId: provider.id,
			externalId: sub,
			email: email || null,
			name: name || null
		});

		isNewUser = true;
		isPendingApproval = !approved;

		if (!approved) {
			const adminUsers = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.role, 'admin'));

			const userName = name || email || sub;
			const userEmail = email || `${sub}@oidc.local`;
			for (const admin of adminUsers) {
				createNotification({
					userId: admin.id,
					type: 'USER_PENDING',
					title: 'New user pending approval',
					message: `${userName} (${userEmail}) is waiting for approval`,
					link: '/admin/users?pending=true'
				});
			}
		}
	}

	// Check if user is banned or pending approval
	const [existingUser] = await db
		.select({ banned: user.banned, approved: user.approved })
		.from(user)
		.where(eq(user.id, userId));

	if (existingUser?.banned) {
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	if (existingUser && !existingUser.approved) {
		isPendingApproval = true;
	}

	return { userId, isNewUser, isPendingApproval };
}

export const GET: RequestHandler = async ({ params, url, cookies, locals }) => {
	const slug = params.slug;
	const requestId = locals.requestId;
	const callbackLog = log.child({ slug, requestId });

	callbackLog.info('Callback started');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const errorParam = url.searchParams.get('error');

	if (errorParam) {
		callbackLog.warn(
			{ oidcError: errorParam, oidcErrorDescription: url.searchParams.get('error_description') },
			'IdP returned error'
		);
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	if (!code || !state) {
		callbackLog.warn('Missing code or state in callback');
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	// Restore cookie state
	const cookieValue = cookies.get(`oidc_${slug}`);
	if (!cookieValue) {
		callbackLog.warn({ cookieName: `oidc_${slug}` }, 'Cookie not found');
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	let cookieData: { codeVerifier: string; state: string; link?: boolean };
	try {
		cookieData = JSON.parse(decrypt(cookieValue));
	} catch (e) {
		callbackLog.warn({ err: e instanceof Error ? { message: e.message } : e }, 'Cookie decrypt failed');
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	if (cookieData.state !== state) {
		callbackLog.warn('State mismatch');
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
	const tokenResult = await exchangeToken(provider, code, cookieData.codeVerifier, params.slug, clientSecret);
	if (!tokenResult) {
		callbackLog.warn('Token exchange failed');
		redirect(302, '/auth/login?error=oidc_callback_error');
	}

	const { tokenData, accessToken } = tokenResult;
	callbackLog.info({ hasIdToken: !!tokenData.id_token }, 'Token exchange succeeded');

	// Resolve user identity
	const { sub, email, name } = await resolveUserInfo(tokenData, provider, accessToken, callbackLog);

	if (!sub) {
		callbackLog.warn('No sub claim found in token or userinfo response');
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

	// Match or create user account
	const { userId, isNewUser, isPendingApproval } = await matchOrCreateUser(sub, email, name, provider, callbackLog);

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

	const redirectTarget = isPendingApproval ? '/auth/pending' : '/projects';
	callbackLog.info({ userId, redirectTarget }, `Session created, redirecting to ${redirectTarget}`);

	// Fire-and-forget audit log for login / registration
	logAudit({
		userId,
		action: isPendingApproval ? 'USER_PENDING_APPROVAL' : isNewUser ? 'REGISTER' : 'LOGIN',
		entityType: 'USER',
		entityId: userId,
		metadata: { provider: provider.slug, method: 'OIDC' }
	});

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

	redirect(302, redirectTarget);
};
