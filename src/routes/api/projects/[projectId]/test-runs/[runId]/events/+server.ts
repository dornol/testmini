import { error } from '@sveltejs/kit';
import { createSubscriber } from '$lib/server/redis';
import { withProjectRole } from '$lib/server/api-handler';

export const GET = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'], async ({ params, request, projectId }) => {
	const runId = Number(params.runId);

	const channel = `run:${runId}:events`;
	const subscriber = createSubscriber();

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			function send(data: string) {
				try {
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				} catch {
					// Stream closed
				}
			}

			// Send initial connected event
			send(JSON.stringify({ type: 'connected' }));

			// Subscribe to Redis channel
			subscriber.subscribe(channel).catch(() => {
				// Connection may fail
			});

			subscriber.on('message', (_ch: string, message: string) => {
				send(message);
			});

			// Keepalive every 30 seconds
			const keepalive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': keepalive\n\n'));
				} catch {
					clearInterval(keepalive);
				}
			}, 30_000);

			// Cleanup on abort
			request.signal.addEventListener('abort', () => {
				clearInterval(keepalive);
				subscriber.unsubscribe(channel).catch(() => {});
				subscriber.disconnect();
				try {
					controller.close();
				} catch {
					// Already closed
				}
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
});
