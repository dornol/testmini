import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	tag: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		color: 'color',
		createdAt: 'created_at',
		createdBy: 'created_by'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
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

describe('tags settings page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('actions.update', () => {
		it('scopes tag updates to the current project', async () => {
			mockDb.query.tag.findFirst
				.mockResolvedValueOnce({ id: 7, projectId: 1, name: 'Smoke', color: '#ef4444' })
				.mockResolvedValueOnce(null);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({
					tagId: '7',
					name: 'Regression',
					color: '#3b82f6'
				}),
				user: testUser
			});

			const result = await actions.update(event);

			expect(result).toEqual({ updated: true });
			expect(mockDb._chains.update.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 7],
					['project_id', 1]
				])
			);
		});

		it('rejects invalid tagId before querying existing tag', async () => {
			for (const tagId of ['abc', '0', '-1', '1.5', String(Number.MAX_SAFE_INTEGER + 1)]) {
				vi.clearAllMocks();
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
				const event = createMockEvent({
					method: 'POST',
					params: PARAMS,
					formData: makeFormData({
						tagId,
						name: 'Smoke',
						color: '#ef4444'
					}),
					user: testUser
				});

				const result = await actions.update(event);

				expect(result).toMatchObject({ status: 400 });
				expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});
	});

	describe('actions.delete', () => {
		it('scopes tag deletes to the current project', async () => {
			mockDb.query.tag.findFirst.mockResolvedValueOnce({
				id: 7,
				projectId: 1,
				name: 'Smoke',
				color: '#ef4444'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ tagId: '7' }),
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

		it('rejects invalid tagId before querying existing tag', async () => {
			for (const tagId of ['abc', '0', '-1', '1.5', String(Number.MAX_SAFE_INTEGER + 1)]) {
				vi.clearAllMocks();
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
				const event = createMockEvent({
					method: 'POST',
					params: PARAMS,
					formData: makeFormData({ tagId }),
					user: testUser
				});

				const result = await actions.delete(event);

				expect(result).toMatchObject({ status: 400, data: { error: 'Invalid tagId' } });
				expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
				expect(mockDb.delete).not.toHaveBeenCalled();
			}
		});
	});
});
