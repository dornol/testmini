import { error } from '@sveltejs/kit';

const DEFAULT_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export function assertMultipartContentLength(
	request: Request,
	maxFileSizeBytes: number,
	options: { overheadBytes?: number; message?: string } = {}
) {
	const contentLengthHeader = request.headers.get('content-length');
	if (!contentLengthHeader) return;

	const contentLength = Number(contentLengthHeader);
	if (!Number.isFinite(contentLength)) return;

	const maxBodySize =
		maxFileSizeBytes + (options.overheadBytes ?? DEFAULT_MULTIPART_OVERHEAD_BYTES);
	if (contentLength > maxBodySize) {
		error(413, options.message ?? 'Request body exceeds upload limit');
	}
}
