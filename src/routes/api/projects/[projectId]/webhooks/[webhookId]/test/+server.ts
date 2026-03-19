import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projectWebhook } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseId } from '$lib/server/auth-utils';
import { sendProjectWebhooks } from '$lib/server/webhooks';

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const webhookId = parseId(params.webhookId, 'webhook ID');

	const existing = await db.query.projectWebhook.findFirst({
		where: and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId))
	});
	if (!existing) error(404, 'Webhook not found');

	// Send a test event to this specific webhook
	sendProjectWebhooks(projectId, 'TEST', {
		title: 'Test webhook',
		message: 'This is a test notification from testmini.'
	});

	return json({ success: true });
});
