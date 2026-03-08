import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { projectWebhook } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';

const VALID_EVENTS = [
	'TEST_RUN_COMPLETED',
	'TEST_FAILED',
	'COMMENT_ADDED',
	'MEMBER_ADDED',
	'ASSIGNED'
];

export const GET = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'],
	async ({ projectId }) => {
		const webhooks = await db
			.select({
				id: projectWebhook.id,
				name: projectWebhook.name,
				url: projectWebhook.url,
				events: projectWebhook.events,
				enabled: projectWebhook.enabled,
				createdAt: projectWebhook.createdAt
			})
			.from(projectWebhook)
			.where(eq(projectWebhook.projectId, projectId))
			.orderBy(desc(projectWebhook.createdAt));

		return json(webhooks);
	}
);

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ request, user, projectId }) => {
	let body: { name?: string; url?: string; secret?: string; events?: string[] };
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid request body');
	}

	const name = (body.name ?? '').trim();
	if (!name || name.length > 100) {
		return badRequest('Name is required (max 100 chars)');
	}

	const url = (body.url ?? '').trim();
	if (!url) {
		return badRequest('URL is required');
	}
	try {
		const parsed = new URL(url);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			return badRequest('URL must use http or https');
		}
	} catch {
		return badRequest('Invalid URL');
	}

	const events = body.events ?? [];
	for (const e of events) {
		if (!VALID_EVENTS.includes(e)) {
			return badRequest(`Invalid event type: ${e}`);
		}
	}

	const [created] = await db
		.insert(projectWebhook)
		.values({
			projectId,
			name,
			url,
			secret: body.secret?.trim() || null,
			events,
			createdBy: user.id
		})
		.returning();

	return json(
		{
			id: created.id,
			name: created.name,
			url: created.url,
			events: created.events,
			enabled: created.enabled,
			createdAt: created.createdAt
		},
		{ status: 201 }
	);
});
