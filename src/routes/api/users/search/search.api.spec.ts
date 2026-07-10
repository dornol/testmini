import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	user: {
		id: 'id',
		name: 'name',
		email: 'email',
		approved: 'approved',
		banned: 'banned'
	},
	projectMember: {
		projectId: 'project_id',
		userId: 'user_id',
		role: 'role'
	},
	teamMember: {
		teamId: 'team_id',
		userId: 'user_id',
		role: 'role'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	ilike: vi.fn((a: unknown, b: unknown) => ['ilike', a, b]),
	or: vi.fn((...args: unknown[]) => args),
	notInArray: vi.fn((a: unknown, b: unknown) => ['notInArray', a, b]),
	count: vi.fn(() => 'count'),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

// Import after mocks
const { GET } = await import('./+server');
const drizzle = await import('drizzle-orm');
const authUtils = await import('$lib/server/auth-utils');

describe('/api/users/search', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		mockDb.query.teamMember = {
			findFirst: vi.fn().mockResolvedValue({ role: 'ADMIN' })
		};
	});

	describe('GET', () => {
		it('should return 400 when query is less than 2 characters', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'a' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toEqual([]);
		});

		it('should support offset parameter for pagination', async () => {
			const users = [
				{ id: 'user-5', name: 'Test User 5', email: 'user5@example.com' },
				{ id: 'user-6', name: 'Test User 6', email: 'user6@example.com' }
			];
			const selectChain = mockSelectResult(mockDb, users);

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', offset: '10', excludeProjectId: '42' }
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.data).toHaveLength(2);
			expect(mockDb.select).toHaveBeenCalled();
			expect(selectChain.offset).toHaveBeenCalledWith(10);
		});

		it('should cap large offset values', async () => {
			const selectChain = mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', offset: '999999', excludeProjectId: '42' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(selectChain.offset).toHaveBeenCalledWith(10000);
		});

		it('should trim query before searching', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: '  Alice  ', excludeProjectId: '42' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(drizzle.ilike).toHaveBeenCalledWith('name', '%Alice%');
			expect(drizzle.ilike).toHaveBeenCalledWith('email', '%Alice%');
		});

		it('should only return approved users that are not banned', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', excludeProjectId: '42' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(drizzle.eq).toHaveBeenCalledWith('approved', true);
			expect(drizzle.eq).toHaveBeenCalledWith('banned', false);
		});

		it('should return 400 for invalid offset', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', offset: 'abc' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should return 400 for negative offset', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', offset: '-1' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should return 400 for unsafe offset', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', offset: 'Infinity', excludeProjectId: '42' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should return 400 for invalid excludeProjectId', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', excludeProjectId: 'abc' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should return 400 for unsafe excludeProjectId', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', excludeProjectId: String(Number.MAX_SAFE_INTEGER + 1) }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should reject overlong queries before hitting the database', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'a'.repeat(101) }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should require a project or team context before searching users', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should reject requests with multiple search contexts', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', excludeProjectId: '42', teamId: '7' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should exclude existing project members using a validated project ID', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', excludeProjectId: '42' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(authUtils.requireProjectRole).toHaveBeenCalledWith(testUser, 42, ['PROJECT_ADMIN']);
			expect(drizzle.eq).toHaveBeenCalledWith('project_id', 42);
		});

		it('should exclude existing team members for team-admin searches', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', teamId: '7' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(mockDb.query.teamMember.findFirst).toHaveBeenCalled();
			expect(drizzle.eq).toHaveBeenCalledWith('team_id', 7);
			expect(drizzle.eq).toHaveBeenCalledWith('user_id', testUser.id);
		});

		it('should require team admin role when excluding existing team members', async () => {
			mockDb.query.teamMember.findFirst.mockResolvedValue({ role: 'MEMBER' });

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', teamId: '7' }
			});

			await expect(GET(event)).rejects.toThrow();
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should require project admin role when excluding existing project members', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(new Error('Forbidden'));

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', excludeProjectId: '42' }
			});

			await expect(GET(event)).rejects.toThrow('Forbidden');
			expect(authUtils.requireProjectRole).toHaveBeenCalledWith(testUser, 42, ['PROJECT_ADMIN']);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: null,
				searchParams: { q: 'test' }
			});
			await expect(GET(event)).rejects.toThrow();
		});
	});
});
