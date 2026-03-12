import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('svelte-sonner', () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warning: vi.fn()
	}
}));

import { apiFetch, apiPost, apiPatch, apiPut, apiDelete, ApiError } from './api-client';
import { toast } from 'svelte-sonner';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function emptyResponse(status = 200) {
	return new Response('', { status });
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('ApiError', () => {
	it('has status and message', () => {
		const err = new ApiError(404, 'Not found');
		expect(err.status).toBe(404);
		expect(err.message).toBe('Not found');
		expect(err).toBeInstanceOf(Error);
	});
});

describe('apiFetch', () => {
	it('returns parsed JSON on success', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, name: 'Test' }));
		const result = await apiFetch('/api/test');
		expect(result).toEqual({ id: 1, name: 'Test' });
		expect(mockFetch).toHaveBeenCalledWith('/api/test', {});
	});

	it('returns undefined for empty response body', async () => {
		mockFetch.mockResolvedValueOnce(emptyResponse());
		const result = await apiFetch('/api/test');
		expect(result).toBeUndefined();
	});

	it('passes fetch options through', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({}));
		await apiFetch('/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{"x":1}'
		});
		expect(mockFetch).toHaveBeenCalledWith('/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{"x":1}'
		});
	});

	it('throws ApiError on non-ok response', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404));
		await expect(apiFetch('/api/test')).rejects.toThrow(ApiError);
		try {
			await apiFetch('/api/test');
		} catch (e) {
			// Second call also rejected
		}
	});

	it('shows toast on error by default', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Bad request' }, 400));
		await expect(apiFetch('/api/test')).rejects.toThrow();
		expect(toast.error).toHaveBeenCalledWith('Bad request');
	});

	it('does not show toast when silent option is true', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Nope' }, 400));
		await expect(apiFetch('/api/test', { silent: true })).rejects.toThrow();
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('uses fallback error message when body has no error field', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
		await expect(apiFetch('/api/test')).rejects.toThrow('Error 500');
		expect(toast.error).toHaveBeenCalledWith('Error 500');
	});

	it('handles non-JSON error body gracefully', async () => {
		mockFetch.mockResolvedValueOnce(
			new Response('Internal Server Error', { status: 500 })
		);
		await expect(apiFetch('/api/test')).rejects.toThrow('Error 500');
	});

	it('uses message field as fallback', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Custom msg' }, 422));
		await expect(apiFetch('/api/test')).rejects.toThrow('Custom msg');
	});
});

describe('apiPost', () => {
	it('sends POST with JSON body', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));
		const result = await apiPost('/api/items', { name: 'Test' });
		expect(result).toEqual({ id: 1 });
		expect(mockFetch).toHaveBeenCalledWith('/api/items', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Test' })
		});
	});
});

describe('apiPatch', () => {
	it('sends PATCH with JSON body', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ updated: true }));
		await apiPatch('/api/items/1', { name: 'Updated' });
		expect(mockFetch).toHaveBeenCalledWith('/api/items/1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Updated' })
		});
	});
});

describe('apiPut', () => {
	it('sends PUT with JSON body', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ replaced: true }));
		await apiPut('/api/items/1', { name: 'Replaced' });
		expect(mockFetch).toHaveBeenCalledWith('/api/items/1', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Replaced' })
		});
	});
});

describe('apiDelete', () => {
	it('sends DELETE request', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
		await apiDelete('/api/items/1');
		expect(mockFetch).toHaveBeenCalledWith('/api/items/1', {
			method: 'DELETE'
		});
	});
});
