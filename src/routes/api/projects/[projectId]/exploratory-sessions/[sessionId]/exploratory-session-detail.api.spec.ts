import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockSelectResult,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	exploratorySession: {
		id: 'id',
		projectId: 'project_id',
		title: 'title',
		charter: 'charter',
		status: 'status',
		startedAt: 'started_at',
		pausedDuration: 'paused_duration',
		completedAt: 'completed_at',
		environment: 'environment',
		tags: 'tags',
		summary: 'summary',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	sessionNote: {
		id: 'id',
		sessionId: 'session_id',
		content: 'content',
		noteType: 'note_type',
		timestamp: 'timestamp',
		screenshotPath: 'screenshot_path'
	},
	user: {
		id: 'id',
		name: 'name',
		email: 'email'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => a)
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

const { GET, PATCH, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', sessionId: '10' };

const sampleSession = {
	id: 10,
	projectId: 1,
	title: 'Explore login flow',
	charter: 'Test all login scenarios',
	status: 'ACTIVE',
	startedAt: new Date('2025-06-01T10:00:00Z'),
	pausedDuration: 0,
	completedAt: null,
	environment: 'Chrome / macOS',
	tags: ['auth'],
	summary: null,
	createdBy: 'user-1'
};

const sampleNotes = [
	{
		id: 1,
		sessionId: 10,
		content: 'Found a bug on login page',
		noteType: 'BUG',
		timestamp: 120,
		screenshotPath: null
	}
];

const sampleCreator = {
	id: 'user-1',
	name: 'Test User',
	email: 'test@example.com'
};

describe('/api/projects/[projectId]/exploratory-sessions/[sessionId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.exploratorySession = { findFirst: vi.fn() };
		mockDb.query.user = { findFirst: vi.fn() };
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when session not found', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(null);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			expect(response.status).toBe(404);
			expect((await response.json()).error).toContain('Session not found');
		});

		it('should return session with notes', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);
			mockSelectResult(mockDb, sampleNotes);
			mockDb.query.user.findFirst.mockResolvedValue(sampleCreator);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.title).toBe('Explore login flow');
			expect(body.notes).toHaveLength(1);
			expect(body.notes[0].noteType).toBe('BUG');
			expect(body.creator.name).toBe('Test User');
		});
	});

	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: null,
				body: { action: 'pause' }
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when session not found', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { action: 'pause' }
			});
			const response = await PATCH(event);
			expect(response.status).toBe(404);
			expect((await response.json()).error).toContain('Session not found');
		});

		it('should pause an active session', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue({
				...sampleSession,
				status: 'ACTIVE'
			});
			const updatedSession = { ...sampleSession, status: 'PAUSED' };
			mockUpdateReturning(mockDb, [updatedSession]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { action: 'pause', pausedDuration: 0 }
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.status).toBe('PAUSED');
		});

		it('should reject pausing a non-active session', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue({
				...sampleSession,
				status: 'PAUSED'
			});

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { action: 'pause' }
			});
			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('not active');
		});

		it('should resume a paused session', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue({
				...sampleSession,
				status: 'PAUSED'
			});
			const updatedSession = { ...sampleSession, status: 'ACTIVE' };
			mockUpdateReturning(mockDb, [updatedSession]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { action: 'resume', pausedDuration: 5000 }
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.status).toBe('ACTIVE');
		});

		it('should reject resuming a non-paused session', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue({
				...sampleSession,
				status: 'ACTIVE'
			});

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { action: 'resume' }
			});
			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('not paused');
		});

		it('should complete a session with summary', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue({
				...sampleSession,
				status: 'ACTIVE'
			});
			const updatedSession = {
				...sampleSession,
				status: 'COMPLETED',
				summary: 'Found 2 bugs',
				completedAt: new Date()
			};
			mockUpdateReturning(mockDb, [updatedSession]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { action: 'complete', summary: 'Found 2 bugs', pausedDuration: 1000 }
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.status).toBe('COMPLETED');
			expect(body.summary).toBe('Found 2 bugs');
		});

		it('should reject completing an already completed session', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue({
				...sampleSession,
				status: 'COMPLETED'
			});

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { action: 'complete' }
			});
			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('already completed');
		});

		it('should update title and charter', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);
			const updatedSession = {
				...sampleSession,
				title: 'Updated title',
				charter: 'Updated charter'
			};
			mockUpdateReturning(mockDb, [updatedSession]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { title: 'Updated title', charter: 'Updated charter' }
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.title).toBe('Updated title');
			expect(body.charter).toBe('Updated charter');
		});

		it('should reject empty title', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { title: '   ' }
			});
			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Title cannot be empty');
		});

		it('should reject when no fields to update', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

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
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when session not found', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(null);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			expect(response.status).toBe(404);
			expect((await response.json()).error).toContain('Session not found');
		});

		it('should delete session successfully', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.success).toBe(true);
			expect(mockDb.delete).toHaveBeenCalled();
		});
	});
});
