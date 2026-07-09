import { validatePublicHttpUrl } from '$lib/server/url-safety';

const INTEGRATION_FETCH_TIMEOUT = 10_000;

export async function safeIntegrationFetch(
	url: string,
	init: RequestInit = {}
): Promise<Response> {
	const validation = await validatePublicHttpUrl(url);
	if (!validation.ok) {
		throw new Error(validation.error ?? 'Unsafe integration URL');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), INTEGRATION_FETCH_TIMEOUT);

	try {
		return await fetch(url, {
			...init,
			redirect: 'manual',
			signal: controller.signal
		});
	} finally {
		clearTimeout(timeout);
	}
}
