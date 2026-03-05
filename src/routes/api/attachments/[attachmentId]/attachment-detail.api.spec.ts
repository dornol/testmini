import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	attachment: {
		id: 'id',
		referenceType: 'reference_type',
		referenceId: 'reference_id',
		fileName: 'file_name',
		contentType: 'content_type',
		objectKey: 'object_key',
		fileSize: 'file_size',
		uploadedBy: 'uploaded_by',
		uploadedAt: 'uploaded_at'
	},
	testCase: { id: 'id', projectId: 'project_id' },
	testExecution: { id: 'id' },
	testFailureDetail: { id: 'id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'MEMBER' })
	};
});
vi.mock('$lib/server/storage', () => ({
	getFile: vi.fn().mockResolvedValue(Buffer.from('file-content')),
	deleteFile: vi.fn().mockResolvedValue(undefined)
}));

// Import after mocks
const { GET, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');
const storage = await import('$lib/server/storage');

const sampleAttachment = {
	id: 1,
	referenceType: 'TESTCASE',
	referenceId: 10,
	fileName: 'screenshot.png',
	contentType: 'image/png',
	objectKey: 'attachments/TESTCASE/10/screenshot.png',
	fileSize: 2048,
	uploadedBy: testUser.id
};

describe('/api/attachments/[attachmentId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'MEMBER' });
		vi.mocked(storage.getFile).mockResolvedValue(Buffer.from('file-content'));
		vi.mocked(storage.deleteFile).mockResolvedValue(undefined);
	});

	describe('GET', () => {
		it('should return file for authorized user', async () => {
			mockDb.query.attachment = { findFirst: vi.fn().mockResolvedValue(sampleAttachment) };
			mockDb.query.testCase = { findFirst: vi.fn().mockResolvedValue({ projectId: 1 }) };

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '1' },
				user: testUser
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('image/png');
			expect(response.headers.get('Content-Disposition')).toContain('screenshot.png');
		});

		it('should return 404 for non-existent attachment', async () => {
			mockDb.query.attachment = { findFirst: vi.fn().mockResolvedValue(undefined) };

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '999' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '1' },
				user: null
			});
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('DELETE', () => {
		it('should remove attachment for owner', async () => {
			mockDb.query.attachment = { findFirst: vi.fn().mockResolvedValue(sampleAttachment) };

			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '1' },
				user: testUser
			});
			const response = await DELETE(event);

			expect(response.status).toBe(204);
			expect(storage.deleteFile).toHaveBeenCalledWith(sampleAttachment.objectKey);
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '1' },
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});
	});
});
