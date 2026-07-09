import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockSaveFile = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
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
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
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
			const event = createFormDataEvent(
				{ content: 'test', noteType: 'NOTE', timestamp: '100' },
				null as never
			);
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

		it('should reject non-text content before inserting', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const event = createFormDataEvent({
				content: new File(['Some note'], 'content.txt'),
				noteType: 'NOTE',
				timestamp: '100'
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Content is required');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject oversized multipart bodies before parsing form data', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				headers: { 'content-length': String(11 * 1024 * 1024 + 1) },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 413 });
			expect(mockSaveFile).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject oversized content before inserting', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const event = createFormDataEvent({
				content: 'a'.repeat(10_001),
				noteType: 'NOTE',
				timestamp: '100'
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('10000 characters or fewer');
			expect(mockDb.insert).not.toHaveBeenCalled();
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

		it('should reject non-text note type before inserting', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const event = createFormDataEvent({
				content: 'Some note',
				noteType: new File(['NOTE'], 'note-type.txt'),
				timestamp: '100'
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid note type');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject negative timestamp', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const event = createFormDataEvent({
				content: 'Some note',
				noteType: 'NOTE',
				timestamp: '-10'
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid timestamp');
		});

		it.each(['-1', '+1', '01', '1.5', '1e3', ' 1', '1 ', 'Infinity', '9007199254740992'])(
			'should reject invalid timestamp %s before inserting',
			async (timestamp) => {
				mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

				const event = createFormDataEvent({
					content: 'Some note',
					noteType: 'NOTE',
					timestamp
				});
				const response = await POST(event);

				expect(response.status).toBe(400);
				expect((await response.json()).error).toContain('Invalid timestamp');
				expect(mockDb.insert).not.toHaveBeenCalled();
			}
		);

		it('should reject non-text timestamp before inserting', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const event = createFormDataEvent({
				content: 'Some note',
				noteType: 'NOTE',
				timestamp: new File(['100'], 'timestamp.txt')
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid timestamp');
			expect(mockDb.insert).not.toHaveBeenCalled();
			expect(mockSaveFile).not.toHaveBeenCalled();
		});

		it('should handle screenshot upload (mock file, verify saveFile called)', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			const createdNote = {
				id: 3,
				sessionId: 10,
				content: 'Bug with screenshot',
				noteType: 'BUG',
				timestamp: 200,
				screenshotPath: 'exploratory/10/test-uuid-1234_screenshot.png'
			};
			mockInsertReturning(mockDb, [createdNote]);
			mockSaveFile.mockResolvedValue(undefined);

			const mockFile = new File(['fake image data'], 'screenshot.png', {
				type: 'image/png'
			});

			const formData = new FormData();
			formData.append('content', 'Bug with screenshot');
			formData.append('noteType', 'BUG');
			formData.append('timestamp', '200');
			formData.append('screenshot', mockFile);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				formData
			});
			const response = await POST(event);
			expect(response.status).toBe(201);

			expect(mockSaveFile).toHaveBeenCalledTimes(1);
			expect(mockSaveFile).toHaveBeenCalledWith(
				expect.stringContaining('exploratory/10/'),
				expect.any(Buffer)
			);
		});

		it('should reject active content as screenshots before saving', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);

			for (const file of [
				new File(['<svg><script>alert(1)</script></svg>'], 'screenshot.svg', {
					type: 'image/svg+xml'
				}),
				new File(['<html></html>'], 'screenshot.html', { type: 'text/html' }),
				new File(['fake image data'], 'screenshot.svg', { type: 'image/png' })
			]) {
				vi.clearAllMocks();
				mockDb.query.exploratorySession = { findFirst: vi.fn().mockResolvedValue(sampleSession) };

				const event = createFormDataEvent({
					content: 'Bug with screenshot',
					noteType: 'BUG',
					timestamp: '200',
					screenshot: file
				});

				const response = await POST(event);

				expect(response.status).toBe(400);
				expect((await response.json()).error).toContain('Screenshot must be');
				expect(mockSaveFile).not.toHaveBeenCalled();
				expect(mockDb.insert).not.toHaveBeenCalled();
			}
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
