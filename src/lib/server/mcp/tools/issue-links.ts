import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { issueLink } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and, desc } from 'drizzle-orm';

export function registerIssueLinkTools(server: McpServer, projectId: number) {
	server.tool(
		'list-issue-links',
		'List issue links, optionally filtered by test case or execution',
		{
			testCaseId: z.number().optional().describe('Filter by test case ID'),
			executionId: z.number().optional().describe('Filter by execution ID')
		},
		async ({ testCaseId, executionId }) => {
			const conditions = [eq(issueLink.projectId, projectId)];
			if (testCaseId !== undefined) conditions.push(eq(issueLink.testCaseId, testCaseId));
			if (executionId !== undefined) conditions.push(eq(issueLink.testExecutionId, executionId));

			const links = await db
				.select()
				.from(issueLink)
				.where(and(...conditions))
				.orderBy(desc(issueLink.createdAt));

			return ok(links);
		}
	);

	server.tool(
		'create-issue-link',
		'Create a new issue link',
		{
			externalUrl: z.string().describe('External issue URL'),
			externalKey: z.string().optional().describe('External issue key (e.g., JIRA-123)'),
			title: z.string().optional().describe('Issue title'),
			provider: z.string().describe('Issue tracker provider (e.g., jira, github)'),
			testCaseId: z.number().optional().describe('Test case ID to link'),
			executionId: z.number().optional().describe('Execution ID to link')
		},
		async ({ externalUrl, externalKey, title, provider, testCaseId: tcId, executionId }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(issueLink)
				.values({
					projectId,
					testCaseId: tcId ?? null,
					testExecutionId: executionId ?? null,
					externalUrl,
					externalKey: externalKey ?? null,
					title: title ?? null,
					provider,
					createdBy: creator
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'delete-issue-link',
		'Delete an issue link',
		{ linkId: z.number().describe('Issue link ID') },
		async ({ linkId }) => {
			const link = await db.query.issueLink.findFirst({
				where: and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId))
			});
			if (!link) return err('Issue link not found');

			await db.delete(issueLink).where(eq(issueLink.id, linkId));
			return ok({ success: true, deletedId: linkId });
		}
	);
}
