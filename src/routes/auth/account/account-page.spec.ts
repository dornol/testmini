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
	});
});
