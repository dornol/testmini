import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, issueLink } from '$lib/server/db/schema';
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

			return { content: [{ type: 'text' as const, text: JSON.stringify(links, null, 2) }] };
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
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

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
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);
}
