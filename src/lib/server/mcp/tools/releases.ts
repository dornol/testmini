import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { release } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import { eq, and } from 'drizzle-orm';
import { createReleaseSchema, updateReleaseSchema } from '$lib/schemas/release.schema';

function firstValidationError(error: { issues: Array<{ message: string }> }): string {
	return error.issues[0]?.message ?? 'Invalid release';
}

function parseOptionalDate(
	value: string | null | undefined
): Date | null | undefined | ReturnType<typeof err> {
	if (value === undefined) return undefined;
	if (value === null) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const date = new Date(trimmed);
	if (Number.isNaN(date.getTime())) return err('Invalid release date');
	return date;
}

export function registerReleaseTools(server: McpServer, projectId: number) {
	server.tool('list-releases', 'List all releases for the project', {}, async () => {
		const releases = await db.query.release.findMany({
			where: eq(release.projectId, projectId)
		});

		return ok(releases);
	});

	server.tool(
		'create-release',
		'Create a new release',
		{
			name: z.string().describe('Release name'),
			version: z.string().max(100).optional().describe('Version string (e.g. "1.0.0")'),
			description: z.string().max(2000).optional().describe('Release description'),
			releaseDate: z.string().optional().describe('Release date (ISO 8601)')
		},
		async ({ name, version, description, releaseDate }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const parsed = createReleaseSchema.safeParse({
				name: name.trim(),
				version: version?.trim(),
				description: description?.trim(),
				releaseDate: releaseDate?.trim()
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const parsedReleaseDate = parseOptionalDate(parsed.data.releaseDate);
			if (parsedReleaseDate instanceof Object && 'content' in parsedReleaseDate) {
				return parsedReleaseDate;
			}

			const [created] = await db
				.insert(release)
				.values({
					projectId,
					name: parsed.data.name,
					version: parsed.data.version || null,
					description: parsed.data.description || null,
					status: parsed.data.status ?? 'PLANNING',
					releaseDate: parsedReleaseDate ?? null,
					createdBy: creator
				})
				.returning();

			if (!created) return err('Failed to create release');
			return ok(created);
		}
	);

	server.tool(
		'update-release',
		'Update an existing release',
		{
			releaseId: mcpPositiveIdSchema.describe('Release ID'),
			name: z.string().optional().describe('Release name'),
			version: z.string().max(100).optional().describe('Version string'),
			description: z.string().max(2000).optional().describe('Release description'),
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
			if (!r) return err('Release not found');

			const parsed = updateReleaseSchema.safeParse({
				name: name?.trim(),
				version: version?.trim(),
				description: description?.trim(),
				status,
				releaseDate: releaseDate?.trim()
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const parsedReleaseDate = parseOptionalDate(parsed.data.releaseDate);
			if (parsedReleaseDate instanceof Object && 'content' in parsedReleaseDate) {
				return parsedReleaseDate;
			}

			const updates: Record<string, unknown> = {};
			if (parsed.data.name !== undefined) updates.name = parsed.data.name;
			if (parsed.data.version !== undefined) updates.version = parsed.data.version || null;
			if (parsed.data.description !== undefined)
				updates.description = parsed.data.description || null;
			if (parsed.data.status !== undefined) updates.status = parsed.data.status;
			if (parsed.data.releaseDate !== undefined) updates.releaseDate = parsedReleaseDate ?? null;

			if (Object.keys(updates).length === 0) return err('No fields to update');

			const [updated] = await db
				.update(release)
				.set(updates)
				.where(and(eq(release.id, releaseId), eq(release.projectId, projectId)))
				.returning();

			if (!updated) return err('Release not found');
			return ok(updated);
		}
	);

	server.tool(
		'delete-release',
		'Delete a release by ID',
		{ releaseId: mcpPositiveIdSchema.describe('Release ID') },
		async ({ releaseId }) => {
			const r = await db.query.release.findFirst({
				where: and(eq(release.id, releaseId), eq(release.projectId, projectId))
			});
			if (!r) return err('Release not found');

			const [deleted] = await db
				.delete(release)
				.where(and(eq(release.id, releaseId), eq(release.projectId, projectId)))
				.returning({ id: release.id });
			if (!deleted) return err('Release not found');
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
