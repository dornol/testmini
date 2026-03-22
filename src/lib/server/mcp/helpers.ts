import { db } from '$lib/server/db';
import { project, testCase } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

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
