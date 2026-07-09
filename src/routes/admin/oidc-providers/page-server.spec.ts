import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockSelectResult,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
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
const MAX_OIDC_PROVIDER_FORM_BODY_SIZE = 16 * 1024;

function createFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(entries)) {
		fd.set(k, v);
	}
	return fd;
}

function createActionEvent(
	user: NonNullable<App.Locals['user']> | null,
	formEntries: Record<string, string>,
	headers?: HeadersInit
) {
	const formData = createFormData(formEntries);
	const requestHeaders = new Headers(headers);
	return {
		request: {
			headers: requestHeaders,
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

function mockSelectSequence(results: unknown[][]) {
	let index = 0;
	mockDb.select.mockImplementation(() => {
		const chain: Record<string, unknown> = {};
		for (const method of ['from', 'where', 'leftJoin', 'groupBy', 'orderBy']) {
			chain[method] = vi.fn().mockReturnValue(chain);
		}
		chain.then = (resolve: (value: unknown[]) => void) =>
			Promise.resolve(results[index++] ?? []).then(resolve);
		return chain as never;
	});
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
		it('should reject oversized form bodies before querying provider', async () => {
			const event = createActionEvent(
				adminUser,
				{ providerId: '1' },
				{ 'content-length': String(MAX_OIDC_PROVIDER_FORM_BODY_SIZE + 1) }
			);

			await expect(actions.toggle(event)).rejects.toMatchObject({
				status: 413,
				body: { message: 'OIDC provider form body is too large' }
			});
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { providerId: '1' });
			const result = await actions.toggle(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it.each([
			'abc',
			'',
			'0',
			'-1',
			'+1',
			'01',
			'1.5',
			'1e3',
			' 1',
			'1 ',
			'Infinity',
			'9007199254740992'
		])('should return 400 for invalid providerId %s', async (providerId) => {
			const event = createActionEvent(adminUser, { providerId });
			const result = await actions.toggle(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid provider ID' } });
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 404 when provider not found', async () => {
			mockSelectResult(mockDb, []);

			const event = createActionEvent(adminUser, { providerId: '99' });
			const result = await actions.toggle(event);
			expect(result).toMatchObject({ status: 404, data: { error: 'Provider not found' } });
		});

		it('should toggle enabled status on success', async () => {
			mockSelectResult(mockDb, [{ enabled: true }]);
			mockUpdateReturning(mockDb, [{ id: 1 }]);

			const event = createActionEvent(adminUser, { providerId: '1' });
			const result = await actions.toggle(event);
			expect(result).toMatchObject({ success: true, enabled: false });
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should return 404 when provider disappears before toggle update', async () => {
			mockSelectResult(mockDb, [{ enabled: true }]);
			mockUpdateReturning(mockDb, []);

			const event = createActionEvent(adminUser, { providerId: '1' });
			const result = await actions.toggle(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'Provider not found' } });
		});
	});

	describe('deleteProvider', () => {
		it('should reject invalid content-length before querying provider', async () => {
			const event = createActionEvent(
				adminUser,
				{ providerId: '1' },
				{ 'content-length': 'invalid' }
			);

			await expect(actions.deleteProvider(event)).rejects.toMatchObject({
				status: 400,
				body: { message: 'Invalid content-length header' }
			});
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { providerId: '1' });
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it.each([
			'abc',
			'',
			'0',
			'-1',
			'+1',
			'01',
			'1.5',
			'1e3',
			' 1',
			'1 ',
			'Infinity',
			'9007199254740992'
		])('should return 400 for invalid providerId %s', async (providerId) => {
			const event = createActionEvent(adminUser, { providerId });
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid provider ID' } });
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should disable provider instead of deleting when accounts exist', async () => {
			mockSelectSequence([[{ id: 1 }], [{ count: 3 }]]);
			mockUpdateReturning(mockDb, [{ id: 1 }]);

			const event = createActionEvent(adminUser, { providerId: '1' });
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({ success: true, disabled: true });
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should return 404 when provider disappears before disable fallback', async () => {
			mockSelectSequence([[{ id: 1 }], [{ count: 3 }]]);
			mockUpdateReturning(mockDb, []);

			const event = createActionEvent(adminUser, { providerId: '1' });
			const result = await actions.deleteProvider(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'Provider not found' } });
		});

		it('should return 404 when deleting a missing provider', async () => {
			mockSelectResult(mockDb, []);

			const event = createActionEvent(adminUser, { providerId: '99' });
			const result = await actions.deleteProvider(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'Provider not found' } });
			expect(mockDb.update).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should delete provider when no accounts linked', async () => {
			mockSelectSequence([[{ id: 1 }], [{ count: 0 }]]);
			mockDeleteReturning(mockDb, [{ id: 1 }]);

			const event = createActionEvent(adminUser, { providerId: '1' });
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({ success: true, deleted: true });
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it('should return 404 when provider disappears before delete', async () => {
			mockSelectSequence([[{ id: 1 }], [{ count: 0 }]]);
			mockDeleteReturning(mockDb, []);

			const event = createActionEvent(adminUser, { providerId: '1' });
			const result = await actions.deleteProvider(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'Provider not found' } });
		});
	});
});
