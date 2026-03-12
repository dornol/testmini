import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, testCase, testCaseVersion, requirement, requirementTestCase } from '$lib/server/db/schema';
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
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [req] = await db
				.insert(requirement)
				.values({
					projectId,
					title,
					externalId: externalId ?? null,
					description: description ?? null,
					source: source ?? null,
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(req, null, 2) }] };
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
			if (!req) return { content: [{ type: 'text' as const, text: 'Requirement not found' }], isError: true };

			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			await db
				.insert(requirementTestCase)
				.values({ requirementId, testCaseId })
				.onConflictDoNothing();

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, requirementId, testCaseId }, null, 2) }] };
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

			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
		}
	);
}
