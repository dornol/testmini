import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { issueLink, testCase, testExecution, testRun } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and, desc } from 'drizzle-orm';

async function validateIssueLinkTarget(
	projectId: number,
	testCaseId?: number,
	executionId?: number
) {
	if (testCaseId !== undefined) {
		const existing = await db.query.testCase.findFirst({
			where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
		});
		if (!existing) return err('Test case not found in this project');
	}

	if (executionId !== undefined) {
		const [existing] = await db
			.select({ id: testExecution.id })
			.from(testExecution)
			.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
			.where(and(eq(testExecution.id, executionId), eq(testRun.projectId, projectId)))
			.limit(1);
		if (!existing) return err('Test execution not found in this project');
	}

	return null;
}

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
			const targetError = await validateIssueLinkTarget(projectId, tcId, executionId);
			if (targetError) return targetError;

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

			await db
				.delete(issueLink)
				.where(and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId)));
			return ok({ success: true, deletedId: linkId });
		}
	);
}
