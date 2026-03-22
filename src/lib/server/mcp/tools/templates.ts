import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testCaseTemplate } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and, sql } from 'drizzle-orm';

export function registerTemplateTools(server: McpServer, projectId: number) {
	server.tool(
		'get-template',
		'Get template by ID',
		{ templateId: z.number() },
		async ({ templateId }) => {
			const template = await db.query.testCaseTemplate.findFirst({
				where: and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId))
			});

			if (!template) return err('Template not found');

			return ok(template);
		}
	);

	server.tool(
		'create-template',
		'Create a test case template',
		{
			name: z.string(),
			description: z.string().optional(),
			priority: z.string().optional(),
			precondition: z.string().optional(),
			steps: z.array(z.object({ action: z.string(), expected: z.string().optional() })).optional()
		},
		async ({ name, description, priority, precondition, steps }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const formattedSteps = (steps ?? []).map((s, i) => ({
				order: i + 1,
				action: s.action,
				expected: s.expected ?? ''
			}));

			const [template] = await db
				.insert(testCaseTemplate)
				.values({
					projectId,
					name,
					description: description ?? null,
					priority: priority ?? 'MEDIUM',
					precondition: precondition ?? null,
					steps: formattedSteps,
					createdBy: creator
				})
				.returning();

			return ok(template);
		}
	);

	server.tool(
		'create-test-case-from-template',
		'Create a test case from an existing template',
		{
			templateId: z.number(),
			title: z.string()
		},
		async ({ templateId, title }) => {
			const template = await db.query.testCaseTemplate.findFirst({
				where: and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId))
			});
			if (!template) return err('Template not found');

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [maxRow] = await db
				.select({ maxKey: sql<string>`max(key)` })
				.from(testCase)
				.where(eq(testCase.projectId, projectId));

			const maxNum = maxRow?.maxKey
				? parseInt(maxRow.maxKey.replace(/^TC-/, ''), 10)
				: 0;
			const nextKey = `TC-${String(maxNum + 1).padStart(4, '0')}`;

			const result = await db.transaction(async (tx) => {
				const [tc] = await tx
					.insert(testCase)
					.values({
						projectId,
						key: nextKey,
						createdBy: creator,
						sortOrder: maxNum + 1
					})
					.returning();

				const [version] = await tx
					.insert(testCaseVersion)
					.values({
						testCaseId: tc.id,
						versionNo: 1,
						title,
						precondition: template.precondition,
						steps: template.steps,
						priority: template.priority,
						updatedBy: creator
					})
					.returning();

				await tx
					.update(testCase)
					.set({ latestVersionId: version.id })
					.where(eq(testCase.id, tc.id));

				return { ...tc, latestVersion: version };
			});

			return ok(result);
		}
	);
}
