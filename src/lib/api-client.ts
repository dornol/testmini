import { toast } from 'svelte-sonner';

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

/**
 * Fetch wrapper with automatic error handling and toast notifications.
 * Throws ApiError on non-ok responses.
 */
export async function apiFetch<T = unknown>(
	url: string,
	options?: RequestInit & { silent?: boolean }
): Promise<T> {
	const { silent, ...fetchOptions } = options ?? {};
	const res = await fetch(url, fetchOptions);

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		const msg = body.error || body.message || `Error ${res.status}`;
		if (!silent) toast.error(msg);
		throw new ApiError(res.status, msg);
	}

	const text = await res.text();
	return text ? JSON.parse(text) : (undefined as T);
}

export function apiPost<T = unknown>(url: string, body: unknown): Promise<T> {
	return apiFetch<T>(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiPatch<T = unknown>(url: string, body: unknown): Promise<T> {
	return apiFetch<T>(url, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiPut<T = unknown>(url: string, body: unknown): Promise<T> {
	return apiFetch<T>(url, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function apiDelete<T = unknown>(url: string): Promise<T> {
	return apiFetch<T>(url, { method: 'DELETE' });
}
