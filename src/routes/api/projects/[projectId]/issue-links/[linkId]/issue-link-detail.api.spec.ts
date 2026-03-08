import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	issueLink: {
		id: 'id',
		projectId: 'project_id',
		testCaseId: 'test_case_id',
		testExecutionId: 'test_execution_id',
		externalUrl: 'external_url',
		externalKey: 'external_key',
		title: 'title',
		status: 'status',
		provider: 'provider',
		createdAt: 'created_at'
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
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { PATCH, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', linkId: '1' };

const sampleLink = {
	id: 1,
	projectId: 1,
	testCaseId: 10,
	testExecutionId: null,
	externalUrl: 'https://company.atlassian.net/browse/PROJ-123',
	externalKey: 'PROJ-123',
	title: 'Login bug',
	status: null,
	provider: 'JIRA',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/issue-links/[linkId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.issueLink = { findFirst: vi.fn() };
	});

	// ── PATCH ───────────────────────────────────────────
	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: null,
				body: { title: 'new' }
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when link not found', async () => {
			mockDb.query.issueLink.findFirst.mockResolvedValue(null);
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { title: 'new' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should reject when no fields to update', async () => {
			mockDb.query.issueLink.findFirst.mockResolvedValue(sampleLink);
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

		it('should update title', async () => {
			mockDb.query.issueLink.findFirst
				.mockResolvedValueOnce(sampleLink)
				.mockResolvedValueOnce({ ...sampleLink, title: 'Updated title' });

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { title: 'Updated title' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.title).toBe('Updated title');
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should update status', async () => {
			mockDb.query.issueLink.findFirst
				.mockResolvedValueOnce(sampleLink)
				.mockResolvedValueOnce({ ...sampleLink, status: 'CLOSED' });

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { status: 'CLOSED' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			expect((await response.json()).status).toBe('CLOSED');
		});

		it('should update both title and status', async () => {
			mockDb.query.issueLink.findFirst
				.mockResolvedValueOnce(sampleLink)
				.mockResolvedValueOnce({ ...sampleLink, title: 'New', status: 'OPEN' });

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { title: 'New', status: 'OPEN' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.title).toBe('New');
			expect(body.status).toBe('OPEN');
		});

		it('should set title to null when empty string', async () => {
			mockDb.query.issueLink.findFirst
				.mockResolvedValueOnce(sampleLink)
				.mockResolvedValueOnce({ ...sampleLink, title: null });

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { title: '   ' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});
	});

	// ── DELETE ───────────────────────────────────────────
	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when link not found', async () => {
			mockDb.query.issueLink.findFirst.mockResolvedValue(null);
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should delete link and return success', async () => {
			mockDb.query.issueLink.findFirst.mockResolvedValue(sampleLink);
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });

			const response = await DELETE(event);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ success: true });
			expect(mockDb.delete).toHaveBeenCalled();
		});
	});
});
