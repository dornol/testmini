import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
	validateCreateExploratorySessionPayload,
	validateUpdateExploratorySessionPayload
} from '$lib/server/exploratory-session-validation';

const MAX_NOTE_CONTENT_LENGTH = 10_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const mcpLimitSchema = z
	.number()
	.int()
	.positive()
	.max(MAX_LIMIT)
	.refine(Number.isSafeInteger, 'limit must be a safe integer');
const mcpTimestampSchema = z
	.number()
	.int()
	.nonnegative()
	.refine(Number.isSafeInteger, 'timestamp must be a safe integer');

async function validationResponseToMcpError(response: Response, fallback: string) {
	const body = (await response.json().catch(() => null)) as { error?: string } | null;
	return err(body?.error ?? fallback);
}

function validateNoteContent(value: string): string | ReturnType<typeof err> {
	const content = value.trim();
	if (!content) return err('Content is required');
	if (content.length > MAX_NOTE_CONTENT_LENGTH) {
		return err(`Content must be ${MAX_NOTE_CONTENT_LENGTH} characters or fewer`);
	}
	return content;
}

export function registerExploratoryTools(server: McpServer, projectId: number) {
	server.tool(
		'create-exploratory-session',
		'Create a new exploratory testing session',
		{
			title: z.string().describe('Session title'),
			charter: z.string().optional().describe('Session charter'),
			environment: z.string().optional().describe('Environment name'),
			tags: z.array(z.string()).optional().describe('Session tags')
		},
		async ({ title, charter, environment, tags: sessionTags }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const payload = validateCreateExploratorySessionPayload({
				title,
				charter,
				environment,
				tags: sessionTags
			});
			if (payload instanceof Response) {
				return validationResponseToMcpError(payload, 'Invalid exploratory session');
			}

			const [created] = await db
				.insert(exploratorySession)
				.values({
					projectId,
					title: payload.title,
					charter: payload.charter,
					environment: payload.environment,
					tags: payload.tags,
					createdBy: creator
				})
				.returning();

			if (!created) return err('Failed to create exploratory session');
			return ok(created);
		}
	);

	server.tool(
		'get-exploratory-session',
		'Get an exploratory session with its notes',
		{
			sessionId: mcpPositiveIdSchema.describe('Session ID')
		},
		async ({ sessionId }) => {
			const session = await db.query.exploratorySession.findFirst({
				where: and(
					eq(exploratorySession.id, sessionId),
					eq(exploratorySession.projectId, projectId)
				)
			});
			if (!session) return err('Session not found');

			const notes = await db
				.select()
				.from(sessionNote)
				.where(eq(sessionNote.sessionId, sessionId))
				.orderBy(sessionNote.timestamp);

			return ok({ ...session, notes });
		}
	);

	server.tool(
		'update-exploratory-session',
		'Update an exploratory session status or summary',
		{
			sessionId: mcpPositiveIdSchema.describe('Session ID'),
			status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).optional().describe('New status'),
			summary: z.string().optional().describe('Session summary')
		},
		async ({ sessionId, status, summary }) => {
			const session = await db.query.exploratorySession.findFirst({
				where: and(
					eq(exploratorySession.id, sessionId),
					eq(exploratorySession.projectId, projectId)
				)
			});
			if (!session) return err('Session not found');

			const updates: Record<string, unknown> = {};
			if (status !== undefined) updates.status = status;
			if (summary !== undefined) {
				const payload = validateUpdateExploratorySessionPayload({ summary });
				if (payload instanceof Response) {
					return validationResponseToMcpError(payload, 'Invalid exploratory session update');
				}
				updates.summary = payload.summary;
			}
			if (status === 'COMPLETED') updates.completedAt = new Date();
			if (Object.keys(updates).length === 0) return err('No fields to update');

			await db
				.update(exploratorySession)
				.set(updates)
				.where(
					and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
				);

			const updated = await db.query.exploratorySession.findFirst({
				where: and(
					eq(exploratorySession.id, sessionId),
					eq(exploratorySession.projectId, projectId)
				)
			});

			return ok(updated);
		}
	);

	server.tool(
		'add-session-note',
		'Add a note to an exploratory session',
		{
			sessionId: mcpPositiveIdSchema.describe('Session ID'),
			content: z.string().describe('Note content'),
			noteType: z
				.enum(['NOTE', 'BUG', 'QUESTION', 'IDEA'])
				.optional()
				.describe('Note type (default: NOTE)'),
			timestamp: mcpTimestampSchema.optional().describe('Elapsed seconds since session start')
		},
		async ({ sessionId, content: noteContent, noteType, timestamp: ts }) => {
			const session = await db.query.exploratorySession.findFirst({
				where: and(
					eq(exploratorySession.id, sessionId),
					eq(exploratorySession.projectId, projectId)
				)
			});
			if (!session) return err('Session not found');

			const content = validateNoteContent(noteContent);
			if (typeof content !== 'string') return content;

			const elapsed = ts ?? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);

			const [created] = await db
				.insert(sessionNote)
				.values({
					sessionId,
					content,
					noteType: noteType ?? 'NOTE',
					timestamp: elapsed
				})
				.returning();

			if (!created) return err('Failed to create session note');
			return ok(created);
		}
	);

	server.tool(
		'list-exploratory-sessions',
		'List exploratory testing sessions',
		{
			status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).optional().describe('Filter by status'),
			limit: mcpLimitSchema.optional().describe('Max results (default 20, max 50)')
		},
		async ({ status, limit }) => {
			const conditions = [eq(exploratorySession.projectId, projectId)];
			if (status) conditions.push(eq(exploratorySession.status, status));

			const sessions = await db
				.select({
					id: exploratorySession.id,
					title: exploratorySession.title,
					charter: exploratorySession.charter,
					environment: exploratorySession.environment,
					status: exploratorySession.status,
					tags: exploratorySession.tags,
					startedAt: exploratorySession.startedAt
				})
				.from(exploratorySession)
				.where(and(...conditions))
				.orderBy(desc(exploratorySession.startedAt))
				.limit(limit ?? DEFAULT_LIMIT);

			return ok(sessions);
		}
	);

	server.tool(
		'delete-exploratory-session',
		'Delete an exploratory session and its notes',
		{ sessionId: mcpPositiveIdSchema.describe('Session ID') },
		async ({ sessionId }) => {
			const s = await db.query.exploratorySession.findFirst({
				where: and(
					eq(exploratorySession.id, sessionId),
					eq(exploratorySession.projectId, projectId)
				)
			});
			if (!s) return err('Session not found');

			const deleted = await db.transaction(async (tx) => {
				await tx
					.delete(sessionNote)
					.where(
						and(
							eq(sessionNote.sessionId, sessionId),
							sql`exists (select 1 from exploratory_session where id = ${sessionId} and project_id = ${projectId})`
						)
					);
				const [deletedSession] = await tx
					.delete(exploratorySession)
					.where(
						and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
					)
					.returning();
				return deletedSession;
			});
			if (!deleted) return err('Session not found');

			return ok({ success: true, deletedId: sessionId });
		}
	);
}
