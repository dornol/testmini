import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';

const mockDb = createMockDb();
const mockSignInEmail = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
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
	asc: vi.fn((a: unknown) => a),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			signInEmail: mockSignInEmail
		}
	}
}));

const { actions } = await import('./+page.server');

function makeFormData(entries: Record<string, FormDataEntryValue>): FormData {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.set(key, value);
	}
	return formData;
}

describe('login page server actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('default', () => {
		it.each([
			[{ email: new File(['user@example.com'], 'email.txt'), password: 'secret123' }],
			[{ email: 'user@example.com', password: new File(['secret123'], 'password.txt') }]
		])('rejects non-text login field %# before calling auth', async (form) => {
			const event = createMockEvent({
				method: 'POST',
				formData: makeFormData(form)
			});

			const result = await actions.default(event);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Email and password are required.' }
			});
			expect(mockSignInEmail).not.toHaveBeenCalled();
		});

		it('passes text credentials to auth API', async () => {
			mockSignInEmail.mockResolvedValueOnce({});
			const event = createMockEvent({
				method: 'POST',
				formData: makeFormData({ email: 'user@example.com', password: 'secret123' })
			});

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 303,
				location: '/projects'
			});

			expect(mockSignInEmail).toHaveBeenCalledWith({
				body: { email: 'user@example.com', password: 'secret123' },
				headers: expect.any(Headers)
			});
		});
	});
});
