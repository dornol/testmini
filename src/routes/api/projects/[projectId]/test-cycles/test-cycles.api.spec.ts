import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockInsertReturning,
	mockSelectResult
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testCycle: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		cycleNumber: 'cycle_number',
		status: 'status',
		releaseId: 'release_id',
		startDate: 'start_date',
		endDate: 'end_date',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	testRun: { id: 'id', testCycleId: 'test_cycle_id' },
	release: { id: 'id', projectId: 'project_id' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	),
	count: vi.fn(() => 'count')
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET, POST } = await import('./+server');

describe('/api/projects/[projectId]/test-cycles', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.testCycle = { findFirst: vi.fn().mockResolvedValue(null) };
	});

	describe('GET', () => {
		it('should return cycles list', async () => {
			mockSelectResult(mockDb, [
				{ id: 1, name: 'Cycle 1', cycleNumber: 1, status: 'PLANNED', runCount: 0 }
			]);

			const event = createMockEvent({
				params: { projectId: '1' },
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toHaveLength(1);
			expect(data[0].name).toBe('Cycle 1');
		});
	});

	describe('POST', () => {
		it('should create a new cycle', async () => {
			const created = { id: 1, name: 'Cycle 1', cycleNumber: 1, status: 'PLANNED' };
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Cycle 1', cycleNumber: 1 },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.name).toBe('Cycle 1');
		});

		it('should trim name before creating a cycle', async () => {
			const created = { id: 1, name: 'Cycle 1', cycleNumber: 1, status: 'PLANNED' };
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: '  Cycle 1  ', cycleNumber: 1 },
				user: testUser
			});
			await POST(event);

			expect(mockDb.insert().values).toHaveBeenCalledWith(
				expect.objectContaining({ name: 'Cycle 1' })
			);
		});

		it('should return 409 for duplicate cycle number', async () => {
			mockDb.query.testCycle.findFirst.mockResolvedValue({ id: 1 });

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Cycle 2', cycleNumber: 1 },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(409);
		});

		it('should reject releaseId outside the project before creating a cycle', async () => {
			mockDb.query.release.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Cycle 2', cycleNumber: 2, releaseId: 999 },
				user: testUser
			});

			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toContain('Release not found');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return 400 for missing name', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { cycleNumber: 1 },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should reject non-object JSON before creating a cycle', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: ['not', 'an', 'object'],
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.query.testCycle.findFirst).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return 400 for missing cycleNumber', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Cycle 1' },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 for whitespace-only name', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: '   ', cycleNumber: 1 },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
			expect(mockDb.query.testCycle.findFirst).not.toHaveBeenCalled();
		});

		it('should return 400 for invalid start date', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Cycle 1', cycleNumber: 1, startDate: 'not-a-date' },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
			expect(mockDb.query.testCycle.findFirst).not.toHaveBeenCalled();
		});

		it('should return 400 when endDate is before startDate', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Cycle 1', cycleNumber: 1, startDate: '2026-02-02', endDate: '2026-02-01' },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
			expect(mockDb.query.testCycle.findFirst).not.toHaveBeenCalled();
		});

		it('should return 401 for unauthenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Cycle 1', cycleNumber: 1 },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});
	});
});
