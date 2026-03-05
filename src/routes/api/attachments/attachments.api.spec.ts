import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
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
	}
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
	saveFile: vi.fn().mockResolvedValue(undefined)
}));

// Import after mocks
const { POST } = await import('./+server');

function createFileFormData(
	overrides: { name?: string; type?: string; size?: number } = {}
) {
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
		});

		it('should return 400 when file exceeds 10MB size limit', async () => {
			const overSize = 10 * 1024 * 1024 + 1; // 10MB + 1 byte
			const formData = createFileFormData({ size: overSize });
			const event = createMockEvent({ method: 'POST', formData, user: testUser });

			await expect(POST(event)).rejects.toThrow();
		});
	});
});
