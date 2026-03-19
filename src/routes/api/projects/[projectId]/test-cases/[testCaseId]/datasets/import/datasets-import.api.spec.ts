import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireTestCase = vi.fn().mockResolvedValue({ id: 10, projectId: 1 });

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
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
vi.mock('$lib/server/queries', () => ({
	requireTestCase: mockRequireTestCase
}));

const { POST } = await import('./+server');

const PARAMS = { projectId: '1', testCaseId: '10' };

function createCsvFormData(csvContent: string): FormData {
	const formData = new FormData();
	const file = new File([csvContent], 'data.csv', { type: 'text/csv' });
	formData.append('file', file);
	return formData;
}

describe('/api/projects/[projectId]/test-cases/[testCaseId]/datasets/import', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireTestCase.mockResolvedValue({ id: 10, projectId: 1 });
	});

	it('should return 401 when not authenticated', async () => {
		const formData = createCsvFormData('a,b\n1,2');
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData, user: null });
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 400 when no file is provided', async () => {
		const formData = new FormData();
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData, user: testUser });
		const response = await POST(event);
		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('CSV file is required');
	});

	it('should return 400 when CSV has only header (no data rows)', async () => {
		const formData = createCsvFormData('param1,param2');
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData, user: testUser });
		const response = await POST(event);
		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('header row and at least one data row');
	});

	it('should import CSV with new parameters and datasets', async () => {
		// Mock existing params (none)
		let selectCallCount = 0;
		mockDb.select.mockImplementation(() => {
			selectCallCount++;
			const chain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			};
			return chain as never;
		});

		// Mock insert for parameters and datasets
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		const csv = 'browser,os\nChrome,Windows\nFirefox,Linux';
		const formData = createCsvFormData(csv);
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData, user: testUser });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.imported).toBe(2);
	});

	it('should handle CSV with quoted fields', async () => {
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

		const csv = 'name,value\n"Hello, World","with ""quotes"""';
		const formData = createCsvFormData(csv);
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData, user: testUser });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.imported).toBe(1);
	});

	it('should skip creating parameters that already exist', async () => {
		let selectCallCount = 0;
		mockDb.select.mockImplementation(() => {
			selectCallCount++;
			const chain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => {
					// First select: existing params
					if (selectCallCount === 1) {
						return Promise.resolve([{ id: 1, name: 'browser', orderIndex: 0, testCaseId: 10 }]).then(r);
					}
					// Second select: existing datasets
					return Promise.resolve([]).then(r);
				}
			};
			return chain as never;
		});

		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		const csv = 'browser,os\nChrome,Windows';
		const formData = createCsvFormData(csv);
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData, user: testUser });
		const response = await POST(event);

		expect(response.status).toBe(200);
	});
});
