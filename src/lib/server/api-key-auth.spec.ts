import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({
	db: mockDb
}));
vi.mock('$lib/server/db/schema', () => ({
	projectApiKey: {
		id: 'id',
		keyHash: 'key_hash',
		projectId: 'project_id',
		lastUsedAt: 'last_used_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

const { hashApiKey, generateApiKey, authenticateApiKey } = await import('./api-key-auth');

describe('api-key-auth', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('generateApiKey', () => {
		it('should generate a key with tmk_ prefix', () => {
			const key = generateApiKey();
			expect(key.startsWith('tmk_')).toBe(true);
		});

		it('should generate a key with 36 total characters (tmk_ + 32 hex)', () => {
			const key = generateApiKey();
			expect(key.length).toBe(36);
		});

		it('should generate unique keys', () => {
			const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
			expect(keys.size).toBe(10);
		});

		it('should only contain valid hex characters after prefix', () => {
			const key = generateApiKey();
			const hex = key.slice(4);
			expect(hex).toMatch(/^[0-9a-f]{32}$/);
		});
	});

	describe('hashApiKey', () => {
		it('should return a SHA-256 hex digest', () => {
			const hash = hashApiKey('tmk_abc123');
			expect(hash).toMatch(/^[0-9a-f]{64}$/);
		});

		it('should produce consistent hashes', () => {
			const hash1 = hashApiKey('tmk_test123');
			const hash2 = hashApiKey('tmk_test123');
			expect(hash1).toBe(hash2);
		});

		it('should produce different hashes for different keys', () => {
			const hash1 = hashApiKey('tmk_key1');
			const hash2 = hashApiKey('tmk_key2');
			expect(hash1).not.toBe(hash2);
		});
	});

	describe('authenticateApiKey', () => {
		it('should return null when no authorization header', async () => {
			const request = new Request('http://localhost', {
				method: 'GET'
			});

			const result = await authenticateApiKey(request);
			expect(result).toBeNull();
		});

		it('should return null for non-Bearer auth', async () => {
			const request = new Request('http://localhost', {
				method: 'GET',
				headers: { Authorization: 'Basic abc123' }
			});

			const result = await authenticateApiKey(request);
			expect(result).toBeNull();
		});

		it('should return null for non-tmk_ key', async () => {
			const request = new Request('http://localhost', {
				method: 'GET',
				headers: { Authorization: 'Bearer sk_abc123' }
			});

			const result = await authenticateApiKey(request);
			expect(result).toBeNull();
		});

		it('should return null when key not found in database', async () => {
			mockDb.query.projectApiKey = { findFirst: vi.fn().mockResolvedValue(null) };

			const request = new Request('http://localhost', {
				method: 'GET',
				headers: { Authorization: 'Bearer tmk_0123456789abcdef0123456789abcdef' }
			});

			const result = await authenticateApiKey(request);
			expect(result).toBeNull();
		});

		it('should return projectId and keyId on valid key', async () => {
			const mockRecord = { id: 42, projectId: 7 };
			mockDb.query.projectApiKey = { findFirst: vi.fn().mockResolvedValue(mockRecord) };

			// Mock update for lastUsedAt (fire-and-forget)
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				catch: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const request = new Request('http://localhost', {
				method: 'GET',
				headers: { Authorization: 'Bearer tmk_0123456789abcdef0123456789abcdef' }
			});

			const result = await authenticateApiKey(request);
			expect(result).toEqual({ projectId: 7, keyId: 42 });
		});

		it('should trim whitespace from key', async () => {
			const mockRecord = { id: 1, projectId: 1 };
			mockDb.query.projectApiKey = { findFirst: vi.fn().mockResolvedValue(mockRecord) };

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				catch: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const request = new Request('http://localhost', {
				method: 'GET',
				headers: { Authorization: 'Bearer tmk_0123456789abcdef0123456789abcdef  ' }
			});

			const result = await authenticateApiKey(request);
			expect(result).not.toBeNull();
		});

		it('should return null for empty bearer token', async () => {
			const request = new Request('http://localhost', {
				method: 'GET',
				headers: { Authorization: 'Bearer ' }
			});

			const result = await authenticateApiKey(request);
			expect(result).toBeNull();
		});
	});
});
