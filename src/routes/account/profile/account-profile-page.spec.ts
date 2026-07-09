import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockChangePassword = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	oidcProvider: {
		id: 'id',
		name: 'name',
		slug: 'slug',
		iconUrl: 'icon_url',
		displayOrder: 'display_order',
		enabled: 'enabled'
	},
	oidcAccount: {
		id: 'id',
		userId: 'user_id',
		providerId: 'provider_id',
		externalId: 'external_id',
		email: 'email',
		name: 'name'
	},
	userPreference: {
		userId: 'user_id'
	}
}));
vi.mock('$lib/server/db/auth.schema', () => ({
	account: {
		id: 'id',
		userId: 'user_id',
		providerId: 'provider_id'
	},
	user: {
		id: 'id',
		name: 'name',
		email: 'email',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => ['asc', a]),
	count: vi.fn(() => 'count')
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn().mockReturnValue(testUser)
}));
vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			changePassword: (...args: unknown[]) => mockChangePassword(...args)
		}
	}
}));

const { actions } = await import('./+page.server');

function createFormData(accountId: string): FormData {
	const formData = new FormData();
	formData.set('accountId', accountId);
	return formData;
}

function chainWithResult(result: unknown[]) {
	const chain: Record<string, unknown> = {};
	for (const method of ['from', 'where', 'innerJoin', 'orderBy']) {
		chain[method] = vi.fn().mockReturnValue(chain);
	}
	chain.then = (resolve: (value: unknown[]) => void) => Promise.resolve(result).then(resolve);
	return chain;
}

describe('/account/profile +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('actions.unlink', () => {
		it.each(['', '0', '-1', '1.5', 'Infinity', '9007199254740992'])(
			'should reject invalid accountId %s before querying ownership',
			async (accountId) => {
				const event = createMockEvent({
					method: 'POST',
					formData: createFormData(accountId),
					user: testUser
				});

				const result = await actions.unlink(event);

				expect(result).toMatchObject({ status: 400, data: { error: 'Invalid account ID' } });
				expect(mockDb.select).not.toHaveBeenCalled();
				expect(mockDb.delete).not.toHaveBeenCalled();
			}
		);

		it('should scope the unlink delete to the authenticated user', async () => {
			const ownershipChain = chainWithResult([{ id: 7 }]);
			const oidcCountChain = chainWithResult([{ count: 2 }]);
			const passwordChain = chainWithResult([]);
			mockDb.select
				.mockReturnValueOnce(ownershipChain as never)
				.mockReturnValueOnce(oidcCountChain as never)
				.mockReturnValueOnce(passwordChain as never);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData('7'),
				user: testUser
			});

			const result = await actions.unlink(event);

			expect(result).toEqual({ unlinkSuccess: true });
			expect(mockDb._chains.delete.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 7],
					['user_id', testUser.id]
				])
			);
		});
	});
});
