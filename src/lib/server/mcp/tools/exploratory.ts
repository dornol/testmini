import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and, desc } from 'drizzle-orm';

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

			const [created] = await db
				.insert(exploratorySession)
				.values({
					projectId,
					title,
					charter: charter ?? null,
					environment: environment ?? null,
					tags: sessionTags ?? [],
					createdBy: creator
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'get-exploratory-session',
		'Get an exploratory session with its notes',
		{
			sessionId: z.number().describe('Session ID')
		},
		async ({ sessionId }) => {
			const session = await db.query.exploratorySession.findFirst({
				where: and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
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
			sessionId: z.number().describe('Session ID'),
			status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).optional().describe('New status'),
			summary: z.string().optional().describe('Session summary')
		},
		async ({ sessionId, status, summary }) => {
			const session = await db.query.exploratorySession.findFirst({
				where: and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
			});
			if (!session) return err('Session not found');

			const updates: Record<string, unknown> = {};
			if (status !== undefined) updates.status = status;
			if (summary !== undefined) updates.summary = summary;
			if (status === 'COMPLETED') updates.completedAt = new Date();

			await db
				.update(exploratorySession)
				.set(updates)
				.where(eq(exploratorySession.id, sessionId));

			const updated = await db.query.exploratorySession.findFirst({
				where: eq(exploratorySession.id, sessionId)
			});

			return ok(updated);
		}
	);

	server.tool(
		'add-session-note',
		'Add a note to an exploratory session',
		{
			sessionId: z.number().describe('Session ID'),
			content: z.string().describe('Note content'),
			noteType: z.enum(['NOTE', 'BUG', 'QUESTION', 'IDEA']).optional().describe('Note type (default: NOTE)'),
			timestamp: z.number().optional().describe('Elapsed seconds since session start')
		},
		async ({ sessionId, content: noteContent, noteType, timestamp: ts }) => {
			const session = await db.query.exploratorySession.findFirst({
				where: and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
			});
			if (!session) return err('Session not found');

			const elapsed = ts ?? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);

			const [created] = await db
				.insert(sessionNote)
				.values({
					sessionId,
					content: noteContent,
					noteType: noteType ?? 'NOTE',
					timestamp: elapsed
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'list-exploratory-sessions',
		'List exploratory testing sessions',
		{
			status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).optional().describe('Filter by status'),
			limit: z.number().optional().describe('Max results (default 20)')
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
				.limit(limit ?? 20);

			return ok(sessions);
		}
	);

	server.tool(
		'delete-exploratory-session',
		'Delete an exploratory session and its notes',
		{ sessionId: z.number().describe('Session ID') },
		async ({ sessionId }) => {
			const s = await db.query.exploratorySession.findFirst({
				where: and(eq(exploratorySession.id, sessionId), eq(exploratorySession.projectId, projectId))
			});
			if (!s) return err('Session not found');

			await db.delete(sessionNote).where(eq(sessionNote.sessionId, sessionId));
			await db.delete(exploratorySession).where(eq(exploratorySession.id, sessionId));
			return ok({ success: true, deletedId: sessionId });
		}
	);
}
