import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	projectApiKey: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		prefix: 'prefix',
		keyHash: 'key_hash',
		lastUsedAt: 'last_used_at',
		createdBy: 'created_by',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	desc: vi.fn((a: unknown) => ['desc', a])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});
vi.mock('$lib/server/api-key-auth', () => ({
	generateApiKey: vi.fn().mockReturnValue('tmk_abcdef1234567890abcdef1234567890'),
	hashApiKey: vi.fn().mockReturnValue('hashed-key-value')
}));

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

const sampleKeys = [
	{
		id: 1,
		name: 'CI Key',
		prefix: 'tmk_abcdef12',
		lastUsedAt: null,
		createdBy: 'user-1',
		createdAt: new Date('2025-01-01')
	},
	{
		id: 2,
		name: 'Dev Key',
		prefix: 'tmk_12345678',
		lastUsedAt: new Date('2025-06-01'),
		createdBy: 'user-1',
		createdAt: new Date('2025-02-01')
	}
];

describe('/api/projects/[projectId]/api-keys', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('GET - list keys', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return list of API keys', async () => {
			mockSelectResult(mockDb, sampleKeys);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toHaveLength(2);
			expect(data[0].name).toBe('CI Key');
			expect(data[1].name).toBe('Dev Key');
		});

		it('should return empty array when no keys exist', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual([]);
		});

		it('should not expose key hashes in response', async () => {
			mockSelectResult(mockDb, sampleKeys);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			for (const key of data) {
				expect(key).not.toHaveProperty('keyHash');
			}
		});
	});

	describe('POST - create key', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Test Key' },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should create a new API key successfully', async () => {
			const created = {
				id: 3,
				name: 'New Key',
				prefix: 'tmk_abcdef12',
				createdAt: new Date('2025-06-01')
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'New Key' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.id).toBe(3);
			expect(data.name).toBe('New Key');
			expect(data.key).toBe('tmk_abcdef1234567890abcdef1234567890');
			expect(data.prefix).toBe('tmk_abcdef12');
		});

		it('should return 400 when name is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when name is empty string', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: '   ' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when name exceeds 100 characters', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'a'.repeat(101) },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should reject request with invalid project ID', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: 'abc' },
				body: { name: 'Key' },
				user: testUser
			});

			await expect(POST(event)).rejects.toThrow();
		});
	});
});
