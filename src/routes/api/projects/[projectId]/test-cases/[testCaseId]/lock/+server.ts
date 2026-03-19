import { json, error } from '@sveltejs/kit';
import { acquireLock, releaseLock, refreshLock, getLockInfo } from '$lib/server/lock';
import { parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';

export const GET = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, projectId }) => {
	const tcId = parseId(params.testCaseId, 'test case ID');

	const info = await getLockInfo(tcId);
	return json({ locked: !!info, holder: info });
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, user, projectId }) => {
	const tcId = parseId(params.testCaseId, 'test case ID');

	const result = await acquireLock(tcId, user.id, user.name);
	if (!result.acquired) {
		return json({ acquired: false, holder: result.holder }, { status: 409 });
	}

	return json({ acquired: true });
});

export const PUT = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, user, projectId }) => {
	const tcId = parseId(params.testCaseId, 'test case ID');

	const refreshed = await refreshLock(tcId, user.id);
	if (!refreshed) {
		return json({ refreshed: false }, { status: 409 });
	}

	return json({ refreshed: true });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, user, projectId }) => {
	const tcId = parseId(params.testCaseId, 'test case ID');

	await releaseLock(tcId, user.id);
	return json({ released: true });
});
