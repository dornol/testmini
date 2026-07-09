import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

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
	}
}));
vi.mock('$lib/server/db/auth.schema', () => ({
	account: {
		id: 'id',
		userId: 'user_id',
		providerId: 'provider_id'
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

function mockUnlinkTransaction(selectResults: unknown[][]) {
	let selectIndex = 0;
	const txDeleteWhere = vi.fn().mockResolvedValue(undefined);
	const txDelete = vi.fn(() => ({ where: txDeleteWhere }));
	const txSelect = vi.fn(() => chainWithResult(selectResults[selectIndex++]));
	mockDb.transaction.mockImplementationOnce(async (fn) =>
		fn({ select: txSelect, delete: txDelete })
	);
	return { txDeleteWhere, txDelete, txSelect };
}

describe('/auth/account +page.server', () => {
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
			const { txDeleteWhere, txDelete, txSelect } = mockUnlinkTransaction([
				[{ id: 7 }],
				[{ count: 2 }],
				[]
			]);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData('7'),
				user: testUser
			});

			const result = await actions.unlink(event);

			expect(result).toEqual({ success: true });
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
			expect(txSelect).toHaveBeenCalledTimes(3);
			expect(txDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'id' }));
			expect(txDeleteWhere).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 7],
					['user_id', testUser.id]
				])
			);
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});
});
