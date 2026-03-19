import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	oidcProvider: {
		id: 'id',
		slug: 'slug'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/crypto', () => ({
	encrypt: vi.fn((s: string) => `encrypted:${s}`)
}));

const { actions } = await import('./+page.server');

function createFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(entries)) {
		fd.set(k, v);
	}
	return fd;
}

const validProviderData = {
	name: 'Google',
	slug: 'google',
	providerType: 'OIDC',
	clientId: 'client-123',
	clientSecret: 'secret-456',
	authorizationUrl: 'https://accounts.google.com/o/oauth2/auth',
	tokenUrl: 'https://oauth2.googleapis.com/token',
	scopes: 'openid profile email'
};

function createActionEvent(
	user: NonNullable<App.Locals['user']> | null,
	formEntries: Record<string, string>
) {
	const formData = createFormData(formEntries);
	return {
		request: {
			formData: () => Promise.resolve(formData)
		},
		locals: {
			user: user ?? undefined,
			session: user ? { id: 'session-1' } : undefined,
			requestId: 'test-req'
		},
		url: new URL('http://localhost:5173/admin/oidc-providers/new')
	} as never;
}

describe('admin/oidc-providers/new +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('create action', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, validProviderData);
			const result = await actions.create(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should return 401 when not authenticated', async () => {
			const event = createActionEvent(null, validProviderData);
			await expect(actions.create(event)).rejects.toThrow();
		});

		it('should return 400 when required fields are missing', async () => {
			const event = createActionEvent(adminUser, { name: 'Google' });
			const result = await actions.create(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Missing required fields' } });
		});

		it('should return 400 for invalid slug format', async () => {
			const event = createActionEvent(adminUser, {
				...validProviderData,
				slug: 'INVALID SLUG!'
			});
			const result = await actions.create(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Slug must contain only lowercase letters, numbers, and hyphens' }
			});
		});

		it('should return 400 when slug already exists', async () => {
			mockSelectResult(mockDb, [{ id: 1 }]);

			const event = createActionEvent(adminUser, validProviderData);
			const result = await actions.create(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'A provider with this slug already exists' }
			});
		});

		it('should create provider and redirect on success', async () => {
			mockSelectResult(mockDb, []); // no existing slug

			const event = createActionEvent(adminUser, validProviderData);
			await expect(actions.create(event)).rejects.toMatchObject({
				status: 302,
				location: '/admin/oidc-providers'
			});
			expect(mockDb.insert).toHaveBeenCalled();
		});

		it('should return 500 when insert fails', async () => {
			mockSelectResult(mockDb, []); // no existing slug
			mockDb.insert.mockImplementationOnce(() => {
				throw new Error('DB error');
			});

			const event = createActionEvent(adminUser, validProviderData);
			const result = await actions.create(event);
			expect(result).toMatchObject({
				status: 500,
				data: { error: expect.stringContaining('Failed to create OIDC provider') }
			});
		});
	});
});
