import { error } from '@sveltejs/kit';

export function parseContentLengthHeader(request: Request): number | null {
	const raw = request.headers.get('content-length');
	if (raw === null) return null;

	const value = raw.trim();
	if (value === '') {
		error(400, 'Invalid content-length header');
	}

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		error(400, 'Invalid content-length header');
	}

	return parsed;
}

export function assertContentLengthUnderLimit(
	request: Request,
	maxBytes: number,
	message = 'Request body exceeds upload limit'
): void {
	const contentLength = parseContentLengthHeader(request);
	if (contentLength !== null && contentLength > maxBytes) {
		error(413, message);
	}
}
