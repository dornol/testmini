import { assertContentLengthUnderLimit } from '$lib/server/request-size';

const DEFAULT_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export function assertMultipartContentLength(
	request: Request,
	maxFileSizeBytes: number,
	options: { overheadBytes?: number; message?: string } = {}
) {
	const maxBodySize =
		maxFileSizeBytes + (options.overheadBytes ?? DEFAULT_MULTIPART_OVERHEAD_BYTES);
	assertContentLengthUnderLimit(
		request,
		maxBodySize,
		options.message ?? 'Request body exceeds upload limit'
	);
}
