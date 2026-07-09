const FALLBACK_FILENAME = 'download';

function sanitizeFallbackFilename(filename: string): string {
	const sanitized = filename
		.trim()
		.replace(/[\x00-\x1F\x7F"\\/]/g, '_')
		.replace(/\s+/g, ' ');

	return sanitized || FALLBACK_FILENAME;
}

function encodeRfc5987Value(value: string): string {
	return encodeURIComponent(value).replace(/['()*]/g, (char) =>
		`%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

export function attachmentContentDisposition(filename: string): string {
	const fallback = sanitizeFallbackFilename(filename);
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987Value(filename)}`;
}
