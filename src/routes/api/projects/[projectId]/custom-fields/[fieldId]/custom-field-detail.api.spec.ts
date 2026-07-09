import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	customField: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		options: 'options',
		required: 'required',
		sortOrder: 'sort_order'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { PATCH, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', fieldId: '5' };

const sampleField = {
	id: 5,
	projectId: 1,
	name: 'Browser',
	type: 'SELECT',
	options: ['Chrome', 'Firefox', 'Safari'],
	required: false,
	sortOrder: 0,
	createdAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/custom-fields/[fieldId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.customField = { findFirst: vi.fn() };
	});

	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'PATCH', params: PARAMS, user: null, body: {} });
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when field not found', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(undefined);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: 'Updated' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should reject empty name', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleField);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: '   ' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 when request body is not an object', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleField);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: ['Platform']
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/request body/i);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject invalid options', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleField);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { options: ['Chrome', 'chrome'] }
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/duplicates/i);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject non-boolean required value', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleField);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { required: 'true' }
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/required/i);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject invalid sortOrder', async () => {
			const cases = ['1', 'abc', true, {}, -1, 1.5, Number.MAX_SAFE_INTEGER + 1];

			for (const sortOrder of cases) {
				vi.clearAllMocks();
				mockDb.query.customField = { findFirst: vi.fn() };

				const event = createMockEvent({
					method: 'PATCH',
					params: PARAMS,
					user: testUser,
					body: { sortOrder }
				});

				const response = await PATCH(event);
				const body = await response.json();

				expect(response.status).toBe(400);
				expect(body.error).toMatch(/non-negative integer/i);
				expect(mockDb.query.customField.findFirst).not.toHaveBeenCalled();
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});

		it('should reject null sortOrder', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { sortOrder: null }
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/non-negative integer/i);
			expect(mockDb.query.customField.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when no updates provided', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleField);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: {}
			});

			const response = await PATCH(event);
			const body = await response.json();
			expect(response.status).toBe(400);
			expect(body.error).toContain('No fields to update');
			expect(mockDb.query.customField.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 for unknown fields before updating', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: 'Platform', fieldType: 'TEXT' }
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toContain('Invalid custom field field');
			expect(mockDb.query.customField.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should update field name successfully', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleField);
			const updatedField = { ...sampleField, name: 'Platform' };
			const updateChain = mockUpdateReturning(mockDb, [updatedField]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: 'Platform' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.name).toBe('Platform');
			expect(updateChain.where).toHaveBeenCalledWith(expect.arrayContaining([['project_id', 1]]));
		});

		it('should update options and required fields', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleField);
			const updatedField = {
				...sampleField,
				options: ['Chrome', 'Firefox'],
				required: true
			};
			const updateChain = mockUpdateReturning(mockDb, [updatedField]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { options: ['Chrome', 'Firefox'], required: true }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.options).toEqual(['Chrome', 'Firefox']);
			expect(body.required).toBe(true);
			expect(updateChain.where).toHaveBeenCalledWith(expect.arrayContaining([['project_id', 1]]));
		});

		it('should trim options and update sort order', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleField);
			const updatedField = {
				...sampleField,
				options: ['Chrome', 'Firefox'],
				sortOrder: 2
			};
			const updateChain = mockUpdateReturning(mockDb, [updatedField]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { options: [' Chrome ', ' Firefox '], sortOrder: 2 }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			expect(updateChain.set).toHaveBeenCalledWith({
				options: ['Chrome', 'Firefox'],
				sortOrder: 2
			});
			expect(updateChain.where).toHaveBeenCalledWith(expect.arrayContaining([['project_id', 1]]));
		});

		it('should return 404 if scoped update no longer matches', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleField);
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: 'Platform' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should reject invalid field ID', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1', fieldId: 'abc' },
				user: testUser,
				body: { name: 'Test' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when field not found', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(undefined);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should delete field successfully', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleField);
			const deleteChain = {
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			const response = await DELETE(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.success).toBe(true);
			expect(mockDb.delete).toHaveBeenCalled();
			expect(deleteChain.where).toHaveBeenCalledWith(expect.arrayContaining([['project_id', 1]]));
		});
	});
});
