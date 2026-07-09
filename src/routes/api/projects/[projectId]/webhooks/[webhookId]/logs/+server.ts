import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projectWebhook, webhookDeliveryLog } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseId } from '$lib/server/auth-utils';
import { parsePositiveIntegerSearchParamStrict } from '$lib/server/search-param-validation';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(value: string | null): number {
	try {
		return parsePositiveIntegerSearchParamStrict(value, 'limit', {
			defaultValue: DEFAULT_LIMIT,
			max: MAX_LIMIT
		});
	} catch {
		error(400, 'Invalid limit');
	}
}

export const GET = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId, url }) => {
	const webhookId = parseId(params.webhookId, 'webhook ID');
	const limit = parseLimit(url.searchParams.get('limit'));

	const existing = await db.query.projectWebhook.findFirst({
		where: and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId))
	});
	if (!existing) error(404, 'Webhook not found');

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
