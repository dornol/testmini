import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockCreateNotification = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: {
		id: 'id',
		projectId: 'project_id',
		approvalStatus: 'approval_status',
		createdBy: 'created_by'
	},
	approvalHistory: {
		id: 'id',
		testCaseId: 'test_case_id',
		fromStatus: 'from_status',
		toStatus: 'to_status',
		userId: 'user_id',
		comment: 'comment',
		createdAt: 'created_at'
	},
	projectMember: {
		projectId: 'project_id',
		userId: 'user_id',
		role: 'role'
	},
	user: {
		id: 'id',
		name: 'name'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a)
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
vi.mock('$lib/server/notifications', () => ({
	createNotification: mockCreateNotification
}));

const { GET, POST } = await import('./+server');

const PARAMS = { projectId: '1', testCaseId: '10' };

const sampleTestCase = {
	id: 10,
	projectId: 1,
	key: 'TC-0001',
	approvalStatus: 'DRAFT',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

const sampleHistoryEntry = {
	id: 1,
	fromStatus: 'DRAFT',
	toStatus: 'IN_REVIEW',
	userId: 'user-1',
	userName: 'Test User',
	comment: null,
	createdAt: new Date('2025-01-02')
};

describe('/api/projects/[projectId]/test-cases/[testCaseId]/approval', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.testCase = { findFirst: vi.fn() };
		mockDb.query.projectMember = { findFirst: vi.fn() };
	});

	// ──────── GET ────────

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return approval status and history', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW'
			});
			mockSelectResult(mockDb, [sampleHistoryEntry]);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(body.approvalStatus).toBe('IN_REVIEW');
			expect(body.history).toHaveLength(1);
			expect(body.history[0].fromStatus).toBe('DRAFT');
			expect(body.history[0].toStatus).toBe('IN_REVIEW');
			expect(body.history[0].userName).toBe('Test User');
		});

		it('should return empty history for new test case', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockSelectResult(mockDb, []);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(body.approvalStatus).toBe('DRAFT');
			expect(body.history).toHaveLength(0);
		});

		it('should return 404 when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	// ──────── POST - submit_review ────────

	describe('POST - submit_review', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: null,
				body: { action: 'submit_review' }
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should transition DRAFT to IN_REVIEW', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'DRAFT'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'submit_review' }
			});

			const response = await POST(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.approvalStatus).toBe('IN_REVIEW');
			expect(body.fromStatus).toBe('DRAFT');

			expect(mockDb.transaction).toHaveBeenCalled();
		});

		it('should reject if not in DRAFT status', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'submit_review' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toContain('Cannot submit_review from status IN_REVIEW');
		});

		it('should create approval_history record via transaction', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'DRAFT'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'submit_review' }
			});

			await POST(event);

			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
			const txFn = mockDb.transaction.mock.calls[0][0];
			// Verify transaction was called (the mock will have executed the function)
			expect(txFn).toBeTypeOf('function');
		});
	});

	// ──────── POST - approve ────────

	describe('POST - approve', () => {
		it('should transition IN_REVIEW to APPROVED', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW',
				createdBy: 'other-user'
			});
			mockDb.query.projectMember.findFirst.mockResolvedValue({
				projectId: 1,
				userId: 'user-1',
				role: 'QA'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'approve' }
			});

			const response = await POST(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.approvalStatus).toBe('APPROVED');
			expect(body.fromStatus).toBe('IN_REVIEW');
		});

		it('should reject if not in IN_REVIEW status', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'DRAFT',
				createdBy: 'other-user'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'approve' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toContain('Cannot approve from status DRAFT');
		});

		it('should reject if user is the test case creator (self-approve)', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW',
				createdBy: testUser.id // same as the authenticated user
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'approve' }
			});

			const response = await POST(event);
			expect(response.status).toBe(403);

			const body = await response.json();
			expect(body.error).toContain('cannot approve your own test case');
		});

		it('should reject if user role is DEV (not QA or PROJECT_ADMIN)', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW',
				createdBy: 'other-user'
			});
			mockDb.query.projectMember.findFirst.mockResolvedValue({
				projectId: 1,
				userId: 'user-1',
				role: 'DEV'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'approve' }
			});

			const response = await POST(event);
			expect(response.status).toBe(403);

			const body = await response.json();
			expect(body.error).toContain('Only PROJECT_ADMIN or QA');
		});

		it('should send notification on approve', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW',
				createdBy: 'other-user',
				key: 'TC-0001'
			});
			mockDb.query.projectMember.findFirst.mockResolvedValue({
				projectId: 1,
				userId: 'user-1',
				role: 'QA'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'approve' }
			});

			await POST(event);

			expect(mockCreateNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'other-user',
					type: 'APPROVAL_STATUS_CHANGED',
					title: 'Test case approved',
					projectId: 1
				})
			);
		});

		it('should create approval_history record via transaction', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW',
				createdBy: 'other-user'
			});
			mockDb.query.projectMember.findFirst.mockResolvedValue({
				projectId: 1,
				userId: 'user-1',
				role: 'PROJECT_ADMIN'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'approve' }
			});

			await POST(event);
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		});
	});

	// ──────── POST - reject ────────

	describe('POST - reject', () => {
		it('should transition IN_REVIEW to REJECTED with comment', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW',
				createdBy: 'other-user'
			});
			mockDb.query.projectMember.findFirst.mockResolvedValue({
				projectId: 1,
				userId: 'user-1',
				role: 'QA'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'reject', comment: 'Missing expected results' }
			});

			const response = await POST(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.approvalStatus).toBe('REJECTED');
			expect(body.fromStatus).toBe('IN_REVIEW');
		});

		it('should require a comment', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW',
				createdBy: 'other-user'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'reject' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toContain('comment is required');
		});

		it('should reject empty/whitespace comment', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW',
				createdBy: 'other-user'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'reject', comment: '   ' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toContain('comment is required');
		});

		it('should reject if not in IN_REVIEW status', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'APPROVED',
				createdBy: 'other-user'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'reject', comment: 'Needs rework' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toContain('Cannot reject from status APPROVED');
		});

		it('should reject if user role is DEV', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW',
				createdBy: 'other-user'
			});
			mockDb.query.projectMember.findFirst.mockResolvedValue({
				projectId: 1,
				userId: 'user-1',
				role: 'DEV'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'reject', comment: 'Not good enough' }
			});

			const response = await POST(event);
			expect(response.status).toBe(403);

			const body = await response.json();
			expect(body.error).toContain('Only PROJECT_ADMIN or QA');
		});

		it('should send notification on reject with comment', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW',
				createdBy: 'other-user',
				key: 'TC-0001'
			});
			mockDb.query.projectMember.findFirst.mockResolvedValue({
				projectId: 1,
				userId: 'user-1',
				role: 'QA'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'reject', comment: 'Needs more detail' }
			});

			await POST(event);

			expect(mockCreateNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'other-user',
					type: 'APPROVAL_STATUS_CHANGED',
					title: 'Test case rejected',
					message: expect.stringContaining('Needs more detail')
				})
			);
		});
	});

	// ──────── POST - revert_draft ────────

	describe('POST - revert_draft', () => {
		it('should transition APPROVED to DRAFT', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'APPROVED'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'revert_draft' }
			});

			const response = await POST(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.approvalStatus).toBe('DRAFT');
			expect(body.fromStatus).toBe('APPROVED');
		});

		it('should transition REJECTED to DRAFT', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'REJECTED'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'revert_draft' }
			});

			const response = await POST(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.approvalStatus).toBe('DRAFT');
			expect(body.fromStatus).toBe('REJECTED');
		});

		it('should reject if already in DRAFT status', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'DRAFT'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'revert_draft' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toContain('Cannot revert_draft from status DRAFT');
		});

		it('should reject if in IN_REVIEW status', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'IN_REVIEW'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'revert_draft' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toContain('Cannot revert_draft from status IN_REVIEW');
		});

		it('should not send notification on revert_draft', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({
				...sampleTestCase,
				approvalStatus: 'APPROVED'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'revert_draft' }
			});

			await POST(event);
			expect(mockCreateNotification).not.toHaveBeenCalled();
		});
	});

	// ──────── POST - invalid action ────────

	describe('POST - invalid action', () => {
		it('should return 400 for unknown action', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'delete' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toContain('Invalid action');
			expect(body.error).toContain('submit_review, approve, reject, revert_draft');
		});

		it('should return 400 when action is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {}
			});

			const response = await POST(event);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toContain('Invalid action');
		});
	});

	// ──────── POST - test case not found ────────

	describe('POST - test case not found', () => {
		it('should return 404 when test case does not exist', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { action: 'submit_review' }
			});

			const response = await POST(event);
			expect(response.status).toBe(404);

			const body = await response.json();
			expect(body.error).toContain('Test case not found');
		});
	});
});
