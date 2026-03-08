import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFile } from '$lib/server/storage';
import { withAuth } from '$lib/server/api-handler';

const MIME_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	webp: 'image/webp'
};

export const GET: RequestHandler = withAuth(async ({ params }) => {
	const objectKey = params.path;

	if (!objectKey || objectKey.includes('..')) {
		error(400, 'Invalid path');
	}

	try {
		const fileBuffer = await getFile(objectKey);
		const ext = objectKey.split('.').pop()?.toLowerCase() || '';
		const contentType = MIME_TYPES[ext] || 'application/octet-stream';

		return new Response(new Uint8Array(fileBuffer), {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=86400'
			}
		});
	} catch {
		error(404, 'Not found');
	}
});
