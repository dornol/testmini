import { db } from '$lib/server/db';
import { project, testCase } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const MAX_MCP_ID_LIST_ITEMS = 500;

export function mcpLimitSchema(max: number) {
	return z
		.number()
		.int()
		.positive()
		.max(max)
		.refine(Number.isSafeInteger, 'limit must be a safe integer');
}

export const mcpPositiveIdSchema = z
	.number()
	.int()
	.positive()
	.refine(Number.isSafeInteger, 'ID must be a safe integer');

export const mcpIdListSchema = z
	.array(mcpPositiveIdSchema)
	.min(1, 'At least one ID is required')
	.max(MAX_MCP_ID_LIST_ITEMS, `IDs must contain ${MAX_MCP_ID_LIST_ITEMS} items or less`)
	.superRefine((ids, ctx) => {
		const seen = new Set<number>();
		for (const [index, id] of ids.entries()) {
			if (seen.has(id)) {
				ctx.addIssue({
					code: 'custom',
					message: 'IDs must not contain duplicates',
					path: [index]
				});
			}
			seen.add(id);
		}
	});

// ── Response helpers ─────────────────────────────────────

type McpTextContent = { type: 'text'; text: string };
type McpResult = { content: McpTextContent[]; isError?: boolean };

export function ok(data: unknown): McpResult {
	return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function err(message: string): McpResult {
	return { content: [{ type: 'text' as const, text: message }], isError: true };
}

// ── Entity helpers ───────────────────────────────────────

/**
 * Get project's createdBy (needed for insert operations).
 * No caching — projectId is fixed per MCP session, and this avoids
 * stale-cache issues in tests.
 */
export async function getProjectCreator(projectId: number): Promise<string | null> {
	const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
	return proj?.createdBy ?? null;
}

/** Get project creator or return error response. */
export async function requireProjectCreator(projectId: number): Promise<string | McpResult> {
	const creator = await getProjectCreator(projectId);
	if (!creator) return err('Project not found');
	return creator;
}

// ── Update helpers ───────────────────────────────────────

/**
 * Build a partial update object from optional fields.
 * Filters out undefined values so only provided fields are updated.
 */
export function buildUpdates(fields: Record<string, unknown>): Record<string, unknown> {
	const updates: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) updates[key] = value;
	}
	return updates;
}

// ── Key generation ───────────────────────────────────────

/** Generate next TC-XXXX key for a project. */
export async function nextTestCaseKey(projectId: number): Promise<string> {
	const [maxResult] = await db
		.select({ maxKey: sql<string>`max(key)`.as('max_key') })
		.from(testCase)
		.where(eq(testCase.projectId, projectId));

	const maxNum = maxResult?.maxKey ? parseInt(maxResult.maxKey.replace(/^TC-/, ''), 10) : 0;
	return `TC-${String((isNaN(maxNum) ? 0 : maxNum) + 1).padStart(4, '0')}`;
}
