import { error, type RequestEvent } from '@sveltejs/kit';
import { requireAuth, requireProjectRole, requireProjectAccess } from './auth-utils';

type AuthUser = NonNullable<App.Locals['user']>;

type ProjectEvent = RequestEvent & {
	user: AuthUser;
	projectId: number;
};

type AuthEvent = RequestEvent & {
	user: AuthUser;
};

export function withProjectRole(
	roles: string[],
	handler: (event: ProjectEvent) => Promise<Response>
) {
	return async (event: RequestEvent): Promise<Response> => {
		const user = requireAuth(event.locals);
		const projectId = Number(event.params.projectId);
		if (!Number.isFinite(projectId)) error(400, 'Invalid project ID');
		await requireProjectRole(user, projectId, roles);
		return handler(Object.assign(event, { user, projectId }));
	};
}

export function withProjectAccess(
	handler: (event: ProjectEvent) => Promise<Response>
) {
	return async (event: RequestEvent): Promise<Response> => {
		const user = requireAuth(event.locals);
		const projectId = Number(event.params.projectId);
		if (!Number.isFinite(projectId)) error(400, 'Invalid project ID');
		await requireProjectAccess(user, projectId);
		return handler(Object.assign(event, { user, projectId }));
	};
}

export function withAuth(
	handler: (event: AuthEvent) => Promise<Response>
) {
	return async (event: RequestEvent): Promise<Response> => {
		const user = requireAuth(event.locals);
		return handler(Object.assign(event, { user }));
	};
}

/**
 * Extract authenticated user, projectId, and verify project role from a page action event.
 * Reduces boilerplate in page.server.ts form actions.
 *
 * Usage:
 *   const { user, projectId } = await getActionContext(locals, params, ['PROJECT_ADMIN', 'QA']);
 */
export async function getActionContext(
	locals: App.Locals,
	params: Record<string, string>,
	allowedRoles?: string[]
): Promise<{ user: AuthUser; projectId: number }> {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	if (!Number.isFinite(projectId)) error(400, 'Invalid project ID');

	if (allowedRoles) {
		await requireProjectRole(user, projectId, allowedRoles);
	} else {
		await requireProjectAccess(user, projectId);
	}

	return { user, projectId };
}
