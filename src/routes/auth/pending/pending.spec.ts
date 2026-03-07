/**
 * Tests for the /auth/pending page server logic.
 * - Not logged in → redirect to /auth/login
 * - Logged in + approved → redirect to /projects
 * - Logged in + not approved → show pending page data
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/auth.schema', () => ({
	user: {
		id: 'id',
		approved: 'approved'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

const { load } = await import('./+page.server');

describe('/auth/pending load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should redirect to /auth/login when user is not logged in', async () => {
		const event = {
			locals: { user: undefined, session: undefined, requestId: 'test' }
		} as never;

		try {
			await load(event);
			expect.unreachable('Should have thrown a redirect');
		} catch (e: unknown) {
			const err = e as { status: number; location: string };
			expect(err.status).toBe(302);
			expect(err.location).toBe('/auth/login');
		}
	});

	it('should redirect to /projects when user is already approved', async () => {
		mockSelectResult(mockDb, [{ approved: true }]);

		const event = {
			locals: {
				user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
				session: { id: 'session-1' },
				requestId: 'test'
			}
		} as never;

		try {
			await load(event);
			expect.unreachable('Should have thrown a redirect');
		} catch (e: unknown) {
			const err = e as { status: number; location: string };
			expect(err.status).toBe(302);
			expect(err.location).toBe('/projects');
		}
	});

	it('should return user info when user is pending approval', async () => {
		mockSelectResult(mockDb, [{ approved: false }]);

		const event = {
			locals: {
				user: { id: 'user-1', name: 'Pending User', email: 'pending@example.com' },
				session: { id: 'session-1' },
				requestId: 'test'
			}
		} as never;

		const result = await load(event);

		expect(result).toEqual({
			userName: 'Pending User',
			userEmail: 'pending@example.com'
		});
	});

	it('should query the database for the current user approval status', async () => {
		mockSelectResult(mockDb, [{ approved: false }]);

		const event = {
			locals: {
				user: { id: 'user-42', name: 'User', email: 'u@test.com' },
				session: { id: 'session-1' },
				requestId: 'test'
			}
		} as never;

		await load(event);

		// Ensure db.select was called
		expect(mockDb.select).toHaveBeenCalled();
	});
});
