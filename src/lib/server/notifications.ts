import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import { childLogger } from './logger';
import { sendProjectWebhooks } from './webhooks';

const log = childLogger('notifications');

export interface CreateNotificationParams {
	userId: string;
	type: string;
	title: string;
	message: string;
	link?: string;
	projectId?: number;
}

/**
 * Creates a notification for the given user.
 *
 * Fire-and-forget: the returned Promise is intentionally not awaited by callers.
 * Any DB error is caught and logged so it never propagates to the caller.
 *
 * Also triggers outgoing webhooks for the project if configured.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
	try {
		await db.insert(notification).values({
			userId: params.userId,
			type: params.type,
			title: params.title,
			message: params.message,
			link: params.link ?? null,
			projectId: params.projectId ?? null
		});
	} catch (err) {
		log.error({ err, params }, 'Failed to create notification');
	}

	// Trigger outgoing webhooks (fire-and-forget, only if project-scoped)
	if (params.projectId) {
		sendProjectWebhooks(params.projectId, params.type, {
			title: params.title,
			message: params.message,
			link: params.link ?? null
		});
	}
}
