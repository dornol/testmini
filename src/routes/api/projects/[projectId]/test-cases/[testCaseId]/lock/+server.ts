import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';
import { acquireLock, releaseLock, refreshLock, getLockInfo } from '$lib/server/lock';

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	const tcId = Number(params.testCaseId);

	if (isNaN(projectId) || isNaN(tcId)) {
		error(400, 'Invalid parameters');
	}

	await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const info = await getLockInfo(tcId);
	return json({ locked: !!info, holder: info });
};

export const POST: RequestHandler = async ({ params, locals }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	const tcId = Number(params.testCaseId);

	if (isNaN(projectId) || isNaN(tcId)) {
		error(400, 'Invalid parameters');
	}

	await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const result = await acquireLock(tcId, user.id, user.name);
	if (!result.acquired) {
		return json({ acquired: false, holder: result.holder }, { status: 409 });
	}

	return json({ acquired: true });
};

export const PUT: RequestHandler = async ({ params, locals }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	const tcId = Number(params.testCaseId);

	if (isNaN(projectId) || isNaN(tcId)) {
		error(400, 'Invalid parameters');
	}

	await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const refreshed = await refreshLock(tcId, user.id);
	if (!refreshed) {
		return json({ refreshed: false }, { status: 409 });
	}

	return json({ refreshed: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	const tcId = Number(params.testCaseId);

	if (isNaN(projectId) || isNaN(tcId)) {
		error(400, 'Invalid parameters');
	}

	await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	await releaseLock(tcId, user.id);
	return json({ released: true });
};
