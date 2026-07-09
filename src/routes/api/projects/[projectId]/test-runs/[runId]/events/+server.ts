import { createSubscriber } from '$lib/server/redis';
import { withProjectRole } from '$lib/server/api-handler';
import { parseId } from '$lib/server/auth-utils';
import { db } from '$lib/server/db';
import { testRun } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const GET = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'],
	async ({ params, request, projectId }) => {
		const runId = parseId(params.runId, 'run ID');

		const existingRun = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId)),
			columns: { id: true }
		});
		if (!existingRun) error(404, 'Test run not found');

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

				// Subscribe to channel (Redis or in-memory)
				subscriber.subscribe(channel).catch(() => {});

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
	}
);
