import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	customField: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		fieldType: 'field_type',
		options: 'options',
		required: 'required',
		sortOrder: 'sort_order',
		createdBy: 'created_by'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	asc: vi.fn((a: unknown) => ['asc', a])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

const sampleFields = [
	{
		id: 1,
		projectId: 1,
		name: 'Browser',
		fieldType: 'SELECT',
		options: ['Chrome', 'Firefox'],
		required: false,
		sortOrder: 1,
		createdBy: 'user-1'
	},
	{
		id: 2,
		projectId: 1,
		name: 'Notes',
		fieldType: 'TEXT',
		options: null,
		required: false,
		sortOrder: 2,
		createdBy: 'user-1'
	}
];

describe('/api/projects/[projectId]/custom-fields', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('GET - list custom fields', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return list of custom fields', async () => {
			mockSelectResult(mockDb, sampleFields);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toHaveLength(2);
			expect(data[0].name).toBe('Browser');
			expect(data[1].name).toBe('Notes');
		});

		it('should return empty array when no fields exist', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual([]);
		});
	});

	describe('POST - create custom field', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Field', fieldType: 'TEXT' },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should create a TEXT field successfully', async () => {
			// First select for maxOrder
			mockSelectResult(mockDb, [{ max: 2 }]);

			const created = {
				id: 3,
				projectId: 1,
				name: 'Description',
				fieldType: 'TEXT',
				options: null,
				required: false,
				sortOrder: 3,
				createdBy: 'user-1'
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Description', fieldType: 'TEXT' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.name).toBe('Description');
			expect(data.fieldType).toBe('TEXT');
		});

		it('should create a SELECT field with options', async () => {
			mockSelectResult(mockDb, [{ max: 0 }]);

			const created = {
				id: 4,
				projectId: 1,
				name: 'Priority',
				fieldType: 'SELECT',
				options: ['Low', 'Medium', 'High'],
				required: true,
				sortOrder: 1,
				createdBy: 'user-1'
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Priority', fieldType: 'SELECT', options: ['Low', 'Medium', 'High'], required: true },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.fieldType).toBe('SELECT');
			expect(data.options).toEqual(['Low', 'Medium', 'High']);
		});

		it('should return 400 when name is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { fieldType: 'TEXT' },
				user: testUser
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when name is empty', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: '   ', fieldType: 'TEXT' },
				user: testUser
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when fieldType is invalid', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Field', fieldType: 'INVALID' },
				user: testUser
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when fieldType is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Field' },
				user: testUser
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when SELECT field has no options', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Field', fieldType: 'SELECT' },
				user: testUser
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when MULTISELECT field has empty options array', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Field', fieldType: 'MULTISELECT', options: [] },
				user: testUser
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should accept all valid field types', async () => {
			const validTypes = ['TEXT', 'NUMBER', 'DATE', 'CHECKBOX', 'URL'];

			for (const fieldType of validTypes) {
				vi.clearAllMocks();
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
				mockSelectResult(mockDb, [{ max: 0 }]);
				mockInsertReturning(mockDb, [{ id: 1, name: 'Field', fieldType, sortOrder: 1 }]);

				const event = createMockEvent({
					method: 'POST',
					params: PARAMS,
					body: { name: 'Field', fieldType },
					user: testUser
				});
				const response = await POST(event);

				expect(response.status).toBe(201);
			}
		});

		it('should reject request with invalid project ID', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: 'abc' },
				body: { name: 'Field', fieldType: 'TEXT' },
				user: testUser
			});

			await expect(POST(event)).rejects.toThrow();
		});
	});
});
