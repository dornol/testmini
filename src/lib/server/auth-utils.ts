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

export async function parseJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		error(400, 'Invalid request body');
	}
}
