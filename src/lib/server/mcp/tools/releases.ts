import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, release } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export function registerReleaseTools(server: McpServer, projectId: number) {
	server.tool(
		'list-releases',
		'List all releases for the project',
		{},
		async () => {
			const releases = await db.query.release.findMany({
				where: eq(release.projectId, projectId)
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify(releases, null, 2) }] };
		}
	);

	server.tool(
		'create-release',
		'Create a new release',
		{
			name: z.string().describe('Release name'),
			version: z.string().optional().describe('Version string (e.g. "1.0.0")'),
			description: z.string().optional().describe('Release description'),
			releaseDate: z.string().optional().describe('Release date (ISO 8601)')
		},
		async ({ name, version, description, releaseDate }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(release)
				.values({
					projectId,
					name,
					version,
					description,
					releaseDate: releaseDate ? new Date(releaseDate) : null,
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'update-release',
		'Update an existing release',
		{
			releaseId: z.number().describe('Release ID'),
			name: z.string().optional().describe('Release name'),
			version: z.string().optional().describe('Version string'),
			description: z.string().optional().describe('Release description'),
			status: z
				.enum(['PLANNING', 'IN_PROGRESS', 'READY', 'RELEASED'])
				.optional()
				.describe('Release status'),
			releaseDate: z.string().optional().describe('Release date (ISO 8601)')
		},
		async ({ releaseId, name, version, description, status, releaseDate }) => {
			const r = await db.query.release.findFirst({
				where: and(eq(release.id, releaseId), eq(release.projectId, projectId))
			});
			if (!r) return { content: [{ type: 'text' as const, text: 'Release not found' }], isError: true };

			const updates: Record<string, unknown> = {};
			if (name !== undefined) updates.name = name;
			if (version !== undefined) updates.version = version;
			if (description !== undefined) updates.description = description;
			if (status !== undefined) updates.status = status;
			if (releaseDate !== undefined) updates.releaseDate = new Date(releaseDate);

			const [updated] = await db
				.update(release)
				.set(updates)
				.where(eq(release.id, releaseId))
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(updated, null, 2) }] };
		}
	);

	server.tool(
		'delete-release',
		'Delete a release by ID',
		{ releaseId: z.number().describe('Release ID') },
		async ({ releaseId }) => {
			const r = await db.query.release.findFirst({
				where: and(eq(release.id, releaseId), eq(release.projectId, projectId))
			});
			if (!r) return { content: [{ type: 'text' as const, text: 'Release not found' }], isError: true };

			await db.delete(release).where(eq(release.id, releaseId));
			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify({ success: true, deletedId: releaseId })
					}
				]
			};
		}
	);
}
