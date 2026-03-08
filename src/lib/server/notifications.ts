import { db } from '$lib/server/db';
import { notification, userPreference } from '$lib/server/db/schema';
import { user as userTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { childLogger } from './logger';
import { sendProjectWebhooks } from './webhooks';
import { sendEmail, isEmailConfigured } from './email';
import { cacheDelete } from './cache';

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
 * Respects user notification preferences:
 * - enableInApp: false → skip DB insert entirely
 * - mutedTypes: ['TYPE'] → skip if notification type is muted
 *
 * Also triggers outgoing webhooks for the project if configured.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
	let shouldInsert = true;

	try {
		const pref = await db.query.userPreference.findFirst({
			where: eq(userPreference.userId, params.userId)
		});

		if (pref?.notificationSettings) {
			const settings = pref.notificationSettings;
			if (settings.enableInApp === false) {
				shouldInsert = false;
			} else if (settings.mutedTypes?.includes(params.type)) {
				shouldInsert = false;
			}
		}
	} catch (err) {
		log.error({ err }, 'Failed to load notification preferences');
	}

	if (shouldInsert) {
		try {
			await db.insert(notification).values({
				userId: params.userId,
				type: params.type,
				title: params.title,
				message: params.message,
				link: params.link ?? null,
				projectId: params.projectId ?? null
			});
			cacheDelete(`user:${params.userId}:unread_notifications`);
		} catch (err) {
			log.error({ err, params }, 'Failed to create notification');
		}
	}

	// Send email notification if SMTP is configured (fire-and-forget)
	if (isEmailConfigured()) {
		try {
			const recipient = await db.query.user.findFirst({
				where: eq(userTable.id, params.userId)
			});
			if (recipient?.email) {
				sendEmail({
					to: recipient.email,
					subject: `[testmini] ${params.title}`,
					text: `${params.message}${params.link ? `\n\nView: ${params.link}` : ''}`
				});
			}
		} catch (err) {
			log.error({ err }, 'Failed to send email notification');
		}
	}

	// Trigger outgoing webhooks (fire-and-forget, only if project-scoped)
	// Webhooks are always sent regardless of user notification preferences
	if (params.projectId) {
		sendProjectWebhooks(params.projectId, params.type, {
			title: params.title,
			message: params.message,
			link: params.link ?? null
		});
	}
}
