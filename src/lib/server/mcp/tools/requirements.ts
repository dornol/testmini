import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, requirement, requirementTestCase } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and } from 'drizzle-orm';

export function registerRequirementTools(server: McpServer, projectId: number) {
	server.tool(
		'create-requirement',
		'Create a new requirement',
		{
			title: z.string(),
			externalId: z.string().optional(),
			description: z.string().optional(),
			source: z.string().optional()
		},
		async ({ title, externalId, description, source }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [req] = await db
				.insert(requirement)
				.values({
					projectId,
					title,
					externalId: externalId ?? null,
					description: description ?? null,
					source: source ?? null,
					createdBy: creator
				})
				.returning();

			return ok(req);
		}
	);

	server.tool(
		'link-requirement-test-case',
		'Link a requirement to a test case',
		{
			requirementId: z.number(),
			testCaseId: z.number()
		},
		async ({ requirementId, testCaseId }) => {
			const req = await db.query.requirement.findFirst({
				where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
			});
			if (!req) return err('Requirement not found');

			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return err('Test case not found');

			await db
				.insert(requirementTestCase)
				.values({ requirementId, testCaseId })
				.onConflictDoNothing();

			return ok({ success: true, requirementId, testCaseId });
		}
	);

	server.tool(
		'get-traceability-matrix',
		'Get requirement-to-test-case traceability matrix with coverage summary',
		{},
		async () => {
			const allRequirements = await db
				.select({
					id: requirement.id,
					externalId: requirement.externalId,
					title: requirement.title,
					description: requirement.description,
					source: requirement.source
				})
				.from(requirement)
				.where(eq(requirement.projectId, projectId))
				.orderBy(requirement.id);

			const allLinks = await db
				.select({
					requirementId: requirementTestCase.requirementId,
					testCaseId: testCase.id,
					testCaseKey: testCase.key,
					testCaseTitle: testCaseVersion.title
				})
				.from(requirementTestCase)
				.innerJoin(testCase, eq(requirementTestCase.testCaseId, testCase.id))
				.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
				.where(eq(testCase.projectId, projectId));

			const linkMap = new Map<number, typeof allLinks>();
			for (const link of allLinks) {
				const existing = linkMap.get(link.requirementId);
				if (existing) {
					existing.push(link);
				} else {
					linkMap.set(link.requirementId, [link]);
				}
			}

			const matrix = allRequirements.map((req) => {
				const linkedCases = linkMap.get(req.id) ?? [];
				return {
					...req,
					testCases: linkedCases.map((l) => ({
						id: l.testCaseId,
						key: l.testCaseKey,
						title: l.testCaseTitle
					})),
					covered: linkedCases.length > 0
				};
			});

			const totalRequirements = allRequirements.length;
			const coveredRequirements = matrix.filter((r) => r.covered).length;
			const uncoveredRequirements = totalRequirements - coveredRequirements;
			const coveragePercent = totalRequirements > 0
				? Math.round((coveredRequirements / totalRequirements) * 100)
				: 0;

			const result = {
				summary: {
					totalRequirements,
					coveredRequirements,
					uncoveredRequirements,
					coveragePercent
				},
				matrix
			};

			return ok(result);
		}
	);

	server.tool(
		'update-requirement',
		'Update a requirement',
		{
			requirementId: z.number().describe('Requirement ID'),
			title: z.string().optional().describe('New title'),
			description: z.string().optional().describe('New description'),
			externalId: z.string().optional().describe('New external ID'),
			source: z.string().optional().describe('New source')
		},
		async ({ requirementId, title, description, externalId, source }) => {
			const r = await db.query.requirement.findFirst({
				where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
			});
			if (!r) return err('Requirement not found');

			const updates: Record<string, unknown> = {};
			if (title !== undefined) updates.title = title;
			if (description !== undefined) updates.description = description;
			if (externalId !== undefined) updates.externalId = externalId;
			if (source !== undefined) updates.source = source;

			const [updated] = await db.update(requirement).set(updates).where(eq(requirement.id, requirementId)).returning();
			return ok(updated);
		}
	);

	server.tool(
		'delete-requirement',
		'Delete a requirement',
		{ requirementId: z.number().describe('Requirement ID') },
		async ({ requirementId }) => {
			const r = await db.query.requirement.findFirst({
				where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
			});
			if (!r) return err('Requirement not found');

			await db.delete(requirementTestCase).where(eq(requirementTestCase.requirementId, requirementId));
			await db.delete(requirement).where(eq(requirement.id, requirementId));
			return ok({ success: true, deletedId: requirementId });
		}
	);

	server.tool(
		'unlink-requirement-test-case',
		'Remove link between a requirement and a test case',
		{
			requirementId: z.number().describe('Requirement ID'),
			testCaseId: z.number().describe('Test case ID')
		},
		async ({ requirementId, testCaseId }) => {
			await db.delete(requirementTestCase)
				.where(and(eq(requirementTestCase.requirementId, requirementId), eq(requirementTestCase.testCaseId, testCaseId)));
			return ok({ success: true, requirementId, testCaseId });
		}
	);
}
