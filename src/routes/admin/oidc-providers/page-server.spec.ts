import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	oidcProvider: {
		id: 'id',
		name: 'name',
		slug: 'slug',
		providerType: 'provider_type',
		enabled: 'enabled',
		displayOrder: 'display_order',
		createdAt: 'created_at'
	},
	oidcAccount: {
		id: 'id',
		providerId: 'provider_id'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	count: vi.fn(() => 'count'),
	asc: vi.fn((a: unknown) => ['asc', a])
}));

const { actions, load } = await import('./+page.server');

function createFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(entries)) {
		fd.set(k, v);
	}
	return fd;
}

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
		url: new URL('http://localhost:5173/admin/oidc-providers')
	} as never;
}

describe('admin/oidc-providers +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('load', () => {
		it('should return providers list', async () => {
			const mockProviders = [
				{
					id: 1,
					name: 'Google',
					slug: 'google',
					providerType: 'OIDC',
					enabled: true,
					displayOrder: 0,
					createdAt: new Date(),
					accountCount: 5
				}
			];
			mockSelectResult(mockDb, mockProviders);

			const result = (await load({} as never)) as Record<string, unknown>;
			expect(result.providers).toBeDefined();
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should return empty list when no providers exist', async () => {
			mockSelectResult(mockDb, []);

			const result = (await load({} as never)) as Record<string, unknown>;
			expect(result.providers).toEqual([]);
		});
	});

	describe('toggle', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { providerId: '1' });
			const result = await actions.toggle(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should return 400 for invalid providerId', async () => {
			const event = createActionEvent(adminUser, { providerId: '0' });
			const result = await actions.toggle(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid provider ID' } });
		});

		it('should return 404 when provider not found', async () => {
			mockSelectResult(mockDb, []);

			const event = createActionEvent(adminUser, { providerId: '99' });
			const result = await actions.toggle(event);
			expect(result).toMatchObject({ status: 404, data: { error: 'Provider not found' } });
		});

		it('should toggle enabled status on success', async () => {
			mockSelectResult(mockDb, [{ enabled: true }]);

			const event = createActionEvent(adminUser, { providerId: '1' });
			const result = await actions.toggle(event);
			expect(result).toMatchObject({ success: true, enabled: false });
			expect(mockDb.update).toHaveBeenCalled();
		});
	});

	describe('deleteProvider', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { providerId: '1' });
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should return 400 for invalid providerId', async () => {
			const event = createActionEvent(adminUser, { providerId: '0' });
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid provider ID' } });
		});

		it('should disable provider instead of deleting when accounts exist', async () => {
			mockSelectResult(mockDb, [{ count: 3 }]);

			const event = createActionEvent(adminUser, { providerId: '1' });
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({ success: true, disabled: true });
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should delete provider when no accounts linked', async () => {
			mockSelectResult(mockDb, [{ count: 0 }]);

			const event = createActionEvent(adminUser, { providerId: '1' });
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({ success: true, deleted: true });
			expect(mockDb.delete).toHaveBeenCalled();
		});
	});
});
