import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockSaveFile = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	exploratorySession: {
		id: 'id',
		projectId: 'project_id'
	},
	sessionNote: {
		id: 'id',
		sessionId: 'session_id',
		content: 'content',
		noteType: 'note_type',
		timestamp: 'timestamp',
		screenshotPath: 'screenshot_path'
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
vi.mock('$lib/server/storage', () => ({
	saveFile: mockSaveFile
}));
vi.mock('node:crypto', () => ({
	randomUUID: () => 'test-uuid-1234'
}));

const { POST } = await import('./+server');

const PARAMS = { projectId: '1', sessionId: '10' };

const sampleSession = {
	id: 10,
	projectId: 1,
	title: 'Explore login',
	status: 'ACTIVE'
};

function createFormDataEvent(fields: Record<string, string | File>, user = testUser) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		formData.append(key, value);
	}
	return createMockEvent({
		method: 'POST',
		params: PARAMS,
		user,
		formData
	});
}

describe('/api/projects/[projectId]/exploratory-sessions/[sessionId]/notes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.exploratorySession = { findFirst: vi.fn() };
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createFormDataEvent({ content: 'test', noteType: 'NOTE', timestamp: '100' }, null as never);
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 404 when session not found', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(null);

			const event = createFormDataEvent({
				content: 'Found a bug',
				noteType: 'BUG',
				timestamp: '120'
			});
			const response = await POST(event);
			expect(response.status).toBe(404);
			expect((await response.json()).error).toContain('Session not found');
		});

		it('should reject missing content', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const event = createFormDataEvent({
				content: '',
				noteType: 'NOTE',
				timestamp: '100'
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Content is required');
		});

		it('should create note with specified note type', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const createdNote = {
				id: 1,
				sessionId: 10,
				content: 'Login button is misaligned',
				noteType: 'BUG',
				timestamp: 120,
				screenshotPath: null
			};
			mockInsertReturning(mockDb, [createdNote]);

			const event = createFormDataEvent({
				content: 'Login button is misaligned',
				noteType: 'BUG',
				timestamp: '120'
			});
			const response = await POST(event);
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.content).toBe('Login button is misaligned');
			expect(body.noteType).toBe('BUG');
			expect(body.timestamp).toBe(120);
		});

		it('should use default note type when not specified', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const createdNote = {
				id: 2,
				sessionId: 10,
				content: 'General observation',
				noteType: 'NOTE',
				timestamp: 60,
				screenshotPath: null
			};
			mockInsertReturning(mockDb, [createdNote]);

			const event = createFormDataEvent({
				content: 'General observation',
				timestamp: '60'
			});
			const response = await POST(event);
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.noteType).toBe('NOTE');
		});

		it('should reject invalid note type', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const event = createFormDataEvent({
				content: 'Some note',
				noteType: 'INVALID_TYPE',
				timestamp: '100'
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid note type');
		});

		it('should accept all valid note types', async () => {
			for (const noteType of ['NOTE', 'BUG', 'QUESTION', 'IDEA']) {
				vi.clearAllMocks();
				mockDb.query.exploratorySession = { findFirst: vi.fn() };
				mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

				const createdNote = {
					id: 1,
					sessionId: 10,
					content: `A ${noteType} note`,
					noteType,
					timestamp: 100,
					screenshotPath: null
				};
				mockInsertReturning(mockDb, [createdNote]);

				const event = createFormDataEvent({
					content: `A ${noteType} note`,
					noteType,
					timestamp: '100'
				});
				const response = await POST(event);
				expect(response.status).toBe(201);
			}
		});
	});
});
