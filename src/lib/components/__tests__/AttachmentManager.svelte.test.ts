import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AttachmentManagerTest from './helpers/AttachmentManagerTest.svelte';

// Mock lucide icons as no-op Svelte components
vi.mock('@lucide/svelte/icons/upload', () => ({ default: () => {} }));
vi.mock('@lucide/svelte/icons/upload-cloud', () => ({ default: () => {} }));
vi.mock('@lucide/svelte/icons/loader-2', () => ({ default: () => {} }));

const mockAttachments = [
	{
		id: 1,
		fileName: 'screenshot.png',
		contentType: 'image/png',
		fileSize: 204800,
		uploadedAt: '2026-03-01T10:00:00Z'
	},
	{
		id: 2,
		fileName: 'report.pdf',
		contentType: 'application/pdf',
		fileSize: 1048576,
		uploadedAt: '2026-03-02T12:00:00Z'
	},
	{
		id: 3,
		fileName: 'notes.txt',
		contentType: 'text/plain',
		fileSize: 512,
		uploadedAt: '2026-03-03T08:00:00Z'
	}
];

function mockFetchWith(data: unknown[], ok = true) {
	const fn = vi.fn().mockResolvedValue({
		ok,
		json: () => Promise.resolve(data)
	});
	vi.stubGlobal('fetch', fn);
	return fn;
}

describe('AttachmentManager', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	// 1. Renders title with attachment count
	it('renders title with attachment count', async () => {
		mockFetchWith(mockAttachments);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1 }
		});

		await vi.waitFor(() => {
			expect(screen.getByText('첨부파일 (3)')).toBeTruthy();
		});
	});

	// 2. Shows upload button when editable
	it('shows upload button when editable', async () => {
		mockFetchWith([]);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1, editable: true }
		});

		await vi.waitFor(() => {
			expect(screen.getByText('업로드')).toBeTruthy();
		});
	});

	// 3. Hides upload button when not editable
	it('hides upload button when not editable', async () => {
		mockFetchWith([]);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1, editable: false }
		});

		await vi.waitFor(() => {
			expect(screen.getByText('첨부파일 (0)')).toBeTruthy();
		});

		expect(screen.queryByText('업로드')).toBeNull();
	});

	// 4. Shows empty state when no attachments (editable)
	it('shows empty state when no attachments', async () => {
		mockFetchWith([]);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1, editable: true }
		});

		await vi.waitFor(() => {
			expect(screen.getByText('첨부파일 없음')).toBeTruthy();
		});
	});

	// 5. Renders attachment list with file names
	it('renders attachment list with file names', async () => {
		mockFetchWith(mockAttachments);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1 }
		});

		await vi.waitFor(() => {
			expect(screen.getByText('screenshot.png')).toBeTruthy();
			expect(screen.getByText('report.pdf')).toBeTruthy();
			expect(screen.getByText('notes.txt')).toBeTruthy();
		});
	});

	// 6. formatSize helper tests
	describe('formatSize display', () => {
		it('displays bytes for small files', async () => {
			mockFetchWith([
				{ id: 1, fileName: 'tiny.txt', contentType: 'text/plain', fileSize: 512, uploadedAt: '2026-03-01T00:00:00Z' }
			]);

			render(AttachmentManagerTest, {
				props: { referenceType: 'TESTCASE', referenceId: 1 }
			});

			await vi.waitFor(() => {
				expect(screen.getByText('512 B')).toBeTruthy();
			});
		});

		it('displays KB for kilobyte-sized files', async () => {
			mockFetchWith([
				{ id: 1, fileName: 'doc.txt', contentType: 'text/plain', fileSize: 204800, uploadedAt: '2026-03-01T00:00:00Z' }
			]);

			render(AttachmentManagerTest, {
				props: { referenceType: 'TESTCASE', referenceId: 1 }
			});

			await vi.waitFor(() => {
				expect(screen.getByText('200.0 KB')).toBeTruthy();
			});
		});

		it('displays MB for megabyte-sized files', async () => {
			mockFetchWith([
				{ id: 1, fileName: 'big.zip', contentType: 'application/zip', fileSize: 1048576, uploadedAt: '2026-03-01T00:00:00Z' }
			]);

			render(AttachmentManagerTest, {
				props: { referenceType: 'TESTCASE', referenceId: 1 }
			});

			await vi.waitFor(() => {
				expect(screen.getByText('1.0 MB')).toBeTruthy();
			});
		});

		it('displays dash for null file size', async () => {
			mockFetchWith([
				{ id: 1, fileName: 'unknown.bin', contentType: null, fileSize: null, uploadedAt: '2026-03-01T00:00:00Z' }
			]);

			render(AttachmentManagerTest, {
				props: { referenceType: 'TESTCASE', referenceId: 1 }
			});

			await vi.waitFor(() => {
				expect(screen.getByText('-')).toBeTruthy();
			});
		});
	});

	// 7. Shows download links
	it('shows download links with correct href', async () => {
		mockFetchWith(mockAttachments);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1 }
		});

		await vi.waitFor(() => {
			const link = screen.getByText('screenshot.png') as HTMLAnchorElement;
			expect(link.tagName).toBe('A');
			expect(link.getAttribute('href')).toBe('/api/attachments/1');
			expect(link.hasAttribute('download')).toBe(true);
		});
	});

	// 8. Delete button opens confirm dialog
	it('delete button opens confirm dialog', async () => {
		mockFetchWith(mockAttachments);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1, editable: true }
		});

		await vi.waitFor(() => {
			expect(screen.getByText('screenshot.png')).toBeTruthy();
		});

		// Click the first delete button
		const deleteButtons = screen.getAllByText('삭제');
		deleteButtons[0].click();

		await vi.waitFor(() => {
			expect(screen.getByText('첨부파일 삭제')).toBeTruthy();
			expect(
				screen.getByText('"screenshot.png"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')
			).toBeTruthy();
		});
	});

	// 9. File type validation (checked via fetch call on upload)
	it('calls fetch with correct URL for loading attachments', async () => {
		const mockFetch = mockFetchWith([]);

		render(AttachmentManagerTest, {
			props: { referenceType: 'EXECUTION', referenceId: 42 }
		});

		await vi.waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith(
				'/api/attachments?referenceType=EXECUTION&referenceId=42'
			);
		});
	});

	// 10. Read-only mode shows attachments without delete buttons
	it('read-only mode shows attachments without delete buttons', async () => {
		mockFetchWith(mockAttachments);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1, editable: false }
		});

		await vi.waitFor(() => {
			expect(screen.getByText('screenshot.png')).toBeTruthy();
			expect(screen.getByText('report.pdf')).toBeTruthy();
			expect(screen.getByText('notes.txt')).toBeTruthy();
		});

		// Should not have any delete buttons
		expect(screen.queryByText('삭제')).toBeNull();
	});

	// Shows empty state text in read-only mode
	it('shows empty text in read-only mode with no attachments', async () => {
		mockFetchWith([]);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1, editable: false }
		});

		await vi.waitFor(() => {
			expect(screen.getByText('첨부파일 없음')).toBeTruthy();
		});
	});

	// Does not load attachments when referenceId is 0
	it('does not fetch attachments when referenceId is 0', async () => {
		const mockFetch = mockFetchWith([]);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 0 }
		});

		// Wait a tick to ensure $effect would have run
		await new Promise((r) => setTimeout(r, 50));

		expect(mockFetch).not.toHaveBeenCalled();
	});

	// Title shows zero count initially
	it('renders title with zero count before loading', () => {
		mockFetchWith([]);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 0 }
		});

		expect(screen.getByText('첨부파일 (0)')).toBeTruthy();
	});

	// Drop zone is visible when editable
	it('renders drop zone when editable', async () => {
		mockFetchWith([]);

		const { container } = render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1, editable: true }
		});

		await vi.waitFor(() => {
			const dropZone = container.querySelector('[aria-label="File drop zone"]');
			expect(dropZone).toBeTruthy();
		});
	});

	// No drop zone in read-only mode
	it('does not render drop zone when not editable', async () => {
		mockFetchWith([]);

		const { container } = render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1, editable: false }
		});

		await vi.waitFor(() => {
			expect(screen.getByText('첨부파일 (0)')).toBeTruthy();
		});

		const dropZone = container.querySelector('[aria-label="File drop zone"]');
		expect(dropZone).toBeNull();
	});

	// Download links in read-only mode have correct attributes
	it('read-only mode download links have correct href and download attribute', async () => {
		mockFetchWith([mockAttachments[0]]);

		render(AttachmentManagerTest, {
			props: { referenceType: 'TESTCASE', referenceId: 1, editable: false }
		});

		await vi.waitFor(() => {
			const link = screen.getByText('screenshot.png') as HTMLAnchorElement;
			expect(link.getAttribute('href')).toBe('/api/attachments/1');
			expect(link.hasAttribute('download')).toBe(true);
		});
	});
});
