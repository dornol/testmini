import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { tag, testCaseTag } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { createTagSchema } from '$lib/schemas/tag.schema';
import { cacheDelete } from '$lib/server/cache';
import { badRequest, conflict } from '$lib/server/errors';

/** Create a new tag and optionally assign it to a test case */
export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, user, projectId }) => {
	const body = await parseJsonBody(request);
	const { name, color, testCaseId } = body as { name: string; color: string; testCaseId?: number };

	const parsed = createTagSchema.safeParse({ name: name?.trim(), color });
	if (!parsed.success) {
		return badRequest(parsed.error.flatten().fieldErrors.name?.[0] ?? 'Invalid input');
	}

	// Check duplicate
	const existing = await db.query.tag.findFirst({
		where: and(eq(tag.projectId, projectId), eq(tag.name, parsed.data.name))
	});

	if (existing) {
		// If tag already exists and testCaseId is provided, just assign it
		if (testCaseId) {
			const alreadyAssigned = await db.query.testCaseTag.findFirst({
				where: and(eq(testCaseTag.testCaseId, testCaseId), eq(testCaseTag.tagId, existing.id))
			});
			if (!alreadyAssigned) {
				await db.insert(testCaseTag).values({ testCaseId, tagId: existing.id });
			}
			return json({ tag: { id: existing.id, name: existing.name, color: existing.color }, assigned: true });
		}
		return conflict('A tag with this name already exists');
	}

	const [newTag] = await db
		.insert(tag)
		.values({
			projectId,
			name: parsed.data.name,
			color: parsed.data.color,
			createdBy: user.id
		})
		.returning();

	// Optionally assign to a test case
	if (testCaseId) {
		await db.insert(testCaseTag).values({ testCaseId, tagId: newTag.id });
	}

	cacheDelete(`project:${projectId}:tags`);
	return json({ tag: { id: newTag.id, name: newTag.name, color: newTag.color }, assigned: !!testCaseId });
});
