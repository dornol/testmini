import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
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
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	ilike: vi.fn((a: unknown, b: unknown) => ['ilike', a, b]),
	count: vi.fn(() => 'count'),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/storage', () => ({
	generateObjectKey: vi.fn(() => 'attachments/TESTCASE/1/test.png'),
	saveFile: vi.fn().mockResolvedValue(undefined),
	deleteFile: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'MEMBER' })
	};
});

// Import after mocks
const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');
const storage = await import('$lib/server/storage');

function createFileFormData(overrides: { name?: string; type?: string; size?: number } = {}) {
	const { name = 'test.png', type = 'image/png', size = 1024 } = overrides;
	const content = new Uint8Array(size);
	const file = new File([content], name, { type });
	const formData = new FormData();
	formData.set('file', file);
	formData.set('referenceType', 'TESTCASE');
	formData.set('referenceId', '1');
	return formData;
}

describe('/api/attachments', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.testCase = { findFirst: vi.fn().mockResolvedValue({ projectId: 1 }) };
		mockDb.query.testExecution = { findFirst: vi.fn() };
		mockDb.query.testFailureDetail = { findFirst: vi.fn() };
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'MEMBER' });
		vi.mocked(storage.saveFile).mockResolvedValue(undefined);
		vi.mocked(storage.deleteFile).mockResolvedValue(undefined);
	});

	describe('GET', () => {
		it('should require project access before listing attachments', async () => {
			const event = createMockEvent({
				method: 'GET',
				searchParams: { referenceType: 'TESTCASE', referenceId: '1' },
				user: testUser
			});

			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 1);
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should not list attachments when project access is denied', async () => {
			vi.mocked(authUtils.requireProjectAccess).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);
			const event = createMockEvent({
				method: 'GET',
				searchParams: { referenceType: 'TESTCASE', referenceId: '1' },
				user: testUser
			});

			await expect(GET(event)).rejects.toThrow();
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 1);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should reject unsafe reference IDs before resolving project access', async () => {
			const event = createMockEvent({
				method: 'GET',
				searchParams: {
					referenceType: 'TESTCASE',
					referenceId: String(Number.MAX_SAFE_INTEGER + 1)
				},
				user: testUser
			});

			await expect(GET(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.query.testCase.findFirst).not.toHaveBeenCalled();
			expect(authUtils.requireProjectAccess).not.toHaveBeenCalled();
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should reject decimal reference IDs before resolving project access', async () => {
			const event = createMockEvent({
				method: 'GET',
				searchParams: { referenceType: 'TESTCASE', referenceId: '1.5' },
				user: testUser
			});

			await expect(GET(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.query.testCase.findFirst).not.toHaveBeenCalled();
			expect(authUtils.requireProjectAccess).not.toHaveBeenCalled();
			expect(mockDb.select).not.toHaveBeenCalled();
		});
	});

	describe('POST', () => {
		it('should return 400 for disallowed MIME type', async () => {
			const formData = createFileFormData({ name: 'malware.exe', type: 'application/exe' });
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			await expect(POST(event)).rejects.toThrow();
		});

		it('should allow valid MIME types (image/png)', async () => {
			const sampleAttachment = {
				id: 1,
				referenceType: 'TESTCASE',
				referenceId: 1,
				fileName: 'test.png',
				contentType: 'image/png',
				objectKey: 'attachments/TESTCASE/1/test.png',
				fileSize: 1024,
				uploadedBy: testUser.id
			};
			mockInsertReturning(mockDb, [sampleAttachment]);

			const formData = createFileFormData({ name: 'test.png', type: 'image/png' });
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			const response = await POST(event);

			expect(response.status).toBe(201);
			const data = await response.json();
			expect(data.id).toBe(sampleAttachment.id);
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 1);
		});

		it('should allow valid MIME types (application/pdf)', async () => {
			const sampleAttachment = {
				id: 2,
				referenceType: 'TESTCASE',
				referenceId: 1,
				fileName: 'doc.pdf',
				contentType: 'application/pdf',
				objectKey: 'attachments/TESTCASE/1/doc.pdf',
				fileSize: 2048,
				uploadedBy: testUser.id
			};
			mockInsertReturning(mockDb, [sampleAttachment]);

			const formData = createFileFormData({ name: 'doc.pdf', type: 'application/pdf' });
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			const response = await POST(event);

			expect(response.status).toBe(201);
			const data = await response.json();
			expect(data.id).toBe(sampleAttachment.id);
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 1);
		});

		it('should return 400 when file exceeds 10MB size limit', async () => {
			const overSize = 10 * 1024 * 1024 + 1; // 10MB + 1 byte
			const formData = createFileFormData({ size: overSize });
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject empty file names before saving file', async () => {
			const formData = createFileFormData({ name: '   ', type: 'image/png' });
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			await expect(POST(event)).rejects.toMatchObject({ status: 400 });
			expect(authUtils.requireProjectAccess).not.toHaveBeenCalled();
			expect(storage.saveFile).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject overlong file names before saving file', async () => {
			const formData = createFileFormData({ name: `${'a'.repeat(256)}.png`, type: 'image/png' });
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			await expect(POST(event)).rejects.toMatchObject({ status: 400 });
			expect(authUtils.requireProjectAccess).not.toHaveBeenCalled();
			expect(storage.saveFile).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject oversized multipart bodies before parsing form data', async () => {
			const formData = vi.fn();
			const baseEvent = createMockEvent({ method: 'POST', user: testUser }) as Record<
				string,
				unknown
			>;
			const event = {
				...baseEvent,
				request: {
					headers: new Headers({ 'content-length': String(11 * 1024 * 1024 + 1) }),
					formData
				}
			};

			await expect(POST(event as never)).rejects.toMatchObject({ status: 413 });
			expect(formData).not.toHaveBeenCalled();
			expect(authUtils.requireProjectAccess).not.toHaveBeenCalled();
			expect(storage.saveFile).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it.each(['abc', '-1', '1.5', 'Infinity', '9007199254740992'])(
			'should reject invalid multipart content-length %s before parsing form data',
			async (contentLength) => {
				const formData = vi.fn();
				const baseEvent = createMockEvent({ method: 'POST', user: testUser }) as Record<
					string,
					unknown
				>;
				const event = {
					...baseEvent,
					request: {
						headers: new Headers({ 'content-length': contentLength }),
						formData
					}
				};

				await expect(POST(event as never)).rejects.toMatchObject({ status: 400 });
				expect(formData).not.toHaveBeenCalled();
				expect(authUtils.requireProjectAccess).not.toHaveBeenCalled();
				expect(storage.saveFile).not.toHaveBeenCalled();
				expect(mockDb.insert).not.toHaveBeenCalled();
			}
		);

		it('should not save file when project access is denied', async () => {
			vi.mocked(authUtils.requireProjectAccess).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);
			const formData = createFileFormData({ name: 'test.png', type: 'image/png' });
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			await expect(POST(event)).rejects.toThrow();
			expect(authUtils.requireProjectAccess).toHaveBeenCalledWith(testUser, 1);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should remove the saved file when DB insert fails', async () => {
			const insertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockRejectedValue(new Error('database unavailable'))
			};
			mockDb.insert.mockReturnValueOnce(insertChain as never);

			const formData = createFileFormData({ name: 'test.png', type: 'image/png' });
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			await expect(POST(event)).rejects.toThrow('database unavailable');
			expect(storage.saveFile).toHaveBeenCalledWith(
				'attachments/TESTCASE/1/test.png',
				expect.any(Buffer)
			);
			expect(storage.deleteFile).toHaveBeenCalledWith('attachments/TESTCASE/1/test.png');
		});

		it('should preserve the DB insert error when cleanup also fails', async () => {
			const insertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockRejectedValue(new Error('database unavailable'))
			};
			mockDb.insert.mockReturnValueOnce(insertChain as never);
			vi.mocked(storage.deleteFile).mockRejectedValueOnce(new Error('storage unavailable'));

			const formData = createFileFormData({ name: 'test.png', type: 'image/png' });
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			await expect(POST(event)).rejects.toThrow('database unavailable');
			expect(storage.deleteFile).toHaveBeenCalledWith('attachments/TESTCASE/1/test.png');
		});

		it('should reject unsafe reference IDs before saving file', async () => {
			const formData = createFileFormData({ name: 'test.png', type: 'image/png' });
			formData.set('referenceId', String(Number.MAX_SAFE_INTEGER + 1));
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			await expect(POST(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.query.testCase.findFirst).not.toHaveBeenCalled();
			expect(authUtils.requireProjectAccess).not.toHaveBeenCalled();
			expect(storage.saveFile).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject decimal reference IDs before saving file', async () => {
			const formData = createFileFormData({ name: 'test.png', type: 'image/png' });
			formData.set('referenceId', '1.5');
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			await expect(POST(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.query.testCase.findFirst).not.toHaveBeenCalled();
			expect(authUtils.requireProjectAccess).not.toHaveBeenCalled();
			expect(storage.saveFile).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});
});
