import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	oidcProvider: {
		slug: 'slug',
		enabled: 'enabled'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/crypto', () => ({
	encrypt: vi.fn((value: string) => `encrypted:${value}`)
}));
vi.mock('$env/dynamic/private', () => ({
	env: { ORIGIN: 'http://localhost:5173' }
}));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({
		info: vi.fn(),
		warn: vi.fn()
	})
}));

const { GET } = await import('./+server');

describe('OIDC authorization start', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('rejects malformed provider slugs before database or cookie access', async () => {
		const cookies = {
			set: vi.fn(),
			get: vi.fn(),
			delete: vi.fn()
		};

		await expect(
			GET({
				params: { slug: 'bad\nslug' },
				cookies,
				url: new URL('http://localhost:5173/auth/oidc/bad%0Aslug')
			} as never)
		).rejects.toMatchObject({ status: 404 });

		expect(mockDb.select).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
	});
});
