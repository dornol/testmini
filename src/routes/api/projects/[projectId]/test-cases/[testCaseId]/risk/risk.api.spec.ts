import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: {
		id: 'id',
		projectId: 'project_id',
		riskImpact: 'risk_impact',
		riskLikelihood: 'risk_likelihood',
		riskLevel: 'risk_level'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET, PATCH } = await import('./+server');

describe('/api/projects/[projectId]/test-cases/[testCaseId]/risk', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.testCase = {
			findFirst: vi.fn().mockResolvedValue({
				id: 10, riskImpact: 'HIGH', riskLikelihood: 'MEDIUM', riskLevel: 'HIGH'
			})
		};
	});

	describe('GET', () => {
		it('should return risk data for a test case', async () => {
			const event = createMockEvent({
				params: { projectId: '1', testCaseId: '10' },
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.riskImpact).toBe('HIGH');
			expect(data.riskLevel).toBe('HIGH');
		});

		it('should return 404 for non-existent test case', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				params: { projectId: '1', testCaseId: '999' },
				user: testUser
			});
			const response = await GET(event);
			expect(response.status).toBe(404);
		});

		it('should return 400 for invalid test case ID', async () => {
			const event = createMockEvent({
				params: { projectId: '1', testCaseId: 'abc' },
				user: testUser
			});
			const response = await GET(event);
			expect(response.status).toBe(400);
		});
	});

	describe('PATCH', () => {
		it('should update risk assessment and compute level', async () => {
			mockUpdateReturning(mockDb, [{
				id: 10, riskImpact: 'HIGH', riskLikelihood: 'MEDIUM', riskLevel: 'HIGH'
			}]);

			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1', testCaseId: '10' },
				body: { riskImpact: 'HIGH', riskLikelihood: 'MEDIUM' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.riskLevel).toBe('HIGH');
		});

		it('should clear risk when set to null', async () => {
			mockUpdateReturning(mockDb, [{
				id: 10, riskImpact: null, riskLikelihood: null, riskLevel: null
			}]);

			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1', testCaseId: '10' },
				body: { riskImpact: null, riskLikelihood: null },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.riskLevel).toBeNull();
		});

		it('should return 400 for invalid input', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1', testCaseId: '10' },
				body: { riskImpact: 'INVALID' },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(400);
		});

		it('should return 404 when test case not found', async () => {
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1', testCaseId: '999' },
				body: { riskImpact: 'HIGH', riskLikelihood: 'LOW' },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(404);
		});

		it('should return 401 for unauthenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1', testCaseId: '10' },
				body: { riskImpact: 'HIGH', riskLikelihood: 'LOW' },
				user: null
			});
			await expect(PATCH(event)).rejects.toThrow();
		});
	});
});
