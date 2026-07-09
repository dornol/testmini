import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	priorityConfig: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		color: 'color',
		position: 'position',
		isDefault: 'is_default',
		createdAt: 'created_at',
		createdBy: 'created_by'
	},
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id',
		priority: 'priority'
	},
	testCase: {
		id: 'id',
		projectId: 'project_id'
	},
	testCaseTemplate: {
		id: 'id',
		projectId: 'project_id',
		priority: 'priority'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => a),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }))
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});
vi.mock('$lib/server/cache', () => ({ cacheDelete: vi.fn() }));
vi.mock('$lib/server/queries', () => ({ getNextPosition: vi.fn().mockResolvedValue(0) }));

const { actions } = await import('./+page.server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

function makeFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		fd.set(key, value);
	}
	return fd;
}

function createTxUpdateChain() {
	const updateChain = {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis()
	};
	const tx = {
		update: vi.fn().mockReturnValue(updateChain),
		insert: vi.fn()
	};
	return { tx, updateChain };
}

describe('priorities settings page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('actions.update', () => {
		it('scopes priority updates to the current project', async () => {
			mockDb.query.priorityConfig.findFirst
				.mockResolvedValueOnce({
					id: 7,
					projectId: 1,
					name: 'HIGH',
					color: '#ef4444',
					isDefault: false
				})
				.mockResolvedValueOnce(null);
			const { tx, updateChain } = createTxUpdateChain();
			mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx));

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({
					priorityId: '7',
					name: 'HIGH',
					color: '#3b82f6',
					isDefault: 'false'
				}),
				user: testUser
			});

			const result = await actions.update(event);

			expect(result).toEqual({ updated: true });
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 7],
					['project_id', 1]
				])
			);
		});

		it('rejects invalid priorityId before querying existing priority', async () => {
			for (const priorityId of [
				'abc',
				'0',
				'-1',
				'+1',
				'01',
				'1.5',
				'1e3',
				' 1',
				'1 ',
				String(Number.MAX_SAFE_INTEGER + 1)
			]) {
				vi.clearAllMocks();
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
				const event = createMockEvent({
					method: 'POST',
					params: PARAMS,
					formData: makeFormData({
						priorityId,
						name: 'HIGH',
						color: '#ef4444',
						isDefault: 'false'
					}),
					user: testUser
				});

				const result = await actions.update(event);

				expect(result).toMatchObject({ status: 400 });
				expect(mockDb.query.priorityConfig.findFirst).not.toHaveBeenCalled();
				expect(mockDb.transaction).not.toHaveBeenCalled();
			}
		});
	});

	describe('actions.delete', () => {
		it('scopes priority deletes to the current project', async () => {
			mockDb.query.priorityConfig.findFirst.mockResolvedValueOnce({
				id: 7,
				projectId: 1,
				name: 'HIGH',
				color: '#ef4444'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ priorityId: '7' }),
				user: testUser
			});

			const result = await actions.delete(event);

			expect(result).toEqual({ deleted: true });
			expect(mockDb._chains.delete.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 7],
					['project_id', 1]
				])
			);
		});

		it('rejects invalid priorityId before querying existing priority', async () => {
			for (const priorityId of [
				'abc',
				'0',
				'-1',
				'+1',
				'01',
				'1.5',
				'1e3',
				' 1',
				'1 ',
				String(Number.MAX_SAFE_INTEGER + 1)
			]) {
				vi.clearAllMocks();
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
				const event = createMockEvent({
					method: 'POST',
					params: PARAMS,
					formData: makeFormData({ priorityId }),
					user: testUser
				});

				const result = await actions.delete(event);

				expect(result).toMatchObject({ status: 400, data: { error: 'Invalid priorityId' } });
				expect(mockDb.query.priorityConfig.findFirst).not.toHaveBeenCalled();
				expect(mockDb.delete).not.toHaveBeenCalled();
			}
		});
	});
});
