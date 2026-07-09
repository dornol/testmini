import { publish } from '$lib/server/redis';
import { childLogger } from '$lib/server/logger';
import type { RunEvent } from '$lib/types/events';

const log = childLogger('run-events');

export async function publishRunEvent(runId: number, event: RunEvent): Promise<void> {
	try {
		await publish(`run:${runId}:events`, event);
	} catch (err) {
		log.warn(
			{
				runId,
				eventType: event.type,
				err: { message: err instanceof Error ? err.message : String(err) }
			},
			'Failed to publish run event'
		);
	}
}
