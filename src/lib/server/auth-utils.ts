import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projectMember } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

type AuthUser = NonNullable<App.Locals['user']>;

export function isGlobalAdmin(user: AuthUser): boolean {
	return user.role === 'admin';
}

export function requireAuth(locals: App.Locals): AuthUser {
	if (!locals.user) {
		error(401, 'Authentication required');
	}
	return locals.user;
}

export async function requireProjectAccess(
	user: AuthUser,
	projectId: number
): Promise<{ role: string }> {
	if (isGlobalAdmin(user)) {
		return { role: 'ADMIN' };
	}

	const member = await db.query.projectMember.findFirst({
		where: and(eq(projectMember.projectId, projectId), eq(projectMember.userId, user.id))
	});

	if (!member) {
		error(403, 'You do not have access to this project');
	}

	return { role: member.role };
}

export async function requireProjectRole(
	user: AuthUser,
	projectId: number,
	allowedRoles: string[]
): Promise<{ role: string }> {
	if (isGlobalAdmin(user)) {
		return { role: 'ADMIN' };
	}

	const member = await db.query.projectMember.findFirst({
		where: and(eq(projectMember.projectId, projectId), eq(projectMember.userId, user.id))
	});

	if (!member) {
		error(403, 'You do not have access to this project');
	}

	if (!allowedRoles.includes(member.role)) {
		error(403, 'You do not have the required role for this action');
	}

	return { role: member.role };
}

const MAX_JSON_BODY_SIZE = 1024 * 1024; // 1MB

export async function parseJsonBody(request: Request): Promise<unknown> {
	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > MAX_JSON_BODY_SIZE) {
		error(413, 'Request body must not exceed 1MB');
	}
	try {
		const text = await request.text();
		if (text.length > MAX_JSON_BODY_SIZE) {
			error(413, 'Request body must not exceed 1MB');
		}
		return JSON.parse(text);
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		error(400, 'Invalid request body');
	}
}
