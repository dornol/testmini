import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireAuth = vi.fn();
const mockRequireProjectRole = vi.fn();
const mockRequireProjectAccess = vi.fn();

vi.mock('./auth-utils', () => ({
	requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
	requireProjectRole: (...args: unknown[]) => mockRequireProjectRole(...args),
	requireProjectAccess: (...args: unknown[]) => mockRequireProjectAccess(...args)
}));

vi.mock('@sveltejs/kit', () => ({
	error: (status: number, message: string) => {
		throw { status, body: { message } };
	}
}));

import { withProjectRole, withProjectAccess, withAuth } from './api-handler';

const fakeUser = { id: 'user-1', name: 'Test', role: 'user' };

function makeEvent(overrides: { projectId?: string; user?: typeof fakeUser | null } = {}) {
	return {
		locals: { user: overrides.user ?? fakeUser },
		params: { projectId: overrides.projectId ?? '42' },
		request: new Request('http://localhost')
	} as unknown as Parameters<ReturnType<typeof withProjectRole>>[0];
}

describe('withProjectRole', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(fakeUser);
		mockRequireProjectRole.mockResolvedValue({ role: 'ADMIN' });
	});

	it('calls handler with user and projectId on success', async () => {
		const handler = vi.fn().mockResolvedValue(new Response('ok'));
		const wrapped = withProjectRole(['ADMIN'], handler);
		const event = makeEvent();

		await wrapped(event);

		expect(mockRequireAuth).toHaveBeenCalledWith(event.locals);
		expect(mockRequireProjectRole).toHaveBeenCalledWith(fakeUser, 42, ['ADMIN']);
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ user: fakeUser, projectId: 42 }));
	});

	it('throws 401 when not authenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw { status: 401, body: { message: 'Authentication required' } };
		});
		const handler = vi.fn();
		const wrapped = withProjectRole(['ADMIN'], handler);

		await expect(wrapped(makeEvent())).rejects.toMatchObject({ status: 401 });
		expect(handler).not.toHaveBeenCalled();
	});

	it.each([
		['NaN string', 'abc'],
		['Infinity', 'Infinity'],
		['special chars', 'foo-bar']
	])('throws 400 for non-numeric projectId (%s)', async (_label, id) => {
		const handler = vi.fn();
		const wrapped = withProjectRole(['ADMIN'], handler);
		const event = makeEvent({ projectId: id });

		await expect(wrapped(event)).rejects.toMatchObject({ status: 400 });
		expect(handler).not.toHaveBeenCalled();
	});

	it('throws 403 for wrong role', async () => {
		mockRequireProjectRole.mockRejectedValue({
			status: 403,
			body: { message: 'You do not have the required role for this action' }
		});
		const handler = vi.fn();
		const wrapped = withProjectRole(['ADMIN'], handler);

		await expect(wrapped(makeEvent())).rejects.toMatchObject({ status: 403 });
		expect(handler).not.toHaveBeenCalled();
	});
});

describe('withProjectAccess', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(fakeUser);
		mockRequireProjectAccess.mockResolvedValue({ role: 'MEMBER' });
	});

	it('calls handler with user and projectId on success', async () => {
		const handler = vi.fn().mockResolvedValue(new Response('ok'));
		const wrapped = withProjectAccess(handler);
		const event = makeEvent();

		await wrapped(event);

		expect(mockRequireAuth).toHaveBeenCalledWith(event.locals);
		expect(mockRequireProjectAccess).toHaveBeenCalledWith(fakeUser, 42);
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ user: fakeUser, projectId: 42 }));
	});

	it('throws 401 when not authenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw { status: 401, body: { message: 'Authentication required' } };
		});
		const handler = vi.fn();
		const wrapped = withProjectAccess(handler);

		await expect(wrapped(makeEvent())).rejects.toMatchObject({ status: 401 });
		expect(handler).not.toHaveBeenCalled();
	});

	it('throws 400 for invalid projectId', async () => {
		const handler = vi.fn();
		const wrapped = withProjectAccess(handler);

		await expect(wrapped(makeEvent({ projectId: 'abc' }))).rejects.toMatchObject({ status: 400 });
		expect(handler).not.toHaveBeenCalled();
	});

	it('throws 403 when no project access', async () => {
		mockRequireProjectAccess.mockRejectedValue({
			status: 403,
			body: { message: 'You do not have access to this project' }
		});
		const handler = vi.fn();
		const wrapped = withProjectAccess(handler);

		await expect(wrapped(makeEvent())).rejects.toMatchObject({ status: 403 });
		expect(handler).not.toHaveBeenCalled();
	});
});

describe('withAuth', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(fakeUser);
	});

	it('calls handler with user on success', async () => {
		const handler = vi.fn().mockResolvedValue(new Response('ok'));
		const wrapped = withAuth(handler);
		const event = makeEvent();

		await wrapped(event);

		expect(mockRequireAuth).toHaveBeenCalledWith(event.locals);
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ user: fakeUser }));
	});

	it('throws 401 when not authenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw { status: 401, body: { message: 'Authentication required' } };
		});
		const handler = vi.fn();
		const wrapped = withAuth(handler);

		await expect(wrapped(makeEvent())).rejects.toMatchObject({ status: 401 });
		expect(handler).not.toHaveBeenCalled();
	});
});
