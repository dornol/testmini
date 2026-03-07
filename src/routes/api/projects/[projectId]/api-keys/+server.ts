import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projectApiKey } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { generateApiKey, hashApiKey } from '$lib/server/api-key-auth';

export const GET = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'], async ({ projectId }) => {

	const keys = await db
		.select({
			id: projectApiKey.id,
			name: projectApiKey.name,
			prefix: projectApiKey.prefix,
			lastUsedAt: projectApiKey.lastUsedAt,
			createdBy: projectApiKey.createdBy,
			createdAt: projectApiKey.createdAt
		})
		.from(projectApiKey)
		.where(eq(projectApiKey.projectId, projectId))
		.orderBy(desc(projectApiKey.createdAt));

	return json(keys);
});

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ request, user, projectId }) => {

	let body: { name?: string };
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid request body');
	}

	const name = (body.name ?? '').trim();
	if (!name) {
		return json({ error: 'Name is required' }, { status: 400 });
	}
	if (name.length > 100) {
		return json({ error: 'Name must be 100 characters or less' }, { status: 400 });
	}

	const rawKey = generateApiKey();
	const keyHash = hashApiKey(rawKey);
	// First 12 chars (tmk_ + 8 hex) used as display prefix
	const prefix = rawKey.slice(0, 12);

	const [created] = await db
		.insert(projectApiKey)
		.values({
			projectId,
			name,
			keyHash,
			prefix,
			createdBy: user.id
		})
		.returning();

	// Return the full key ONCE — it cannot be retrieved again
	return json(
		{
			id: created.id,
			name: created.name,
			prefix: created.prefix,
			key: rawKey,
			createdAt: created.createdAt
		},
		{ status: 201 }
	);
});
