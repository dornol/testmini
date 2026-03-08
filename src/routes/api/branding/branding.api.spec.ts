import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';

const mockGetFile = vi.fn();

vi.mock('$lib/server/storage', () => ({
	getFile: mockGetFile
}));

const { GET } = await import('./[...path]/+server');

describe('/api/branding/[...path]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should serve file for valid branding path', async () => {
			const fileBuffer = Buffer.from('fake-png-data');
			mockGetFile.mockResolvedValue(fileBuffer);

			const event = createMockEvent({
				method: 'GET',
				params: { path: 'branding/logo.png' }
			});

			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('image/png');
			expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
			expect(mockGetFile).toHaveBeenCalledWith('branding/logo.png');
		});

		it('should return 400 for path traversal with ..', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { path: '../etc/passwd' }
			});

			await expect(GET(event)).rejects.toThrow();
			try {
				await GET(event);
			} catch (e: any) {
				expect(e.status).toBe(400);
			}
		});

		it('should return 400 for path with //', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { path: 'branding//logo.png' }
			});

			await expect(GET(event)).rejects.toThrow();
			try {
				await GET(event);
			} catch (e: any) {
				expect(e.status).toBe(400);
			}
		});

		it('should return 400 for path not starting with branding/', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { path: 'uploads/secret.txt' }
			});

			await expect(GET(event)).rejects.toThrow();
			try {
				await GET(event);
			} catch (e: any) {
				expect(e.status).toBe(400);
			}
		});

		it('should return 400 for path with backslash traversal', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { path: 'branding\\..\\..\\etc' }
			});

			// Backslash path doesn't start with 'branding/' (uses backslash instead)
			await expect(GET(event)).rejects.toThrow();
			try {
				await GET(event);
			} catch (e: any) {
				expect(e.status).toBe(400);
			}
		});

		it('should return 400 for empty path', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { path: '' }
			});

			await expect(GET(event)).rejects.toThrow();
			try {
				await GET(event);
			} catch (e: any) {
				expect(e.status).toBe(400);
			}
		});

		it('should return 400 for URL-encoded traversal attempt', async () => {
			// When SvelteKit resolves the [...path] param, percent-encoded sequences
			// are decoded. So %2e%2e becomes '..' by the time it reaches the handler.
			const event = createMockEvent({
				method: 'GET',
				params: { path: 'branding/../etc/passwd' }
			});

			await expect(GET(event)).rejects.toThrow();
			try {
				await GET(event);
			} catch (e: any) {
				expect(e.status).toBe(400);
			}
		});

		it('should serve file for long but valid branding path', async () => {
			const longFileName = 'branding/' + 'a'.repeat(200) + '.png';
			const fileBuffer = Buffer.from('fake-data');
			mockGetFile.mockResolvedValue(fileBuffer);

			const event = createMockEvent({
				method: 'GET',
				params: { path: longFileName }
			});

			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(mockGetFile).toHaveBeenCalledWith(longFileName);
		});

		it('should return 404 when file does not exist', async () => {
			mockGetFile.mockRejectedValue(new Error('File not found'));

			const event = createMockEvent({
				method: 'GET',
				params: { path: 'branding/missing.png' }
			});

			await expect(GET(event)).rejects.toThrow();
			try {
				await GET(event);
			} catch (e: any) {
				expect(e.status).toBe(404);
			}
		});
	});
});
