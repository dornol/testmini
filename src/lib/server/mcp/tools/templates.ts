import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testCaseTemplate } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import { eq, and, sql } from 'drizzle-orm';
import {
	validateCreateTemplateInput,
	validateUpdateTemplateInput
} from '$lib/server/template-validation';

const MAX_TEST_CASE_TITLE_LENGTH = 200;

async function mcpValidationError(
	response: Response,
	fallback: string
): Promise<ReturnType<typeof err>> {
	const body = (await response.json().catch(() => null)) as { error?: string } | null;
	return err(body?.error ?? fallback);
}

function validateTemplateTestCaseTitle(title: string): string | ReturnType<typeof err> {
	const trimmed = title.trim();
	if (trimmed.length === 0) return err('Title is required');
	if (trimmed.length > MAX_TEST_CASE_TITLE_LENGTH) {
		return err(`Title must be ${MAX_TEST_CASE_TITLE_LENGTH} characters or less`);
	}
	return trimmed;
}

export function registerTemplateTools(server: McpServer, projectId: number) {
	server.tool(
		'get-template',
		'Get template by ID',
		{ templateId: mcpPositiveIdSchema.describe('Template ID') },
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
			description: z.string().nullable().optional(),
			priority: z.string().optional(),
			precondition: z.string().nullable().optional(),
			steps: z.array(z.object({ action: z.string(), expected: z.string().optional() })).optional()
		},
		async ({ name, description, priority, precondition, steps }) => {
			const templateOrError = validateCreateTemplateInput({
				name,
				description,
				priority,
				precondition,
				steps
			});
			if (templateOrError instanceof Response) {
				return mcpValidationError(templateOrError, 'Invalid template');
			}

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [template] = await db
				.insert(testCaseTemplate)
				.values({
					projectId,
					name: templateOrError.name,
					description: templateOrError.description ?? null,
					priority: templateOrError.priority ?? 'MEDIUM',
					precondition: templateOrError.precondition ?? null,
					steps: templateOrError.steps ?? [],
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
			templateId: mcpPositiveIdSchema.describe('Template ID'),
			title: z.string()
		},
		async ({ templateId, title }) => {
			const titleOrError = validateTemplateTestCaseTitle(title);
			if (typeof titleOrError !== 'string') return titleOrError;

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

			const maxNum = maxRow?.maxKey ? parseInt(maxRow.maxKey.replace(/^TC-/, ''), 10) : 0;
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
						title: titleOrError,
						precondition: template.precondition,
						steps: template.steps,
						priority: template.priority,
						updatedBy: creator
					})
					.returning();

				await tx
					.update(testCase)
					.set({ latestVersionId: version.id })
					.where(and(eq(testCase.id, tc.id), eq(testCase.projectId, projectId)));

				return { ...tc, latestVersion: version };
			});

			return ok(result);
		}
	);

	server.tool(
		'update-template',
		'Update a test case template',
		{
			templateId: mcpPositiveIdSchema.describe('Template ID'),
			name: z.string().optional().describe('New name'),
			description: z.string().nullable().optional().describe('New description'),
			priority: z.string().optional().describe('New priority'),
			precondition: z.string().nullable().optional().describe('New precondition'),
			steps: z
				.array(z.object({ action: z.string(), expected: z.string().optional() }))
				.optional()
				.describe('New steps')
		},
		async ({ templateId, name, description, priority, precondition, steps }) => {
			const input: Record<string, unknown> = {};
			if (name !== undefined) input.name = name;
			if (description !== undefined) input.description = description;
			if (priority !== undefined) input.priority = priority;
			if (precondition !== undefined) input.precondition = precondition;
			if (steps !== undefined) input.steps = steps;

			const templateOrError = validateUpdateTemplateInput(input);
			if (templateOrError instanceof Response) {
				return mcpValidationError(templateOrError, 'Invalid template');
			}

			if (Object.keys(templateOrError).length === 0) return err('No fields to update');

			const t = await db.query.testCaseTemplate.findFirst({
				where: and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId))
			});
			if (!t) return err('Template not found');

			const updates: Record<string, unknown> = {};
			if (templateOrError.name !== undefined) updates.name = templateOrError.name;
			if (templateOrError.description !== undefined)
				updates.description = templateOrError.description;
			if (templateOrError.priority !== undefined) updates.priority = templateOrError.priority;
			if (templateOrError.precondition !== undefined)
				updates.precondition = templateOrError.precondition;
			if (templateOrError.steps !== undefined) updates.steps = templateOrError.steps;

			const [updated] = await db
				.update(testCaseTemplate)
				.set(updates)
				.where(and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId)))
				.returning();
			return ok(updated);
		}
	);

	server.tool(
		'delete-template',
		'Delete a test case template',
		{ templateId: mcpPositiveIdSchema.describe('Template ID') },
		async ({ templateId }) => {
			const t = await db.query.testCaseTemplate.findFirst({
				where: and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId))
			});
			if (!t) return err('Template not found');

			await db
				.delete(testCaseTemplate)
				.where(and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId)));
			return ok({ success: true, deletedId: templateId });
		}
	);
}
