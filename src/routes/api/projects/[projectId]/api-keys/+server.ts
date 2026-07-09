import { json } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { projectApiKey } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { generateApiKey, hashApiKey } from '$lib/server/api-key-auth';
import { parseJsonBody } from '$lib/server/auth-utils';

const MAX_API_KEY_NAME_LENGTH = 100;
const API_KEY_CREATE_FIELDS = new Set(['name']);

function validateRequestBody(body: unknown): Record<string, unknown> | Response {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return badRequest('Invalid request body');
	}
	if (Object.keys(body).some((key) => !API_KEY_CREATE_FIELDS.has(key))) {
		return badRequest('Invalid API key field');
	}
	return body as Record<string, unknown>;
}

function validateKeyName(value: unknown): string | Response {
	if (typeof value !== 'string') {
		return badRequest('Name is required');
	}
	const name = value.trim();
	if (!name) {
		return badRequest('Name is required');
	}
	if (name.length > MAX_API_KEY_NAME_LENGTH) {
		return badRequest(`Name must be ${MAX_API_KEY_NAME_LENGTH} characters or less`);
	}
	return name;
}

export const GET = withProjectRole(['PROJECT_ADMIN'], async ({ projectId }) => {
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
	const bodyOrError = validateRequestBody(await parseJsonBody(request));
	if (bodyOrError instanceof Response) return bodyOrError;

	const nameOrError = validateKeyName(bodyOrError.name);
	if (nameOrError instanceof Response) return nameOrError;
	const name = nameOrError;

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
