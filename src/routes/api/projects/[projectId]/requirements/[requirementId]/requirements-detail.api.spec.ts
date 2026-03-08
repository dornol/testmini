import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	requirement: {
		id: 'id',
		projectId: 'project_id',
		title: 'title',
		externalId: 'external_id',
		description: 'description',
		source: 'source'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
		parseJsonBody: vi.fn().mockImplementation((req: Request) => req.json())
	};
});

const { PATCH, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', requirementId: '10' };

const sampleRequirement = {
	id: 10,
	projectId: 1,
	title: 'User must be able to login',
	externalId: 'REQ-001',
	description: 'Login functionality',
	source: 'PRD v1.0'
};

describe('/api/projects/[projectId]/requirements/[requirementId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.requirement = { findFirst: vi.fn() };
	});

	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: null,
				body: { title: 'Updated' }
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when requirement not found', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { title: 'Updated' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 400 when no fields to update', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: {}
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('No fields to update');
		});

		it('should update requirement title', async () => {
			mockDb.query.requirement.findFirst
				.mockResolvedValueOnce(sampleRequirement)
				.mockResolvedValueOnce({ ...sampleRequirement, title: 'Updated Title' });
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { title: 'Updated Title' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.title).toBe('Updated Title');
		});

		it('should update multiple fields', async () => {
			const updated = {
				...sampleRequirement,
				title: 'New Title',
				description: 'New desc',
				source: 'PRD v2.0'
			};
			mockDb.query.requirement.findFirst
				.mockResolvedValueOnce(sampleRequirement)
				.mockResolvedValueOnce(updated);
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { title: 'New Title', description: 'New desc', source: 'PRD v2.0' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.title).toBe('New Title');
			expect(body.description).toBe('New desc');
			expect(body.source).toBe('PRD v2.0');
		});

		it('should set externalId to null when empty string', async () => {
			const updated = { ...sampleRequirement, externalId: null };
			mockDb.query.requirement.findFirst
				.mockResolvedValueOnce(sampleRequirement)
				.mockResolvedValueOnce(updated);
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { externalId: '' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.externalId).toBeNull();
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when requirement not found', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should delete requirement and return success', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);

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
		});
	});
});
