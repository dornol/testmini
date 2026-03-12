import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, findTestCaseWithLatestVersion } from '$lib/server/db';
import { project, testCase, testCaseVersion, tag, testCaseTag } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export function registerTestCaseTools(server: McpServer, projectId: number) {
	server.tool(
		'search-test-cases',
		'Search test cases by keyword in title, key, or steps',
		{ query: z.string().describe('Search keyword'), limit: z.number().optional().describe('Max results (default 20)') },
		async ({ query, limit }) => {
			const maxResults = Math.min(limit ?? 20, 100);
			const results = await db
				.select({
					id: testCase.id,
					key: testCase.key,
					title: testCaseVersion.title,
					priority: testCaseVersion.priority
				})
				.from(testCase)
				.leftJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
				.where(
					and(
						eq(testCase.projectId, projectId),
						sql`search_vector @@ plainto_tsquery('english', ${query})`
					)
				)
				.limit(maxResults);

			return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
		}
	);

	server.tool(
		'get-test-case',
		'Get full details of a test case by ID or key',
		{ id: z.number().optional().describe('Test case ID'), key: z.string().optional().describe('Test case key (e.g., TC-0001)') },
		async ({ id, key }) => {
			let tc;
			if (id) {
				tc = await findTestCaseWithLatestVersion(id, projectId);
			} else if (key) {
				const found = await db.query.testCase.findFirst({
					where: and(eq(testCase.projectId, projectId), eq(testCase.key, key))
				});
				if (found) tc = await findTestCaseWithLatestVersion(found.id, projectId);
			}

			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			// Load tags
			const tags = await db
				.select({ name: tag.name, color: tag.color })
				.from(testCaseTag)
				.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
				.where(eq(testCaseTag.testCaseId, tc.id));

			return { content: [{ type: 'text' as const, text: JSON.stringify({ ...tc, tags }, null, 2) }] };
		}
	);

	server.tool(
		'create-test-case',
		'Create a new test case',
		{
			title: z.string().describe('Test case title'),
			priority: z.string().optional().describe('Priority name (default: MEDIUM)'),
			precondition: z.string().optional(),
			steps: z.array(z.object({ action: z.string(), expected: z.string().optional() })).optional(),
			expectedResult: z.string().optional()
		},
		async ({ title, priority, precondition, steps, expectedResult }) => {
			// Get next key
			const [maxRow] = await db
				.select({ maxKey: sql<string>`max(key)` })
				.from(testCase)
				.where(eq(testCase.projectId, projectId));

			const maxNum = maxRow?.maxKey
				? parseInt(maxRow.maxKey.replace(/^TC-/, ''), 10)
				: 0;
			const nextKey = `TC-${String(maxNum + 1).padStart(4, '0')}`;

			// Get project creator for attribution
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const formattedSteps = (steps ?? []).map((s, i) => ({
				order: i + 1,
				action: s.action,
				expected: s.expected ?? ''
			}));

			const result = await db.transaction(async (tx) => {
				const [tc] = await tx
					.insert(testCase)
					.values({
						projectId,
						key: nextKey,
						createdBy: proj.createdBy,
						sortOrder: maxNum + 1
					})
					.returning();

				const [version] = await tx
					.insert(testCaseVersion)
					.values({
						testCaseId: tc.id,
						versionNo: 1,
						title,
						precondition: precondition ?? null,
						steps: formattedSteps,
						expectedResult: expectedResult ?? null,
						priority: priority ?? 'MEDIUM',
						updatedBy: proj.createdBy
					})
					.returning();

				await tx
					.update(testCase)
					.set({ latestVersionId: version.id })
					.where(eq(testCase.id, tc.id));

				return { ...tc, latestVersion: version };
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
		}
	);

	server.tool(
		'update-test-case',
		'Update an existing test case (creates a new version)',
		{
			id: z.number().optional().describe('Test case ID'),
			key: z.string().optional().describe('Test case key (e.g., TC-0001)'),
			title: z.string().optional().describe('New title'),
			priority: z.string().optional().describe('New priority name'),
			precondition: z.string().optional().describe('New precondition'),
			steps: z.array(z.object({ action: z.string(), expected: z.string().optional() })).optional().describe('New steps'),
			expectedResult: z.string().optional().describe('New expected result')
		},
		async ({ id, key, title, priority, precondition, steps, expectedResult }) => {
			let tc;
			if (id) {
				tc = await findTestCaseWithLatestVersion(id, projectId);
			} else if (key) {
				const found = await db.query.testCase.findFirst({
					where: and(eq(testCase.projectId, projectId), eq(testCase.key, key))
				});
				if (found) tc = await findTestCaseWithLatestVersion(found.id, projectId);
			}

			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };
			if (!tc.latestVersion) return { content: [{ type: 'text' as const, text: 'No version found' }], isError: true };

			const prev = tc.latestVersion;
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const formattedSteps = steps
				? steps.map((s, i) => ({ order: i + 1, action: s.action, expected: s.expected ?? '' }))
				: prev.steps;

			const result = await db.transaction(async (tx) => {
				const [version] = await tx
					.insert(testCaseVersion)
					.values({
						testCaseId: tc.id,
						versionNo: prev.versionNo + 1,
						title: title ?? prev.title,
						precondition: precondition !== undefined ? precondition : prev.precondition,
						steps: formattedSteps,
						expectedResult: expectedResult !== undefined ? expectedResult : prev.expectedResult,
						priority: priority ?? prev.priority,
						updatedBy: proj.createdBy
					})
					.returning();

				await tx
					.update(testCase)
					.set({ latestVersionId: version.id })
					.where(eq(testCase.id, tc.id));

				return { ...tc, latestVersion: version };
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
		}
	);

	server.tool(
		'delete-test-case',
		'Delete a test case by ID or key',
		{
			id: z.number().optional().describe('Test case ID'),
			key: z.string().optional().describe('Test case key (e.g., TC-0001)')
		},
		async ({ id, key }) => {
			let tcId: number | undefined;
			if (id) {
				tcId = id;
			} else if (key) {
				const found = await db.query.testCase.findFirst({
					where: and(eq(testCase.projectId, projectId), eq(testCase.key, key))
				});
				tcId = found?.id;
			}
			if (!tcId) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			await db.delete(testCase).where(and(eq(testCase.id, tcId), eq(testCase.projectId, projectId)));
			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: tcId }) }] };
		}
	);
}
