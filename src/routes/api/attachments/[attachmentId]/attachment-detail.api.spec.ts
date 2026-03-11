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

const executionAttachment = {
	id: 2,
	referenceType: 'EXECUTION',
	referenceId: 200,
	fileName: 'log.txt',
	contentType: 'text/plain',
	objectKey: 'attachments/EXECUTION/200/log.txt',
	fileSize: 512,
	uploadedBy: testUser.id
};

const failureAttachment = {
	id: 3,
	referenceType: 'FAILURE',
	referenceId: 300,
	fileName: 'error-trace.txt',
	contentType: 'text/plain',
	objectKey: 'attachments/FAILURE/300/error-trace.txt',
	fileSize: 1024,
	uploadedBy: testUser.id
};

function setupAttachmentQuery(record: unknown) {
	mockDb.query.attachment = { findFirst: vi.fn().mockResolvedValue(record) };
}

function setupTestCaseQuery(result: unknown) {
	mockDb.query.testCase = { findFirst: vi.fn().mockResolvedValue(result) };
}

function setupExecutionQuery(result: unknown) {
	mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(result) };
}

function setupFailureQuery(result: unknown) {
	mockDb.query.testFailureDetail = { findFirst: vi.fn().mockResolvedValue(result) };
}

describe('/api/attachments/[attachmentId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'MEMBER' });
		vi.mocked(storage.getFile).mockResolvedValue(Buffer.from('file-content'));
		vi.mocked(storage.deleteFile).mockResolvedValue(undefined);
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '1' },
				user: null
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 for non-existent attachment', async () => {
			setupAttachmentQuery(undefined);

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '999' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 400 for invalid attachment ID', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: 'abc' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 403 when user has no project access', async () => {
			setupAttachmentQuery(sampleAttachment);
			setupTestCaseQuery({ projectId: 1 });
			vi.mocked(authUtils.requireProjectAccess).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '1' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 1);
		});

		it('should return file content for authorized user (TESTCASE reference)', async () => {
			setupAttachmentQuery(sampleAttachment);
			setupTestCaseQuery({ projectId: 1 });

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '1' },
				user: testUser
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('image/png');
			expect(response.headers.get('Content-Disposition')).toContain('screenshot.png');
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 1);
			expect(storage.getFile).toHaveBeenCalledWith(sampleAttachment.objectKey);
		});

		it('should resolve project via EXECUTION reference type', async () => {
			setupAttachmentQuery(executionAttachment);
			setupExecutionQuery({ testRun: { projectId: 5 } });

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '2' },
				user: testUser
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 5);
		});

		it('should resolve project via FAILURE reference type', async () => {
			setupAttachmentQuery(failureAttachment);
			setupFailureQuery({ testExecution: { testRun: { projectId: 7 } } });

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '3' },
				user: testUser
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 7);
		});

		it('should return 404 when referenced test case not found', async () => {
			setupAttachmentQuery(sampleAttachment);
			setupTestCaseQuery(undefined);

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '1' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when referenced execution not found', async () => {
			setupAttachmentQuery(executionAttachment);
			setupExecutionQuery(undefined);

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '2' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when referenced failure detail not found', async () => {
			setupAttachmentQuery(failureAttachment);
			setupFailureQuery(undefined);

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '3' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should use application/octet-stream when contentType is null', async () => {
			const noContentType = { ...sampleAttachment, contentType: null };
			setupAttachmentQuery(noContentType);
			setupTestCaseQuery({ projectId: 1 });

			const event = createMockEvent({
				method: 'GET',
				params: { attachmentId: '1' },
				user: testUser
			});
			const response = await GET(event);

			expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '1' },
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 for non-existent attachment', async () => {
			setupAttachmentQuery(undefined);

			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '999' },
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 400 for invalid attachment ID', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: 'not-a-number' },
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 403 when user has no project access', async () => {
			setupAttachmentQuery(sampleAttachment);
			setupTestCaseQuery({ projectId: 1 });
			vi.mocked(authUtils.requireProjectAccess).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '1' },
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 1);
			expect(storage.deleteFile).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should delete attachment with TESTCASE reference for authorized user', async () => {
			setupAttachmentQuery(sampleAttachment);
			setupTestCaseQuery({ projectId: 1 });

			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '1' },
				user: testUser
			});
			const response = await DELETE(event);

			expect(response.status).toBe(204);
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 1);
			expect(storage.deleteFile).toHaveBeenCalledWith(sampleAttachment.objectKey);
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it('should delete attachment with EXECUTION reference for authorized user', async () => {
			setupAttachmentQuery(executionAttachment);
			setupExecutionQuery({ testRun: { projectId: 5 } });

			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '2' },
				user: testUser
			});
			const response = await DELETE(event);

			expect(response.status).toBe(204);
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 5);
			expect(storage.deleteFile).toHaveBeenCalledWith(executionAttachment.objectKey);
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it('should delete attachment with FAILURE reference for authorized user', async () => {
			setupAttachmentQuery(failureAttachment);
			setupFailureQuery({ testExecution: { testRun: { projectId: 7 } } });

			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '3' },
				user: testUser
			});
			const response = await DELETE(event);

			expect(response.status).toBe(204);
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 7);
			expect(storage.deleteFile).toHaveBeenCalledWith(failureAttachment.objectKey);
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it('should return 404 when referenced test case not found during delete', async () => {
			setupAttachmentQuery(sampleAttachment);
			setupTestCaseQuery(undefined);

			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '1' },
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
			expect(storage.deleteFile).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should return 404 when referenced execution not found during delete', async () => {
			setupAttachmentQuery(executionAttachment);
			setupExecutionQuery(undefined);

			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '2' },
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
			expect(storage.deleteFile).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should not delete file or DB record when project access is denied', async () => {
			setupAttachmentQuery(executionAttachment);
			setupExecutionQuery({ testRun: { projectId: 5 } });
			vi.mocked(authUtils.requireProjectAccess).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'DELETE',
				params: { attachmentId: '2' },
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 5);
			expect(storage.deleteFile).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});
});
