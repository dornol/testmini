import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockDeleteFile = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	exploratorySession: {
		id: 'id',
		projectId: 'project_id'
	},
	sessionNote: {
		id: 'id',
		sessionId: 'session_id',
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
	deleteFile: mockDeleteFile
}));

const { DELETE } = await import('./+server');

const PARAMS = { projectId: '1', sessionId: '10', noteId: '5' };

const sampleSession = {
	id: 10,
	projectId: 1,
	title: 'Explore login',
	status: 'ACTIVE'
};

const sampleNote = {
	id: 5,
	sessionId: 10,
	content: 'Found a bug',
	noteType: 'BUG',
	timestamp: 120,
	screenshotPath: null
};

const sampleNoteWithScreenshot = {
	...sampleNote,
	screenshotPath: 'exploratory/10/test-uuid_screenshot.png'
};

describe('/api/projects/[projectId]/exploratory-sessions/[sessionId]/notes/[noteId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.exploratorySession = { findFirst: vi.fn() };
		mockDb.query.sessionNote = { findFirst: vi.fn() };
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

		it('should return 404 when note not found', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);
			mockDb.query.sessionNote.findFirst.mockResolvedValue(null);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			expect(response.status).toBe(404);
			expect((await response.json()).error).toContain('Note not found');
		});

		it('should delete note successfully', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);
			mockDb.query.sessionNote.findFirst.mockResolvedValue(sampleNote);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.success).toBe(true);
			expect(mockDb.delete).toHaveBeenCalled();
			expect(mockDeleteFile).not.toHaveBeenCalled();
		});

		it('should delete screenshot file when note has a screenshot', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);
			mockDb.query.sessionNote.findFirst.mockResolvedValue(sampleNoteWithScreenshot);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.success).toBe(true);
			expect(mockDeleteFile).toHaveBeenCalledWith('exploratory/10/test-uuid_screenshot.png');
			expect(mockDb.delete).toHaveBeenCalled();
		});
	});
});
