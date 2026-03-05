import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCaseGroup: {
		id: 'id',
		name: 'name',
		projectId: 'project_id',
		sortOrder: 'sort_order',
		color: 'color',
		createdBy: 'created_by'
	},
	testCase: { id: 'id', groupId: 'group_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	),
	count: vi.fn(() => 'count'),
	asc: vi.fn((a: unknown) => ['asc', a]),
	and: vi.fn((...args: unknown[]) => args)
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

describe('/api/projects/[projectId]/test-case-groups', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		mockDb.query.testCaseGroup = { findFirst: vi.fn().mockResolvedValue(null) };
	});

	describe('POST - color validation', () => {
		it('should return 400 for invalid color format "red"', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Group A', color: 'red' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toMatch(/color/i);
		});

		it('should return 400 for invalid color format "123456" (missing #)', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Group A', color: '123456' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toMatch(/color/i);
		});

		it('should return 400 for invalid color format "#GGG"', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Group A', color: '#GGG' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toMatch(/color/i);
		});

		it('should accept valid 3-digit hex color (#fff)', async () => {
			const created = { id: 1, name: 'Group A', color: '#fff', sortOrder: 1000, projectId: 1 };
			// findFirst returns null (no duplicate)
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue(null);
			// max sortOrder query
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						then: (r: (v: unknown) => void) => Promise.resolve([{ maxOrder: 0 }]).then(r)
					})
				})
			} as never);
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Group A', color: '#fff' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.color).toBe('#fff');
		});

		it('should accept valid 6-digit hex color (#FF0000)', async () => {
			const created = { id: 2, name: 'Group B', color: '#FF0000', sortOrder: 1000, projectId: 1 };
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue(null);
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						then: (r: (v: unknown) => void) => Promise.resolve([{ maxOrder: 0 }]).then(r)
					})
				})
			} as never);
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Group B', color: '#FF0000' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.color).toBe('#FF0000');
		});

		it('should accept null color (to clear)', async () => {
			const created = { id: 3, name: 'Group C', color: null, sortOrder: 1000, projectId: 1 };
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue(null);
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						then: (r: (v: unknown) => void) => Promise.resolve([{ maxOrder: 0 }]).then(r)
					})
				})
			} as never);
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Group C', color: null },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.color).toBeNull();
		});
	});
});
