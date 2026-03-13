import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projectWebhook, webhookDeliveryLog } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';

export const GET = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId, url }) => {
	const webhookId = Number(params.webhookId);

	const existing = await db.query.projectWebhook.findFirst({
		where: and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId))
	});
	if (!existing) error(404, 'Webhook not found');

	const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100);

	const logs = await db
		.select({
			id: webhookDeliveryLog.id,
			event: webhookDeliveryLog.event,
			statusCode: webhookDeliveryLog.statusCode,
			success: webhookDeliveryLog.success,
			errorMessage: webhookDeliveryLog.errorMessage,
			attempt: webhookDeliveryLog.attempt,
			duration: webhookDeliveryLog.duration,
			createdAt: webhookDeliveryLog.createdAt
		})
		.from(webhookDeliveryLog)
		.where(eq(webhookDeliveryLog.webhookId, webhookId))
		.orderBy(desc(webhookDeliveryLog.createdAt))
		.limit(limit);

	return json(logs);
});
