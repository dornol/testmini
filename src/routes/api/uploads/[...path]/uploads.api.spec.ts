import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
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
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'MEMBER' })
	};
});
vi.mock('$lib/server/storage', () => ({
	getFile: vi.fn().mockResolvedValue(Buffer.from('image-bytes'))
}));

const { GET } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');
const storage = await import('$lib/server/storage');

const screenshotPath = 'exploratory/10/test-uuid_screenshot.png';

describe('/api/uploads/[...path]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'MEMBER' });
		vi.mocked(storage.getFile).mockResolvedValue(Buffer.from('image-bytes'));
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({
			method: 'GET',
			params: { path: screenshotPath },
			user: null
		});

		await expect(GET(event)).rejects.toThrow();
	});

	it('should reject path traversal', async () => {
		const event = createMockEvent({
			method: 'GET',
			params: { path: 'exploratory/../secret.txt' },
			user: testUser
		});

		await expect(GET(event)).rejects.toMatchObject({ status: 400 });
		expect(storage.getFile).not.toHaveBeenCalled();
	});

	it('should reject non-exploratory object keys', async () => {
		const event = createMockEvent({
			method: 'GET',
			params: { path: 'testcase/1/file.png' },
			user: testUser
		});

		await expect(GET(event)).rejects.toMatchObject({ status: 404 });
		expect(mockDb.select).not.toHaveBeenCalled();
		expect(storage.getFile).not.toHaveBeenCalled();
	});

	it('should return 404 when screenshot path is not registered in DB', async () => {
		mockSelectResult(mockDb, []);
		const event = createMockEvent({
			method: 'GET',
			params: { path: screenshotPath },
			user: testUser
		});

		await expect(GET(event)).rejects.toMatchObject({ status: 404 });
		expect(storage.getFile).not.toHaveBeenCalled();
	});

	it('should not read file when project access is denied', async () => {
		mockSelectResult(mockDb, [{ projectId: 5 }]);
		vi.mocked(authUtils.requireProjectAccess).mockRejectedValue(
			Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
		);
		const event = createMockEvent({
			method: 'GET',
			params: { path: screenshotPath },
			user: testUser
		});

		await expect(GET(event)).rejects.toThrow();
		expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 5);
		expect(storage.getFile).not.toHaveBeenCalled();
	});

	it('should return registered screenshot for authorized user', async () => {
		mockSelectResult(mockDb, [{ projectId: 5 }]);
		const event = createMockEvent({
			method: 'GET',
			params: { path: screenshotPath },
			user: testUser
		});

		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/png');
		expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 5);
		expect(storage.getFile).toHaveBeenCalledWith(screenshotPath);
	});
});
