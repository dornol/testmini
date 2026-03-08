import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { executionComment } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody, requireAuth } from '$lib/server/auth-utils';
import { badRequest } from '$lib/server/errors';
import type { RequestEvent } from '@sveltejs/kit';

export async function PATCH(event: RequestEvent) {
	const user = requireAuth(event.locals);
	const commentId = Number(event.params.commentId);
	if (isNaN(commentId)) error(400, 'Invalid comment ID');

	const existing = await db.query.executionComment.findFirst({
		where: eq(executionComment.id, commentId)
	});
	if (!existing) error(404, 'Comment not found');

	// Only author or global admin can edit
	if (existing.userId !== user.id && user.role !== 'admin') {
		error(403, 'Not authorized to edit this comment');
	}

	const body = await parseJsonBody(event.request);
	const { content } = body as { content?: string };

	if (!content || typeof content !== 'string' || content.trim().length === 0) {
		return badRequest('Content is required');
	}
	if (content.trim().length > 10000) {
		return badRequest('Content is too long (max 10000 characters)');
	}

	const [updated] = await db
		.update(executionComment)
		.set({ content: content.trim() })
		.where(eq(executionComment.id, commentId))
		.returning();

	return json(updated);
}

export async function DELETE(event: RequestEvent) {
	const user = requireAuth(event.locals);
	const commentId = Number(event.params.commentId);
	if (isNaN(commentId)) error(400, 'Invalid comment ID');

	const existing = await db.query.executionComment.findFirst({
		where: eq(executionComment.id, commentId)
	});
	if (!existing) error(404, 'Comment not found');

	if (existing.userId !== user.id && user.role !== 'admin') {
		error(403, 'Not authorized to delete this comment');
	}

	// Delete comment and its replies
	await db.delete(executionComment).where(eq(executionComment.parentId, commentId));
	await db.delete(executionComment).where(eq(executionComment.id, commentId));

	return json({ success: true });
}
