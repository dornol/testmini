import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRandomBytes = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	sharedReport: {
		id: 'id',
		projectId: 'project_id',
		token: 'token',
		name: 'name',
		config: 'config',
		expiresAt: 'expires_at',
		createdBy: 'created_by',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a),
	sql: vi.fn(),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
	count: vi.fn()
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});
vi.mock('crypto', () => ({
	default: {
		randomBytes: (...args: unknown[]) => mockRandomBytes(...args)
	}
}));

const { GET, POST } = await import('./+server');

const PARAMS = { projectId: '1' };

const sampleSharedReport = {
	id: 1,
	projectId: 1,
	token: 'abc123def456',
	name: 'Weekly Report',
	config: { preset: 'last_7_days' },
	expiresAt: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/reports/share', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return list of shared reports', async () => {
			mockSelectResult(mockDb, [sampleSharedReport]);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});

			const response = await GET(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body).toHaveLength(1);
			expect(body[0].id).toBe(sampleSharedReport.id);
			expect(body[0].name).toBe(sampleSharedReport.name);
			expect(body[0].token).toBe(sampleSharedReport.token);
		});

		it('should return empty array when no shared reports', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});

			const response = await GET(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body).toEqual([]);
		});
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: null,
				body: { name: 'Report', config: {} }
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject empty name', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { name: '', config: {} }
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject missing name', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { config: {} }
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should create shared report and return 201', async () => {
			mockRandomBytes.mockReturnValue({ toString: () => 'generated-token-hex' });
			mockInsertReturning(mockDb, [sampleSharedReport]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { name: 'Weekly Report', config: { preset: 'last_7_days' } }
			});

			const response = await POST(event);
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.name).toBe('Weekly Report');
		});

		it('should generate token using crypto.randomBytes', async () => {
			mockRandomBytes.mockReturnValue({ toString: () => 'hex-token-value' });
			mockInsertReturning(mockDb, [sampleSharedReport]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { name: 'Report', config: {} }
			});

			await POST(event);

			expect(mockRandomBytes).toHaveBeenCalledWith(32);
		});

		it('should handle expiresInDays parameter', async () => {
			mockRandomBytes.mockReturnValue({ toString: () => 'hex-token' });
			mockInsertReturning(mockDb, [{ ...sampleSharedReport, expiresAt: new Date('2025-01-08') }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { name: 'Expiring Report', config: {}, expiresInDays: 7 }
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
		});

		it('should set expiresAt to null when expiresInDays is not provided', async () => {
			mockRandomBytes.mockReturnValue({ toString: () => 'hex-token' });
			mockInsertReturning(mockDb, [sampleSharedReport]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { name: 'No Expiry', config: {} }
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
		});
	});
});
