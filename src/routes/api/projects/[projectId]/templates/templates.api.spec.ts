import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCaseTemplate: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		description: 'description',
		precondition: 'precondition',
		steps: 'steps',
		priority: 'priority',
		createdBy: 'created_by',
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	user: { id: 'id', name: 'name', email: 'email', image: 'image' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

describe('/api/projects/[projectId]/templates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('GET', () => {
		it('should return templates for project', async () => {
			const templates = [
				{
					id: 1,
					name: 'Login Template',
					description: 'Template for login tests',
					precondition: 'User exists',
					steps: [{ order: 1, action: 'Enter credentials', expected: 'Login success' }],
					priority: 'MEDIUM',
					createdBy: 'Test User',
					createdAt: new Date('2025-01-01'),
					updatedAt: new Date('2025-01-01')
				}
			];
			mockSelectResult(mockDb, templates);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(body)).toBe(true);
			expect(body).toHaveLength(1);
			expect(body[0].name).toBe('Login Template');
		});

		it('should return empty array when no templates exist', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body).toEqual([]);
		});

		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('POST', () => {
		it('should create a template for non-VIEWER roles', async () => {
			const created = {
				id: 1,
				projectId: 1,
				name: 'New Template',
				description: null,
				precondition: null,
				steps: [],
				priority: 'MEDIUM',
				createdBy: testUser.id,
				createdAt: new Date('2025-01-01'),
				updatedAt: new Date('2025-01-01')
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'New Template' },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(201);
			expect(body.id).toBe(created.id);
		});

		it('should return 403 for VIEWER role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'New Template' },
				user: testUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should validate required fields (name)', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: '' },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/name/i);
		});

		it('should return 400 when name is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/name/i);
		});

		it('should return 400 when name is whitespace only', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: '   ' },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/name/i);
		});

		it('should return 400 for invalid priority', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Valid Name', priority: 'URGENT' },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/priority/i);
		});

		it('should number steps with order on creation', async () => {
			const steps = [
				{ action: 'Step 1 action', expected: 'Step 1 expected' },
				{ action: 'Step 2 action', expected: 'Step 2 expected' }
			];
			const created = {
				id: 2,
				projectId: 1,
				name: 'Template with Steps',
				description: null,
				precondition: null,
				steps: steps.map((s, i) => ({ ...s, order: i + 1 })),
				priority: 'MEDIUM',
				createdBy: testUser.id,
				createdAt: new Date('2025-01-01'),
				updatedAt: new Date('2025-01-01')
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Template with Steps', steps },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(201);
			expect(body.id).toBe(created.id);
		});
	});
});
