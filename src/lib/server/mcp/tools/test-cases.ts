import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, findTestCaseWithLatestVersion } from '$lib/server/db';
import { testCase, testCaseVersion, tag, testCaseTag, testCaseAssignee, testCaseGroup } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and, sql, desc } from 'drizzle-orm';

export function registerTestCaseTools(server: McpServer, projectId: number) {
	server.tool(
		'list-test-cases',
		'List all test cases for the project',
		{
			limit: z.number().optional().describe('Max results (default 50)'),
			groupId: z.number().optional().describe('Filter by group ID')
		},
		async ({ limit, groupId }) => {
			const conditions = [eq(testCase.projectId, projectId)];
			if (groupId !== undefined) conditions.push(eq(testCase.groupId, groupId));

			const cases = await db
				.select({
					id: testCase.id,
					key: testCase.key,
					title: testCaseVersion.title,
					priority: testCaseVersion.priority,
					groupId: testCase.groupId,
					approvalStatus: testCase.approvalStatus,
					createdAt: testCase.createdAt
				})
				.from(testCase)
				.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
				.where(and(...conditions))
				.orderBy(desc(testCase.createdAt))
				.limit(limit ?? 50);

			return ok(cases);
		}
	);

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

			return ok(results);
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

			if (!tc) return err('Test case not found');

			// Load tags
			const tags = await db
				.select({ name: tag.name, color: tag.color })
				.from(testCaseTag)
				.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
				.where(eq(testCaseTag.testCaseId, tc.id));

			return ok({ ...tc, tags });
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
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

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
						precondition: precondition ?? null,
						steps: formattedSteps,
						expectedResult: expectedResult ?? null,
						priority: priority ?? 'MEDIUM',
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

			if (!tc) return err('Test case not found');
			if (!tc.latestVersion) return err('No version found');

			const prev = tc.latestVersion;
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

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
			if (!tcId) return err('Test case not found');

			await db.delete(testCase).where(and(eq(testCase.id, tcId), eq(testCase.projectId, projectId)));
			return ok({ success: true, deletedId: tcId });
		}
	);

	server.tool(
		'clone-test-case',
		'Clone (duplicate) a test case with all its data',
		{
			id: z.number().optional().describe('Test case ID'),
			key: z.string().optional().describe('Test case key (e.g., TC-0001)')
		},
		async ({ id, key }) => {
			let tcId = id;
			if (!tcId && key) {
				const found = await db.query.testCase.findFirst({
					where: and(eq(testCase.key, key), eq(testCase.projectId, projectId))
				});
				tcId = found?.id;
			}
			if (!tcId) return err('Test case not found');

			const tc = await findTestCaseWithLatestVersion(tcId, projectId);
			if (!tc?.latestVersion) return err('Test case not found');

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [maxResult] = await db
				.select({ maxKey: sql<string>`max(key)`.as('max_key') })
				.from(testCase)
				.where(eq(testCase.projectId, projectId));
			const maxNum = maxResult?.maxKey ? parseInt(maxResult.maxKey.replace(/\D/g, ''), 10) : 0;
			const newKey = `TC-${String(maxNum + 1).padStart(4, '0')}`;

			const result = await db.transaction(async (tx) => {
				const [newTc] = await tx
					.insert(testCase)
					.values({
						projectId,
						key: newKey,
						groupId: tc.groupId,
						createdBy: creator
					})
					.returning();

				const lv = tc.latestVersion!;
				const [newVer] = await tx
					.insert(testCaseVersion)
					.values({
						testCaseId: newTc.id,
						versionNo: 1,
						title: `${lv.title} (copy)`,
						precondition: lv.precondition,
						steps: lv.steps,
						expectedResult: lv.expectedResult,
						priority: lv.priority,
						updatedBy: creator
					})
					.returning();

				await tx.update(testCase).set({ latestVersionId: newVer.id }).where(eq(testCase.id, newTc.id));

				// Copy tags
				const tags = await tx.select().from(testCaseTag).where(eq(testCaseTag.testCaseId, tcId!));
				if (tags.length > 0) {
					await tx.insert(testCaseTag).values(tags.map((t) => ({ testCaseId: newTc.id, tagId: t.tagId }))).onConflictDoNothing();
				}

				return { ...newTc, key: newKey, title: newVer.title };
			});

			return ok(result);
		}
	);

	server.tool(
		'get-test-case-versions',
		'Get version history of a test case',
		{
			id: z.number().optional().describe('Test case ID'),
			key: z.string().optional().describe('Test case key (e.g., TC-0001)')
		},
		async ({ id, key }) => {
			let tcId = id;
			if (!tcId && key) {
				const found = await db.query.testCase.findFirst({
					where: and(eq(testCase.key, key), eq(testCase.projectId, projectId))
				});
				tcId = found?.id;
			}
			if (!tcId) return err('Test case not found');

			const versions = await db
				.select({
					id: testCaseVersion.id,
					versionNo: testCaseVersion.versionNo,
					title: testCaseVersion.title,
					priority: testCaseVersion.priority,
					createdAt: testCaseVersion.createdAt
				})
				.from(testCaseVersion)
				.where(eq(testCaseVersion.testCaseId, tcId))
				.orderBy(desc(testCaseVersion.versionNo));

			return ok(versions);
		}
	);

	server.tool(
		'move-test-case-to-group',
		'Move a test case to a group (or remove from group by passing null)',
		{
			testCaseId: z.number().describe('Test case ID'),
			groupId: z.number().nullable().describe('Target group ID (null to ungroup)')
		},
		async ({ testCaseId, groupId }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return err('Test case not found');

			if (groupId !== null) {
				const group = await db.query.testCaseGroup.findFirst({
					where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
				});
				if (!group) return err('Group not found');
			}

			await db.update(testCase).set({ groupId }).where(eq(testCase.id, testCaseId));
			return ok({ success: true, testCaseId, groupId });
		}
	);

	server.tool(
		'assign-test-case',
		'Assign a user to a test case',
		{
			testCaseId: z.number().describe('Test case ID'),
			userId: z.string().describe('User ID to assign')
		},
		async ({ testCaseId, userId }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return err('Test case not found');

			await db.insert(testCaseAssignee).values({ testCaseId, userId }).onConflictDoNothing();
			return ok({ success: true, testCaseId, userId });
		}
	);

	server.tool(
		'unassign-test-case',
		'Remove a user assignment from a test case',
		{
			testCaseId: z.number().describe('Test case ID'),
			userId: z.string().describe('User ID to unassign')
		},
		async ({ testCaseId, userId }) => {
			await db.delete(testCaseAssignee)
				.where(and(eq(testCaseAssignee.testCaseId, testCaseId), eq(testCaseAssignee.userId, userId)));
			return ok({ success: true, testCaseId, userId });
		}
	);

	server.tool(
		'update-test-case-risk',
		'Set risk assessment for a test case',
		{
			testCaseId: z.number().describe('Test case ID'),
			riskImpact: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().describe('Risk impact level'),
			riskLikelihood: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().describe('Risk likelihood level')
		},
		async ({ testCaseId, riskImpact, riskLikelihood }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return err('Test case not found');

			let riskLevel: string | null = null;
			if (riskImpact && riskLikelihood) {
				const matrix: Record<string, Record<string, string>> = {
					HIGH: { HIGH: 'CRITICAL', MEDIUM: 'HIGH', LOW: 'MEDIUM' },
					MEDIUM: { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' },
					LOW: { HIGH: 'MEDIUM', MEDIUM: 'LOW', LOW: 'LOW' }
				};
				riskLevel = matrix[riskImpact][riskLikelihood];
			}

			await db.update(testCase)
				.set({ riskImpact, riskLikelihood, riskLevel })
				.where(eq(testCase.id, testCaseId));
			return ok({ success: true, testCaseId, riskImpact, riskLikelihood, riskLevel });
		}
	);
}
