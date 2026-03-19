import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
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
	and: vi.fn((...args: unknown[]) => args),
	isNotNull: vi.fn((a: unknown) => ['isNotNull', a]),
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
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET } = await import('./+server');

const PARAMS = { projectId: '1' };

describe('/api/projects/[projectId]/risk-matrix', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ params: PARAMS, user: null });
		await expect(GET(event)).rejects.toThrow();
	});

	it('should return risk matrix data', async () => {
		// First select() call returns matrix rows, second returns totals
		let callCount = 0;
		mockDb.select.mockImplementation(() => {
			callCount++;
			const data = callCount === 1
				? [{ riskImpact: 'HIGH', riskLikelihood: 'HIGH', riskLevel: 'CRITICAL', count: 3 }]
				: [{ total: 10, assessed: 7 }];
			const chain: Record<string, unknown> = {};
			const methods = ['from', 'where', 'groupBy', 'orderBy', 'limit'];
			for (const m of methods) {
				chain[m] = vi.fn().mockReturnValue(chain);
			}
			chain.then = (r: (v: unknown) => void) => Promise.resolve(data).then(r);
			return chain;
		});

		const event = createMockEvent({ params: PARAMS, user: testUser });
		const response = await GET(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.matrix).toBeDefined();
		expect(Array.isArray(body.matrix)).toBe(true);
		expect(body.total).toBe(10);
		expect(body.assessed).toBe(7);
		expect(body.unassessed).toBe(3);
	});

	it('should return zeros when no test cases exist', async () => {
		let callCount = 0;
		mockDb.select.mockImplementation(() => {
			callCount++;
			const data = callCount === 1 ? [] : [{ total: 0, assessed: 0 }];
			const chain: Record<string, unknown> = {};
			for (const m of ['from', 'where', 'groupBy', 'orderBy', 'limit']) {
				chain[m] = vi.fn().mockReturnValue(chain);
			}
			chain.then = (r: (v: unknown) => void) => Promise.resolve(data).then(r);
			return chain;
		});

		const event = createMockEvent({ params: PARAMS, user: testUser });
		const response = await GET(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.matrix).toEqual([]);
		expect(body.total).toBe(0);
		expect(body.assessed).toBe(0);
		expect(body.unassessed).toBe(0);
	});
});
