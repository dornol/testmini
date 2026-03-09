import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	requirement: {
		id: 'id',
		projectId: 'project_id',
		externalId: 'external_id',
		title: 'title',
		description: 'description',
		source: 'source',
		createdAt: 'created_at',
		createdBy: 'created_by'
	},
	requirementTestCase: {
		requirementId: 'requirement_id',
		testCaseId: 'test_case_id'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, as: vi.fn().mockReturnValue('sql_expr') }),
		{ join: vi.fn((...args: unknown[]) => args), raw: vi.fn((s: string) => s) }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
		parseJsonBody: vi.fn()
	};
});

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

describe('/api/projects/[projectId]/requirements', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return empty array when no requirements exist', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual([]);
		});

		it('should return requirements with coverage data', async () => {
			// First select: requirements list
			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				const chain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					as: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => {
						if (selectCall === 1) {
							// Requirements
							return Promise.resolve([
								{ id: 1, externalId: 'REQ-001', title: 'Login', description: 'Login flow', source: 'PRD', testCaseCount: 2, createdAt: new Date() },
								{ id: 2, externalId: 'REQ-002', title: 'Logout', description: null, source: null, testCaseCount: 0, createdAt: new Date() }
							]).then(r);
						}
						if (selectCall === 2) {
							// All links batch
							return Promise.resolve([
								{ requirementId: 1, testCaseId: 10 },
								{ requirementId: 1, testCaseId: 20 }
							]).then(r);
						}
						return Promise.resolve([]).then(r);
					}
				};
				return chain as never;
			});

			// db.execute for batch latest execution
			mockDb.execute.mockResolvedValue([
				{ test_case_id: 10, status: 'PASS' },
				{ test_case_id: 20, status: 'FAIL' }
			]);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);

			expect(response.status).toBe(200);
			const body = await response.json();

			expect(body).toHaveLength(2);

			// First requirement has 2 linked test cases (PASS + FAIL)
			expect(body[0].id).toBe(1);
			expect(body[0].title).toBe('Login');
			expect(body[0].testCaseCount).toBe(2);
			expect(body[0].coverage.pass).toBe(1);
			expect(body[0].coverage.fail).toBe(1);
			expect(body[0].coverage.notExecuted).toBe(0);

			// Second requirement has 0 linked test cases
			expect(body[1].id).toBe(2);
			expect(body[1].title).toBe('Logout');
			expect(body[1].testCaseCount).toBe(0);
			expect(body[1].coverage.notExecuted).toBe(0);
			expect(body[1].coverage.pass).toBe(0);
		});

		it('should count notExecuted for test cases with no execution', async () => {
			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				const chain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					as: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => {
						if (selectCall === 1) {
							return Promise.resolve([
								{ id: 1, externalId: 'REQ-001', title: 'Feature', description: null, source: null, testCaseCount: 1, createdAt: new Date() }
							]).then(r);
						}
						if (selectCall === 2) {
							return Promise.resolve([
								{ requirementId: 1, testCaseId: 100 }
							]).then(r);
						}
						return Promise.resolve([]).then(r);
					}
				};
				return chain as never;
			});

			// No executions found
			mockDb.execute.mockResolvedValue([]);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(body[0].coverage.notExecuted).toBe(1);
			expect(body[0].coverage.pass).toBe(0);
		});

		it('should handle all execution statuses correctly', async () => {
			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				const chain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					as: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => {
						if (selectCall === 1) {
							return Promise.resolve([
								{ id: 1, externalId: null, title: 'All statuses', description: null, source: null, testCaseCount: 5, createdAt: new Date() }
							]).then(r);
						}
						if (selectCall === 2) {
							return Promise.resolve([
								{ requirementId: 1, testCaseId: 1 },
								{ requirementId: 1, testCaseId: 2 },
								{ requirementId: 1, testCaseId: 3 },
								{ requirementId: 1, testCaseId: 4 },
								{ requirementId: 1, testCaseId: 5 }
							]).then(r);
						}
						return Promise.resolve([]).then(r);
					}
				};
				return chain as never;
			});

			mockDb.execute.mockResolvedValue([
				{ test_case_id: 1, status: 'PASS' },
				{ test_case_id: 2, status: 'FAIL' },
				{ test_case_id: 3, status: 'PENDING' },
				{ test_case_id: 4, status: 'BLOCKED' },
				{ test_case_id: 5, status: 'SKIPPED' }
			]);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(body[0].coverage).toEqual({
				pass: 1,
				fail: 1,
				pending: 1,
				blocked: 1,
				skipped: 1,
				notExecuted: 0
			});
		});
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: null });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when title is missing', async () => {
			vi.mocked(authUtils.parseJsonBody).mockResolvedValue({ title: '' });

			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when title is only whitespace', async () => {
			vi.mocked(authUtils.parseJsonBody).mockResolvedValue({ title: '   ' });

			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should create a requirement successfully', async () => {
			const created = {
				id: 1,
				projectId: 1,
				title: 'New Requirement',
				externalId: 'REQ-100',
				description: 'Some description',
				source: 'PRD',
				createdBy: 'user-1',
				createdAt: new Date()
			};

			vi.mocked(authUtils.parseJsonBody).mockResolvedValue({
				title: 'New Requirement',
				externalId: 'REQ-100',
				description: 'Some description',
				source: 'PRD'
			});
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			const response = await POST(event);

			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.title).toBe('New Requirement');
			expect(body.externalId).toBe('REQ-100');
		});

		it('should trim title and optional fields', async () => {
			vi.mocked(authUtils.parseJsonBody).mockResolvedValue({
				title: '  Trimmed Title  ',
				externalId: '  REQ-200  ',
				description: '  desc  ',
				source: '  src  '
			});
			mockInsertReturning(mockDb, [{ id: 2 }]);

			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			await POST(event);

			const insertCall = mockDb.insert.mock.calls[0];
			expect(insertCall).toBeDefined();
		});

		it('should handle null optional fields', async () => {
			vi.mocked(authUtils.parseJsonBody).mockResolvedValue({
				title: 'No extras'
			});
			mockInsertReturning(mockDb, [{ id: 3 }]);

			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			const response = await POST(event);

			expect(response.status).toBe(201);
		});
	});
});
