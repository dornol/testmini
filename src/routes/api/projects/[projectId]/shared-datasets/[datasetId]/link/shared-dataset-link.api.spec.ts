import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	sharedDataSet: { id: 'id', projectId: 'project_id', parameters: 'parameters', rows: 'rows' },
	testCase: { id: 'id', projectId: 'project_id' },
	testCaseParameter: {
		id: 'id', testCaseId: 'test_case_id', name: 'name', orderIndex: 'order_index'
	},
	testCaseDataSet: {
		id: 'id', testCaseId: 'test_case_id', name: 'name', values: 'values', orderIndex: 'order_index'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => ['asc', a])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { POST } = await import('./+server');

const PARAMS = { projectId: '1', datasetId: '5' };

const sampleSharedDataSet = {
	id: 5,
	projectId: 1,
	name: 'Login Credentials',
	parameters: ['username', 'password'],
	rows: [
		{ username: 'admin', password: 'admin123' },
		{ username: 'user', password: 'user123' }
	]
};

describe('/api/projects/[projectId]/shared-datasets/[datasetId]/link', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.sharedDataSet = { findFirst: vi.fn() };
		mockDb.query.testCase = { findFirst: vi.fn() };
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({
			method: 'POST', params: PARAMS, body: { testCaseId: 10 }, user: null
		});
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 404 when shared dataset not found', async () => {
		(mockDb.query.sharedDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		const event = createMockEvent({
			method: 'POST', params: PARAMS, body: { testCaseId: 10 }, user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(404);
	});

	it('should return 400 when testCaseId is missing', async () => {
		(mockDb.query.sharedDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSharedDataSet);
		const event = createMockEvent({
			method: 'POST', params: PARAMS, body: {}, user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('testCaseId is required');
	});

	it('should return 404 when test case not found', async () => {
		(mockDb.query.sharedDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSharedDataSet);
		(mockDb.query.testCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		const event = createMockEvent({
			method: 'POST', params: PARAMS, body: { testCaseId: 999 }, user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(404);
	});

	it('should link shared dataset to test case and return linked count', async () => {
		(mockDb.query.sharedDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSharedDataSet);
		(mockDb.query.testCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 10, projectId: 1 });

		// Mock select for existing parameters (none) and existing datasets (none)
		mockDb.select.mockImplementation(() => {
			const chain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			};
			return chain as never;
		});

		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		const event = createMockEvent({
			method: 'POST', params: PARAMS, body: { testCaseId: 10 }, user: testUser
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.linked).toBe(2);
	});

	it('should handle shared dataset with no rows', async () => {
		const emptyDs = { ...sampleSharedDataSet, rows: [] };
		(mockDb.query.sharedDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(emptyDs);
		(mockDb.query.testCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 10, projectId: 1 });

		mockDb.select.mockImplementation(() => {
			const chain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			};
			return chain as never;
		});

		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		const event = createMockEvent({
			method: 'POST', params: PARAMS, body: { testCaseId: 10 }, user: testUser
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.linked).toBe(0);
	});
});
