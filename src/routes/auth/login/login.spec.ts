import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSignInEmail = vi.fn();
const mockDb = {
	select: vi.fn()
};

vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			signInEmail: mockSignInEmail
		}
	}
}));
vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	oidcProvider: {
		name: 'name',
		slug: 'slug',
		iconUrl: 'icon_url',
		displayOrder: 'display_order',
		enabled: 'enabled'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	asc: vi.fn((value: unknown) => value)
}));

const { actions } = await import('./+page.server');

describe('auth/login actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('rejects oversized login forms before parsing form data', async () => {
		const request = {
			headers: new Headers({ 'content-length': String(16 * 1024 + 1) }),
			formData: vi.fn()
		};

		await expect(actions.default({ request } as never)).rejects.toMatchObject({
			status: 413,
			body: { message: 'Login form body is too large' }
		});
		expect(request.formData).not.toHaveBeenCalled();
		expect(mockSignInEmail).not.toHaveBeenCalled();
	});

	it('rejects invalid login content-length before parsing form data', async () => {
		const request = {
			headers: new Headers({ 'content-length': 'abc' }),
			formData: vi.fn()
		};

		await expect(actions.default({ request } as never)).rejects.toMatchObject({
			status: 400,
			body: { message: 'Invalid content-length header' }
		});
		expect(request.formData).not.toHaveBeenCalled();
		expect(mockSignInEmail).not.toHaveBeenCalled();
	});
});
