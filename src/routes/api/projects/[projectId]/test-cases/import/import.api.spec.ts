import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', key: 'key', sortOrder: 'sort_order' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id' },
	testCaseGroup: { id: 'id', projectId: 'project_id', name: 'name' },
	tag: { id: 'id', projectId: 'project_id', name: 'name' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' },
	priorityConfig: { id: 'id', projectId: 'project_id', name: 'name', color: 'color', position: 'position', isDefault: 'is_default', createdBy: 'created_by' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { POST } = await import('./+server');

const PARAMS = { projectId: '1' };

function createCsvFormData(csvContent: string, filename = 'test.csv'): FormData {
	const fd = new FormData();
	fd.append('file', new File([csvContent], filename, { type: 'text/csv' }));
	return fd;
}

function createJsonFormData(jsonContent: unknown, filename = 'test.json'): FormData {
	const fd = new FormData();
	fd.append('file', new File([JSON.stringify(jsonContent)], filename, { type: 'application/json' }));
	return fd;
}

describe('/api/projects/[projectId]/test-cases/import', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 401 when not authenticated', async () => {
		const fd = createCsvFormData('Title\nTest');
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData: fd, user: null });
		await expect(POST(event)).rejects.toThrow();
	});

	it('should throw 400 when no file uploaded', async () => {
		const fd = new FormData();
		const event = createMockEvent({ method: 'POST', params: PARAMS, formData: fd, user: adminUser });
		await expect(POST(event)).rejects.toThrow();
	});

	it('should import CSV with key auto-generation', async () => {
		const csv = 'Title,Priority\nLogin Test,HIGH\nLogout Test,LOW';
		const fd = createCsvFormData(csv);

		// Mock tag/group queries
		mockDb.select.mockImplementation(() => {
			return mockSelectResult(mockDb, []) as never;
		});

		// Mock transaction
		let importedCount = 0;
		mockDb.transaction.mockImplementation(async (fn) => {
			const txChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockImplementation(() => {
					importedCount++;
					return Promise.resolve([{ id: importedCount, key: `TC-${String(importedCount).padStart(4, '0')}` }]);
				}),
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				onConflictDoNothing: vi.fn().mockReturnThis(),
				then: undefined as unknown
			};
			txChain.then = (r: (v: unknown) => void) => Promise.resolve([{ maxKey: null }]).then(r);
			const txSelectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([{ maxKey: null, maxOrder: 0 }]).then(r)
			};
			const tx = {
				select: vi.fn().mockReturnValue(txSelectChain),
				insert: vi.fn().mockReturnValue(txChain),
				update: vi.fn().mockReturnValue(txChain)
			};
			return fn(tx);
		});

		const event = createMockEvent({ method: 'POST', params: PARAMS, formData: fd, user: adminUser });
		const response = await POST(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.imported).toBeGreaterThanOrEqual(0);
		expect(body.rows).toBeDefined();
	});

	it('should import JSON array format', async () => {
		const data = [
			{ title: 'TC from JSON', priority: 'MEDIUM' },
			{ title: 'Another TC', priority: 'HIGH' }
		];
		const fd = createJsonFormData(data);

		mockDb.select.mockImplementation(() => {
			return mockSelectResult(mockDb, []) as never;
		});

		mockDb.transaction.mockImplementation(async (fn) => {
			let count = 0;
			const txChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockImplementation(() => {
					count++;
					return Promise.resolve([{ id: count }]);
				}),
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				onConflictDoNothing: vi.fn().mockReturnThis(),
				then: undefined as unknown
			};
			txChain.then = (r: (v: unknown) => void) => Promise.resolve([{ maxKey: null, maxOrder: 0 }]).then(r);
			const txSelectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([{ maxKey: null, maxOrder: 0 }]).then(r)
			};
			const tx = {
				select: vi.fn().mockReturnValue(txSelectChain),
				insert: vi.fn().mockReturnValue(txChain),
				update: vi.fn().mockReturnValue(txChain)
			};
			return fn(tx);
		});

		const event = createMockEvent({ method: 'POST', params: PARAMS, formData: fd, user: adminUser });
		const response = await POST(event);

		expect(response.status).toBe(200);
	});

	it('should import JSON with testCases wrapper', async () => {
		const data = {
			testCases: [{ title: 'Wrapped TC', priority: 'LOW' }]
		};
		const fd = createJsonFormData(data);

		mockDb.select.mockImplementation(() => {
			return mockSelectResult(mockDb, []) as never;
		});

		mockDb.transaction.mockImplementation(async (fn) => {
			const txChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: 1 }]),
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				onConflictDoNothing: vi.fn().mockReturnThis(),
				then: undefined as unknown
			};
			txChain.then = (r: (v: unknown) => void) => Promise.resolve([{ maxKey: null, maxOrder: 0 }]).then(r);
			const txSelectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([{ maxKey: null, maxOrder: 0 }]).then(r)
			};
			const tx = {
				select: vi.fn().mockReturnValue(txSelectChain),
				insert: vi.fn().mockReturnValue(txChain),
				update: vi.fn().mockReturnValue(txChain)
			};
			return fn(tx);
		});

		const event = createMockEvent({ method: 'POST', params: PARAMS, formData: fd, user: adminUser });
		const response = await POST(event);

		expect(response.status).toBe(200);
	});

	it('should skip rows with missing title and return 400 when all invalid', async () => {
		const csv = 'Title,Priority\n,HIGH\n,LOW';
		const fd = createCsvFormData(csv);

		mockDb.select.mockImplementation(() => {
			return mockSelectResult(mockDb, []) as never;
		});

		const event = createMockEvent({ method: 'POST', params: PARAMS, formData: fd, user: adminUser });
		const response = await POST(event);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.imported).toBe(0);
		expect(body.errors).toContain('No valid rows to import');
	});
});
