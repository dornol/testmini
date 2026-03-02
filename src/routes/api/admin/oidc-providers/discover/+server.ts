import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { requireAuth, isGlobalAdmin, parseJsonBody } from '$lib/server/auth-utils';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireAuth(locals);
	if (!isGlobalAdmin(user)) {
		error(403, 'Admin access required');
	}

	const body = await parseJsonBody(request) as Record<string, unknown>;
	const issuerUrl = (body.issuerUrl as string)?.trim()?.replace(/\/+$/, '');

	if (!issuerUrl) {
		error(400, 'issuerUrl is required');
	}

	try {
		const res = await fetch(`${issuerUrl}/.well-known/openid-configuration`);
		if (!res.ok) {
			error(400, 'Failed to fetch OpenID configuration');
		}

		const config = await res.json();

		return json({
			authorizationUrl: config.authorization_endpoint ?? '',
			tokenUrl: config.token_endpoint ?? '',
			userinfoUrl: config.userinfo_endpoint ?? ''
		});
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		error(400, 'Failed to discover OpenID configuration');
	}
};
