import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockInsertReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
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
	},
	testCaseTag: {
		tagId: 'tag_id'
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
const { cacheDelete } = await import('$lib/server/cache');

const PARAMS = { projectId: '1' };

function makeFormData(entries: Record<string, FormDataEntryValue>): FormData {
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

	describe('actions.create', () => {
		it.each([
			[{ name: new File(['Bug'], 'name.txt'), color: '#ef4444' }],
			[{ name: 'Bug', color: new File(['#ef4444'], 'color.txt') }]
		])('rejects non-text tag field %# before querying duplicates', async (form) => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData(form),
				user: testUser
			});

			const result = await actions.create(event);

			expect(result).toMatchObject({ status: 400 });
			expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('returns 500 without cache invalidation when insert returns no tag', async () => {
			mockDb.query.tag.findFirst.mockResolvedValueOnce(null);
			mockInsertReturning(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ name: 'Smoke', color: '#ef4444' }),
				user: testUser
			});

			const result = await actions.create(event);

			expect(result).toMatchObject({ status: 500, data: { error: 'Failed to create tag' } });
			expect(cacheDelete).not.toHaveBeenCalled();
		});
	});

	describe('actions.update', () => {
		it.each([
			[{ tagId: '7', name: new File(['Bug'], 'name.txt'), color: '#ef4444' }],
			[{ tagId: '7', name: 'Bug', color: new File(['#ef4444'], 'color.txt') }]
		])('rejects non-text tag update field %# before querying existing tag', async (form) => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData(form),
				user: testUser
			});

			const result = await actions.update(event);

			expect(result).toMatchObject({ status: 400 });
			expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('scopes tag updates to the current project', async () => {
			mockDb.query.tag.findFirst
				.mockResolvedValueOnce({ id: 7, projectId: 1, name: 'Smoke', color: '#ef4444' })
				.mockResolvedValueOnce(null);
			const updateChain = mockUpdateReturning(mockDb, [{ id: 7 }]);

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
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 7],
					['project_id', 1]
				])
			);
		});

		it('rejects invalid tagId before querying existing tag', async () => {
			for (const tagId of [
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

		it('returns 404 without cache invalidation when update affects no rows', async () => {
			mockDb.query.tag.findFirst
				.mockResolvedValueOnce({ id: 7, projectId: 1, name: 'Smoke', color: '#ef4444' })
				.mockResolvedValueOnce(null);
			mockUpdateReturning(mockDb, []);

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

			expect(result).toMatchObject({ status: 404, data: { error: 'Tag not found' } });
			expect(cacheDelete).not.toHaveBeenCalled();
		});
	});

	describe('actions.delete', () => {
		it('deletes tag assignments and the scoped tag in a transaction', async () => {
			mockDb.query.tag.findFirst.mockResolvedValueOnce({
				id: 7,
				projectId: 1,
				name: 'Smoke',
				color: '#ef4444'
			});
			const assignmentWhere = vi.fn().mockResolvedValue(undefined);
			const tagReturning = vi.fn().mockResolvedValue([{ id: 7 }]);
			const tagWhere = vi.fn(() => ({ returning: tagReturning }));
			const txDelete = vi
				.fn()
				.mockReturnValueOnce({ where: assignmentWhere })
				.mockReturnValueOnce({ where: tagWhere });
			mockDb.transaction.mockImplementationOnce(async (fn) => fn({ delete: txDelete }));

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ tagId: '7' }),
				user: testUser
			});

			const result = await actions.delete(event);

			expect(result).toEqual({ deleted: true });
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
			expect(txDelete).toHaveBeenNthCalledWith(1, { tagId: 'tag_id' });
			expect(assignmentWhere).toHaveBeenCalledWith(['tag_id', 7]);
			expect(txDelete).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'id' }));
			expect(tagWhere).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 7],
					['project_id', 1]
				])
			);
			expect(tagReturning).toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('returns 404 without cache invalidation when tag delete affects no rows', async () => {
			mockDb.query.tag.findFirst.mockResolvedValueOnce({
				id: 7,
				projectId: 1,
				name: 'Smoke',
				color: '#ef4444'
			});
			const assignmentWhere = vi.fn().mockResolvedValue(undefined);
			const tagReturning = vi.fn().mockResolvedValue([]);
			const tagWhere = vi.fn(() => ({ returning: tagReturning }));
			const txDelete = vi
				.fn()
				.mockReturnValueOnce({ where: assignmentWhere })
				.mockReturnValueOnce({ where: tagWhere });
			mockDb.transaction.mockImplementationOnce(async (fn) => fn({ delete: txDelete }));

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ tagId: '7' }),
				user: testUser
			});

			const result = await actions.delete(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'Tag not found' } });
			expect(cacheDelete).not.toHaveBeenCalled();
		});

		it('rejects invalid tagId before querying existing tag', async () => {
			for (const tagId of [
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
