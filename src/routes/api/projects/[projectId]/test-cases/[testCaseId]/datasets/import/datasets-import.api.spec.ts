import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockSelectResult,
	mockInsertReturning
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireTestCase = vi.fn().mockResolvedValue({ id: 10, projectId: 1 });

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testCaseParameter: {
		id: 'id',
		testCaseId: 'test_case_id',
		name: 'name',
		orderIndex: 'order_index'
	},
	testCaseDataSet: {
		id: 'id',
		testCaseId: 'test_case_id',
		name: 'name',
		values: 'values',
		orderIndex: 'order_index'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => ['asc', a])
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

function createFileFormData(file: File): FormData {
	const formData = new FormData();
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

	it('should reject oversized multipart bodies before parsing form data', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			headers: { 'content-length': String(11 * 1024 * 1024 + 1) },
			user: testUser
		});

		await expect(POST(event)).rejects.toMatchObject({ status: 413 });
		expect(mockDb.insert).not.toHaveBeenCalled();
	});

	it('should return 400 when CSV has only header (no data rows)', async () => {
		const formData = createCsvFormData('param1,param2');
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData, user: testUser });
		const response = await POST(event);
		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('header row and at least one data row');
	});

	it('should return 400 when CSV file exceeds the size limit', async () => {
		const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'data.csv', {
			type: 'text/csv'
		});
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			formData: createFileFormData(oversized),
			user: testUser
		});

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toContain('must not exceed 10MB');
		expect(mockDb.insert).not.toHaveBeenCalled();
	});

	it('should return 400 when CSV has too many data rows', async () => {
		const csv = `param\n${Array.from({ length: 5001 }, (_, i) => `value-${i}`).join('\n')}`;
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			formData: createCsvFormData(csv),
			user: testUser
		});

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toContain('5000 data rows or fewer');
		expect(mockDb.insert).not.toHaveBeenCalled();
	});

	it('should return 400 when CSV has too many columns', async () => {
		const headers = Array.from({ length: 101 }, (_, i) => `param${i}`).join(',');
		const values = Array.from({ length: 101 }, (_, i) => `value${i}`).join(',');
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			formData: createCsvFormData(`${headers}\n${values}`),
			user: testUser
		});

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toContain('100 columns or fewer');
		expect(mockDb.insert).not.toHaveBeenCalled();
	});

	it('should return 400 when CSV has an empty header', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			formData: createCsvFormData('param1,\nvalue1,value2'),
			user: testUser
		});

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toContain('headers cannot be empty');
		expect(mockDb.insert).not.toHaveBeenCalled();
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

		const firstParamConflict = vi.fn().mockResolvedValue([]);
		const secondParamConflict = vi.fn().mockResolvedValue([]);
		const firstParamValues = vi.fn(() => ({ onConflictDoNothing: firstParamConflict }));
		const secondParamValues = vi.fn(() => ({ onConflictDoNothing: secondParamConflict }));
		const dataSetReturning = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
		const dataSetValues = vi.fn().mockReturnValue({ returning: dataSetReturning });
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({ values: firstParamValues })
			.mockReturnValueOnce({ values: secondParamValues })
			.mockReturnValueOnce({ values: dataSetValues });
		mockDb.transaction.mockImplementationOnce(async (fn) => fn({ insert: txInsert }));

		const csv = 'browser,os\nChrome,Windows\nFirefox,Linux';
		const formData = createCsvFormData(csv);
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData, user: testUser });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.imported).toBe(2);
		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		expect(txInsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'name' }));
		expect(firstParamValues).toHaveBeenCalledWith({
			testCaseId: 10,
			name: 'browser',
			orderIndex: 0
		});
		expect(firstParamConflict).toHaveBeenCalledTimes(1);
		expect(txInsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'name' }));
		expect(secondParamValues).toHaveBeenCalledWith({
			testCaseId: 10,
			name: 'os',
			orderIndex: 1
		});
		expect(secondParamConflict).toHaveBeenCalledTimes(1);
		expect(txInsert).toHaveBeenNthCalledWith(3, expect.objectContaining({ values: 'values' }));
		expect(dataSetValues).toHaveBeenCalledWith([
			{
				testCaseId: 10,
				name: null,
				values: { browser: 'Chrome', os: 'Windows' },
				orderIndex: 0
			},
			{
				testCaseId: 10,
				name: null,
				values: { browser: 'Firefox', os: 'Linux' },
				orderIndex: 1
			}
		]);
		expect(dataSetReturning).toHaveBeenCalledWith({ id: 'id' });
		expect(mockDb.insert).not.toHaveBeenCalled();
	});

	it('should return 500 when data set insert creates fewer rows than requested', async () => {
		mockDb.select.mockImplementation(() => {
			const chain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			};
			return chain as never;
		});

		const paramConflict = vi.fn().mockResolvedValue([]);
		const paramValues = vi.fn(() => ({ onConflictDoNothing: paramConflict }));
		const dataSetValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: 1 }])
		});
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({ values: paramValues })
			.mockReturnValueOnce({ values: paramValues })
			.mockReturnValueOnce({ values: dataSetValues });
		mockDb.transaction.mockImplementationOnce(async (fn) => fn({ insert: txInsert }));

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			formData: createCsvFormData('browser,os\nChrome,Windows\nFirefox,Linux'),
			user: testUser
		});

		await expect(POST(event)).rejects.toMatchObject({ status: 500 });
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

		const paramConflict = vi.fn().mockResolvedValue([]);
		const paramValues = vi.fn(() => ({ onConflictDoNothing: paramConflict }));
		const dataSetValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: 1 }])
		});
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({ values: paramValues })
			.mockReturnValueOnce({ values: paramValues })
			.mockReturnValueOnce({ values: dataSetValues });
		mockDb.transaction.mockImplementationOnce(async (fn) => fn({ insert: txInsert }));

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
						return Promise.resolve([
							{ id: 1, name: 'browser', orderIndex: 0, testCaseId: 10 }
						]).then(r);
					}
					// Second select: existing datasets
					return Promise.resolve([]).then(r);
				}
			};
			return chain as never;
		});

		const paramConflict = vi.fn().mockResolvedValue([]);
		const paramValues = vi.fn(() => ({ onConflictDoNothing: paramConflict }));
		const dataSetValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: 1 }])
		});
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({ values: paramValues })
			.mockReturnValueOnce({ values: dataSetValues });
		mockDb.transaction.mockImplementationOnce(async (fn) => fn({ insert: txInsert }));

		const csv = 'browser,os\nChrome,Windows';
		const formData = createCsvFormData(csv);
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData, user: testUser });
		const response = await POST(event);

		expect(response.status).toBe(200);
	});
});
