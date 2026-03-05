import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

vi.mock('$lib/server/db', () => ({ db: {} }));

const { POST } = await import('./+server');

describe('/api/admin/oidc-providers/discover', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 403 for non-admin user', async () => {
		const event = createMockEvent({
			method: 'POST',
			body: { issuerUrl: 'https://accounts.google.com' },
			user: testUser
		});
		await expect(POST(event)).rejects.toThrow();
		try {
			await POST(event);
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});

	it('should return 400 when issuerUrl is missing', async () => {
		const event = createMockEvent({
			method: 'POST',
			body: {},
			user: adminUser
		});
		await expect(POST(event)).rejects.toThrow();
		try {
			await POST(event);
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});
});
