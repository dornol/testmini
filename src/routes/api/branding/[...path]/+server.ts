import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFile } from '$lib/server/storage';

const MIME_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	svg: 'image/svg+xml',
	webp: 'image/webp',
	ico: 'image/x-icon'
};

export const GET: RequestHandler = async ({ params }) => {
	const objectKey = params.path;

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
};
