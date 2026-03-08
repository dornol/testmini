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
