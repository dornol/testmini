import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser, sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	project: {
		id: 'id',
		name: 'name',
		description: 'description',
		active: 'active',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	projectMember: { projectId: 'project_id', userId: 'user_id', role: 'role' },
	auditLog: { id: 'id' },
	priorityConfig: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		color: 'color',
		position: 'position',
		isDefault: 'is_default',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	environmentConfig: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		color: 'color',
		position: 'position',
		isDefault: 'is_default',
		createdBy: 'created_by',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	ilike: vi.fn((a: unknown, b: unknown) => ['ilike', a, b]),
	count: vi.fn(() => 'count'),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));

// Import after mocks
const { GET, POST } = await import('./+server');
const drizzle = await import('drizzle-orm');

describe('/api/projects', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return paginated projects for admin', async () => {
			const projects = [{ ...sampleProject, memberCount: 2 }];
			// First select call returns projects, second returns count
			let callCount = 0;
			mockDb.select.mockImplementation(() => {
				callCount++;
				if (callCount % 2 === 0) {
					// count query
					return mockSelectResult(mockDb, [{ total: 1 }]) as never;
				}
				return mockSelectResult(mockDb, projects) as never;
			});

			const event = createMockEvent({ method: 'GET', user: adminUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.data).toHaveLength(1);
			expect(data.data[0].id).toBe(sampleProject.id);
			expect(data.data[0].name).toBe(sampleProject.name);
			expect(data.meta).toMatchObject({ page: 1, limit: 12 });
		});

		it('should cap large limit values and calculate offset from validated page', async () => {
			const projectsChain = mockSelectResult(mockDb, []);
			mockDb.select.mockReturnValueOnce(projectsChain as never);
			const countChain = mockSelectResult(mockDb, [{ total: 0 }]);
			mockDb.select.mockReturnValueOnce(countChain as never);

			const event = createMockEvent({
				method: 'GET',
				user: adminUser,
				searchParams: { page: '3', limit: '999' }
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.meta).toMatchObject({ page: 3, limit: 50 });
			expect(projectsChain.limit).toHaveBeenCalledWith(50);
			expect(projectsChain.offset).toHaveBeenCalledWith(100);
		});

		it('should apply search parameter', async () => {
			mockDb.select.mockImplementation(() => {
				return mockSelectResult(mockDb, []) as never;
			});

			const event = createMockEvent({
				method: 'GET',
				user: adminUser,
				searchParams: { search: 'test', page: '1', limit: '10' }
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.data).toEqual([]);
		});

		it('should trim search before applying filter', async () => {
			mockDb.select.mockImplementation(() => {
				return mockSelectResult(mockDb, []) as never;
			});

			const event = createMockEvent({
				method: 'GET',
				user: adminUser,
				searchParams: { search: '  test  ' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(drizzle.ilike).toHaveBeenCalledWith('name', '%test%');
		});

		it('should return 400 for invalid page before querying projects', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: adminUser,
				searchParams: { page: 'abc' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should return 400 for zero limit before querying projects', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: adminUser,
				searchParams: { limit: '0' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should return 400 for unsafe page before querying projects', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: adminUser,
				searchParams: { page: String(Number.MAX_SAFE_INTEGER + 1) }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it.each([
			['page', '01'],
			['page', '1e3'],
			['page', '+1'],
			['page', ' 1'],
			['limit', '01'],
			['limit', '1e3'],
			['limit', '12 ']
		])(
			'should return 400 for non-canonical %s value %s before querying projects',
			async (key, value) => {
				const event = createMockEvent({
					method: 'GET',
					user: adminUser,
					searchParams: { [key]: value }
				});
				const response = await GET(event);

				expect(response.status).toBe(400);
				expect(mockDb.select).not.toHaveBeenCalled();
			}
		);

		it('should return 400 for overlong search before querying projects', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: adminUser,
				searchParams: { search: 'a'.repeat(101) }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should filter by active=false', async () => {
			mockDb.select.mockImplementation(() => {
				return mockSelectResult(mockDb, []) as never;
			});

			const event = createMockEvent({
				method: 'GET',
				user: adminUser,
				searchParams: { active: 'false' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
		});

		it('should restrict non-admin to member projects', async () => {
			mockDb.select.mockImplementation(() => {
				return mockSelectResult(mockDb, []) as never;
			});

			const event = createMockEvent({ method: 'GET', user: testUser });
			const response = await GET(event);

			expect(response.status).toBe(200);
			// For non-admin, inArray subquery is added
			expect(mockDb.select).toHaveBeenCalled();
		});
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'POST', body: { name: 'Test' }, user: null });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 for invalid body', async () => {
			const event = createMockEvent({ method: 'POST', body: { name: '' }, user: testUser });
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBeDefined();
		});

		it('should return 400 for missing name', async () => {
			const event = createMockEvent({ method: 'POST', body: {}, user: testUser });
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should create project with 201 via transaction', async () => {
			const created = { ...sampleProject, id: 99 };
			let capturedTx: { insert: ReturnType<typeof vi.fn> } | null = null;
			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockResolvedValue([created]),
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) => Promise.resolve([created]).then(r);
				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain)
				};
				capturedTx = tx;
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				body: { name: 'New Project', description: 'desc' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.data.id).toBe(created.id);
			expect(data.data.name).toBe(created.name);

			// Verify transaction received tx and called insert for:
			// 1. project, 2. projectMember, 3. priorityConfig, 4. environmentConfig
			expect(capturedTx).not.toBeNull();
			expect(capturedTx!.insert).toHaveBeenCalledTimes(4);
		});
	});
});
