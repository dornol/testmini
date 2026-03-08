import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
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
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	issueTrackerConfig: {
		projectId: 'project_id',
		provider: 'provider'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => ['desc', a])
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

const { GET, POST } = await import('./+server');

const PARAMS = { projectId: '1' };

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

describe('/api/projects/[projectId]/issue-links', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.issueTrackerConfig = { findFirst: vi.fn() };
	});

	// ── GET ─────────────────────────────────────────────
	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return empty array when no links exist', async () => {
			const event = createMockEvent({ params: PARAMS, user: testUser });
			// default chain resolves to []
			const response = await GET(event);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual([]);
		});

		it('should pass testCaseId filter from search params', async () => {
			const event = createMockEvent({
				params: PARAMS,
				user: testUser,
				searchParams: { testCaseId: '10' }
			});

			const response = await GET(event);
			expect(response.status).toBe(200);
		});

		it('should pass testExecutionId filter from search params', async () => {
			const event = createMockEvent({
				params: PARAMS,
				user: testUser,
				searchParams: { testExecutionId: '200' }
			});

			const response = await GET(event);
			expect(response.status).toBe(200);
		});
	});

	// ── POST ────────────────────────────────────────────
	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: null, body: {} });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject missing externalUrl', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { testCaseId: 10, externalUrl: '' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('External URL is required');
		});

		it('should reject invalid external URL', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { testCaseId: 10, externalUrl: 'not-a-url' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid external URL');
		});

		it('should reject non-http URL', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { testCaseId: 10, externalUrl: 'ftp://example.com/issue' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('http or https');
		});

		it('should reject when neither testCaseId nor testExecutionId provided', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { externalUrl: 'https://github.com/org/repo/issues/1' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('testCaseId or testExecutionId');
		});

		it('should create link with testCaseId', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue({
				provider: 'GITHUB'
			});
			mockInsertReturning(mockDb, [sampleLink]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					testCaseId: 10,
					externalUrl: 'https://company.atlassian.net/browse/PROJ-123',
					externalKey: 'PROJ-123',
					title: 'Login bug'
				}
			});

			const response = await POST(event);
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.externalUrl).toBe('https://company.atlassian.net/browse/PROJ-123');
			expect(body.externalKey).toBe('PROJ-123');
		});

		it('should create link with testExecutionId', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);
			mockInsertReturning(mockDb, [{ ...sampleLink, testCaseId: null, testExecutionId: 200 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					testExecutionId: 200,
					externalUrl: 'https://github.com/org/repo/issues/1'
				}
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
		});

		it('should default provider to CUSTOM when no config exists', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);
			mockInsertReturning(mockDb, [{ ...sampleLink, provider: 'CUSTOM' }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					testCaseId: 10,
					externalUrl: 'https://example.com/issue/1'
				}
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
			expect(mockDb.insert).toHaveBeenCalled();
		});

		it('should reject invalid JSON body', async () => {
			const request = new Request('http://localhost/api/test', {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: 'not json'
			});

			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			(event as Record<string, unknown>).request = request;

			await expect(POST(event)).rejects.toThrow();
		});
	});
});
