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

async function requireProjectExists(projectId: number): Promise<void> {
	const existingProject = await db.query.project.findFirst({
		where: (projects, { eq }) => eq(projects.id, projectId),
		columns: { id: true }
	});

	if (!existingProject) {
		error(404, 'Project not found');
	}
}

export async function requireProjectAccess(
	user: AuthUser,
	projectId: number
): Promise<{ role: string }> {
	if (isGlobalAdmin(user)) {
		await requireProjectExists(projectId);
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
		await requireProjectExists(projectId);
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

/**
 * Parse a route param as a numeric ID, throwing 400 if invalid.
 */
export function parseId(raw: string | undefined, label: string): number {
	const id = Number(raw);
	if (!Number.isSafeInteger(id) || id <= 0) {
		error(400, `Invalid ${label}`);
	}
	return id;
}

const MAX_JSON_BODY_SIZE = 1024 * 1024; // 1MB

export async function readRequestText(
	request: Request,
	maxBytes = MAX_JSON_BODY_SIZE
): Promise<string> {
	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > maxBytes) {
		error(413, 'Request body must not exceed 1MB');
	}

	if (!request.body) return '';

	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let bytesRead = 0;
	let text = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			bytesRead += value.byteLength;
			if (bytesRead > maxBytes) {
				error(413, 'Request body must not exceed 1MB');
			}

			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
		return text;
	} finally {
		reader.releaseLock();
	}
}

export async function parseJsonBody(request: Request): Promise<unknown> {
	try {
		const text = await readRequestText(request, MAX_JSON_BODY_SIZE);
		return JSON.parse(text);
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		error(400, 'Invalid request body');
	}
}
