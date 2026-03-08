import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	userPreference: {
		userId: 'user_id',
		locale: 'locale',
		theme: 'theme',
		notificationSettings: 'notification_settings',
		updatedAt: 'updated_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

// Import after mocks
const { GET, PUT } = await import('./+server');

describe('/api/users/me/preferences', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return user preferences', async () => {
			const savedPreferences = {
				userId: testUser.id,
				locale: 'ko',
				theme: 'dark'
			};
			mockDb.query.userPreference = { findFirst: vi.fn().mockResolvedValue(savedPreferences) };

			const event = createMockEvent({ method: 'GET', user: testUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.userId).toBe(testUser.id);
			expect(data.locale).toBe('ko');
			expect(data.theme).toBe('dark');
		});

		it('should return defaults when no preferences saved', async () => {
			mockDb.query.userPreference = { findFirst: vi.fn().mockResolvedValue(undefined) };

			const event = createMockEvent({ method: 'GET', user: testUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.userId).toBe(testUser.id);
			expect(data.locale).toBeNull();
			expect(data.theme).toBeNull();
			expect(data.notificationSettings).toBeNull();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ method: 'GET', user: null });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('PUT', () => {
		it('should save preferences', async () => {
			const updatedPreferences = {
				userId: testUser.id,
				locale: 'en',
				theme: 'light'
			};
			mockInsertReturning(mockDb, [updatedPreferences]);
			mockDb.query.userPreference = { findFirst: vi.fn().mockResolvedValue(updatedPreferences) };

			const event = createMockEvent({
				method: 'PUT',
				body: { locale: 'en', theme: 'light' },
				user: testUser
			});
			const response = await PUT(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.userId).toBe(testUser.id);
			expect(data.locale).toBe('en');
			expect(data.theme).toBe('light');
			expect(mockDb.insert).toHaveBeenCalled();
		});

		it('should save notification settings', async () => {
			const updatedPreferences = {
				userId: testUser.id,
				locale: null,
				theme: null,
				notificationSettings: { enableInApp: false, mutedTypes: ['TEST_FAILED'] }
			};
			mockInsertReturning(mockDb, [updatedPreferences]);
			mockDb.query.userPreference = { findFirst: vi.fn().mockResolvedValue(updatedPreferences) };

			const event = createMockEvent({
				method: 'PUT',
				body: { notificationSettings: { enableInApp: false, mutedTypes: ['TEST_FAILED'] } },
				user: testUser
			});
			const response = await PUT(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.notificationSettings.enableInApp).toBe(false);
			expect(data.notificationSettings.mutedTypes).toEqual(['TEST_FAILED']);
		});

		it('should reject invalid notificationSettings', async () => {
			const event = createMockEvent({
				method: 'PUT',
				body: { notificationSettings: { enableInApp: 'yes' } },
				user: testUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should reject invalid mutedTypes', async () => {
			const event = createMockEvent({
				method: 'PUT',
				body: { notificationSettings: { mutedTypes: [123] } },
				user: testUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'PUT',
				body: { locale: 'en', theme: 'light' },
				user: null
			});
			await expect(PUT(event)).rejects.toThrow();
		});
	});
});
