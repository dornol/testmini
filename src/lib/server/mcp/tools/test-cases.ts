import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, findTestCaseWithLatestVersion } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	tag,
	testCaseTag,
	testCaseAssignee,
	testCaseGroup,
	projectMember
} from '$lib/server/db/schema';
import {
	ok,
	err,
	requireProjectCreator,
	mcpPositiveIdSchema,
	mcpIdListSchema,
	mcpLimitSchema
} from '../helpers';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import {
	validateTestCaseCreatePayload,
	validateTestCaseVersionFields
} from '$lib/server/test-case-update-validation';

const DEFAULT_LIST_LIMIT = 50;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_TEST_CASE_LIMIT = 100;

class McpTransactionError extends Error {}

function rollback(message: string): never {
	throw new McpTransactionError(message);
}

function toMcpTransactionError(error: unknown): ReturnType<typeof err> {
	if (error instanceof McpTransactionError) return err(error.message);
	throw error;
}

const mcpTestCaseStepSchema = z
	.object({
		action: z.string(),
		expected: z.string().optional()
	})
	.strict();
const mcpTestCaseCreateSchema = z
	.object({
		title: z.string().describe('Test case title'),
		priority: z.string().optional().describe('Priority (default: MEDIUM)'),
		precondition: z.string().optional().describe('Precondition'),
		steps: z.array(mcpTestCaseStepSchema).optional().describe('Test steps'),
		expectedResult: z.string().optional().describe('Expected result')
	})
	.strict();

async function mcpValidationError(
	response: Response,
	fallback: string
): Promise<ReturnType<typeof err>> {
	const body = (await response.json().catch(() => null)) as { error?: string } | null;
	return err(body?.error ?? fallback);
}

export function registerTestCaseTools(server: McpServer, projectId: number) {
	server.tool(
		'list-test-cases',
		'List all test cases for the project',
		{
			limit: mcpLimitSchema(MAX_TEST_CASE_LIMIT)
				.optional()
				.describe('Max results (default 50, max 100)'),
			groupId: mcpPositiveIdSchema.optional().describe('Filter by group ID')
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
				.limit(limit ?? DEFAULT_LIST_LIMIT);

			return ok(cases);
		}
	);

	server.tool(
		'search-test-cases',
		'Search test cases by keyword in title, key, or steps',
		{
			query: z.string().describe('Search keyword'),
			limit: mcpLimitSchema(MAX_TEST_CASE_LIMIT)
				.optional()
				.describe('Max results (default 20, max 100)')
		},
		async ({ query, limit }) => {
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
				.limit(limit ?? DEFAULT_SEARCH_LIMIT);

			return ok(results);
		}
	);

	server.tool(
		'get-test-case',
		'Get full details of a test case by ID or key',
		{
			id: mcpPositiveIdSchema.optional().describe('Test case ID'),
			key: z.string().optional().describe('Test case key (e.g., TC-0001)')
		},
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
			steps: z.array(mcpTestCaseStepSchema).optional(),
			expectedResult: z.string().optional()
		},
		async ({ title, priority, precondition, steps, expectedResult }) => {
			const fields = validateTestCaseCreatePayload({
				title,
				priority,
				precondition,
				steps,
				expectedResult
			});
			if (fields instanceof Response) {
				return mcpValidationError(fields, 'Invalid test case');
			}

			// Get next key
			const [maxRow] = await db
				.select({ maxKey: sql<string>`max(key)` })
				.from(testCase)
				.where(eq(testCase.projectId, projectId));

			const maxNum = maxRow?.maxKey ? parseInt(maxRow.maxKey.replace(/^TC-/, ''), 10) : 0;
			const nextKey = `TC-${String(maxNum + 1).padStart(4, '0')}`;

			// Get project creator for attribution
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			let result;
			try {
				result = await db.transaction(async (tx) => {
					const [tc] = await tx
						.insert(testCase)
						.values({
							projectId,
							key: nextKey,
							createdBy: creator,
							sortOrder: maxNum + 1
						})
						.returning();
					if (!tc) rollback('Failed to create test case');

					const [version] = await tx
						.insert(testCaseVersion)
						.values({
							testCaseId: tc.id,
							versionNo: 1,
							title: fields.title,
							precondition: fields.precondition,
							steps: fields.steps,
							expectedResult: fields.expectedResult,
							priority: fields.priority,
							updatedBy: creator
						})
						.returning();
					if (!version) rollback('Failed to create test case version');

					await tx
						.update(testCase)
						.set({ latestVersionId: version.id })
						.where(and(eq(testCase.id, tc.id), eq(testCase.projectId, projectId)));

					return { ...tc, latestVersion: version };
				});
			} catch (error) {
				return toMcpTransactionError(error);
			}
			return ok(result);
		}
	);

	server.tool(
		'update-test-case',
		'Update an existing test case (creates a new version)',
		{
			id: mcpPositiveIdSchema.optional().describe('Test case ID'),
			key: z.string().optional().describe('Test case key (e.g., TC-0001)'),
			title: z.string().optional().describe('New title'),
			priority: z.string().optional().describe('New priority name'),
			precondition: z.string().optional().describe('New precondition'),
			steps: z.array(mcpTestCaseStepSchema).optional().describe('New steps'),
			expectedResult: z.string().optional().describe('New expected result')
		},
		async ({ id, key, title, priority, precondition, steps, expectedResult }) => {
			const fields = validateTestCaseVersionFields({
				title,
				priority,
				precondition,
				steps,
				expectedResult
			});
			if (fields instanceof Response) {
				return mcpValidationError(fields, 'Invalid test case');
			}
			if (Object.keys(fields).length === 0) return err('No fields to update');

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

			let result;
			try {
				result = await db.transaction(async (tx) => {
					const [version] = await tx
						.insert(testCaseVersion)
						.values({
							testCaseId: tc.id,
							versionNo: prev.versionNo + 1,
							title: fields.title ?? prev.title,
							precondition:
								fields.precondition !== undefined ? fields.precondition : prev.precondition,
							steps: fields.steps ?? prev.steps,
							expectedResult:
								fields.expectedResult !== undefined ? fields.expectedResult : prev.expectedResult,
							priority: fields.priority ?? prev.priority,
							updatedBy: creator
						})
						.returning();
					if (!version) rollback('Failed to create test case version');

					await tx
						.update(testCase)
						.set({ latestVersionId: version.id })
						.where(and(eq(testCase.id, tc.id), eq(testCase.projectId, projectId)));

					return { ...tc, latestVersion: version };
				});
			} catch (error) {
				return toMcpTransactionError(error);
			}
			return ok(result);
		}
	);

	server.tool(
		'delete-test-case',
		'Delete a test case by ID or key',
		{
			id: mcpPositiveIdSchema.optional().describe('Test case ID'),
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

			await db
				.delete(testCase)
				.where(and(eq(testCase.id, tcId), eq(testCase.projectId, projectId)));
			return ok({ success: true, deletedId: tcId });
		}
	);

	server.tool(
		'clone-test-case',
		'Clone (duplicate) a test case with all its data',
		{
			id: mcpPositiveIdSchema.optional().describe('Test case ID'),
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
			const latestVersion = tc.latestVersion;

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [maxResult] = await db
				.select({ maxKey: sql<string>`max(key)`.as('max_key') })
				.from(testCase)
				.where(eq(testCase.projectId, projectId));
			const maxNum = maxResult?.maxKey ? parseInt(maxResult.maxKey.replace(/\D/g, ''), 10) : 0;
			const newKey = `TC-${String(maxNum + 1).padStart(4, '0')}`;

			let result;
			try {
				result = await db.transaction(async (tx) => {
					const [newTc] = await tx
						.insert(testCase)
						.values({
							projectId,
							key: newKey,
							groupId: tc.groupId,
							createdBy: creator
						})
						.returning();
					if (!newTc) rollback('Failed to create test case');

					const [newVer] = await tx
						.insert(testCaseVersion)
						.values({
							testCaseId: newTc.id,
							versionNo: 1,
							title: `${latestVersion.title} (copy)`,
							precondition: latestVersion.precondition,
							steps: latestVersion.steps,
							expectedResult: latestVersion.expectedResult,
							priority: latestVersion.priority,
							updatedBy: creator
						})
						.returning();
					if (!newVer) rollback('Failed to create test case version');

					await tx
						.update(testCase)
						.set({ latestVersionId: newVer.id })
						.where(and(eq(testCase.id, newTc.id), eq(testCase.projectId, projectId)));

					// Copy tags
					const tags = await tx.select().from(testCaseTag).where(eq(testCaseTag.testCaseId, tcId));
					if (tags.length > 0) {
						await tx
							.insert(testCaseTag)
							.values(tags.map((t) => ({ testCaseId: newTc.id, tagId: t.tagId })))
							.onConflictDoNothing();
					}

					return { ...newTc, key: newKey, title: newVer.title };
				});
			} catch (error) {
				return toMcpTransactionError(error);
			}
			return ok(result);
		}
	);

	server.tool(
		'get-test-case-versions',
		'Get version history of a test case',
		{
			id: mcpPositiveIdSchema.optional().describe('Test case ID'),
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
			testCaseId: mcpPositiveIdSchema.describe('Test case ID'),
			groupId: mcpPositiveIdSchema.nullable().describe('Target group ID (null to ungroup)')
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

			const [updated] = await db
				.update(testCase)
				.set({ groupId })
				.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)))
				.returning({ id: testCase.id });
			if (!updated) return err('Test case not found');

			return ok({ success: true, testCaseId, groupId });
		}
	);

	server.tool(
		'assign-test-case',
		'Assign a user to a test case',
		{
			testCaseId: mcpPositiveIdSchema.describe('Test case ID'),
			userId: z.string().describe('User ID to assign')
		},
		async ({ testCaseId, userId }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return err('Test case not found');

			const member = await db.query.projectMember.findFirst({
				where: and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId))
			});
			if (!member) return err('User is not a project member');

			await db.insert(testCaseAssignee).values({ testCaseId, userId }).onConflictDoNothing();
			return ok({ success: true, testCaseId, userId });
		}
	);

	server.tool(
		'unassign-test-case',
		'Remove a user assignment from a test case',
		{
			testCaseId: mcpPositiveIdSchema.describe('Test case ID'),
			userId: z.string().describe('User ID to unassign')
		},
		async ({ testCaseId, userId }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return err('Test case not found');

			const [deleted] = await db
				.delete(testCaseAssignee)
				.where(
					and(eq(testCaseAssignee.testCaseId, testCaseId), eq(testCaseAssignee.userId, userId))
				)
				.returning({ testCaseId: testCaseAssignee.testCaseId });

			return ok({ success: true, testCaseId, userId, removed: Boolean(deleted) });
		}
	);

	server.tool(
		'update-test-case-risk',
		'Set risk assessment for a test case',
		{
			testCaseId: mcpPositiveIdSchema.describe('Test case ID'),
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

			const [updated] = await db
				.update(testCase)
				.set({ riskImpact, riskLikelihood, riskLevel })
				.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)))
				.returning({ id: testCase.id });
			if (!updated) return err('Test case not found');

			return ok({ success: true, testCaseId, riskImpact, riskLikelihood, riskLevel });
		}
	);

	server.tool(
		'batch-create-test-cases',
		'Create multiple test cases at once with optional group, tags, and requirement links. Ideal for bulk creation from specs or planning docs.',
		{
			groupId: mcpPositiveIdSchema.optional().describe('Group ID to assign all created TCs to'),
			tagIds: mcpIdListSchema.optional().describe('Tag IDs to attach to all created TCs'),
			requirementId: mcpPositiveIdSchema
				.optional()
				.describe('Requirement ID to link all created TCs to'),
			testCases: z.array(mcpTestCaseCreateSchema).describe('Array of test cases to create')
		},
		async ({ groupId, tagIds, requirementId, testCases: tcList }) => {
			const testCaseFields = [];
			for (const [index, tc] of tcList.entries()) {
				const fields = validateTestCaseCreatePayload(tc);
				if (fields instanceof Response) {
					const body = (await fields.json().catch(() => null)) as { error?: string } | null;
					return err(`testCases[${index}]: ${body?.error ?? 'Invalid test case'}`);
				}
				testCaseFields.push(fields);
			}

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			if (tcList.length === 0) return err('testCases array is empty');
			if (tcList.length > 100) return err('Maximum 100 test cases per batch');

			// Validate group exists
			if (groupId) {
				const group = await db.query.testCaseGroup.findFirst({
					where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
				});
				if (!group) return err('Group not found');
			}

			// Validate tags exist
			if (tagIds && tagIds.length > 0) {
				const existingTags = await db
					.select({ id: tag.id })
					.from(tag)
					.where(and(eq(tag.projectId, projectId), inArray(tag.id, tagIds)));
				if (existingTags.length !== tagIds.length) return err('One or more tags not found');
			}

			const created: Array<{ id: number; key: string; title: string }> = [];

			// Get starting key number
			const [maxResult] = await db
				.select({ maxKey: sql<string>`max(key)`.as('max_key') })
				.from(testCase)
				.where(eq(testCase.projectId, projectId));
			let nextNum = maxResult?.maxKey ? parseInt(maxResult.maxKey.replace(/^TC-/, ''), 10) + 1 : 1;
			if (isNaN(nextNum)) nextNum = 1;

			try {
				for (const tc of testCaseFields) {
					const key = `TC-${String(nextNum++).padStart(4, '0')}`;

					const result = await db.transaction(async (tx) => {
						const [newTc] = await tx
							.insert(testCase)
							.values({ projectId, key, groupId: groupId ?? null, createdBy: creator })
							.returning();
						if (!newTc) rollback('Failed to create test case');

						const [newVer] = await tx
							.insert(testCaseVersion)
							.values({
								testCaseId: newTc.id,
								versionNo: 1,
								title: tc.title,
								precondition: tc.precondition,
								steps: tc.steps,
								expectedResult: tc.expectedResult,
								priority: tc.priority,
								updatedBy: creator
							})
							.returning();
						if (!newVer) rollback('Failed to create test case version');

						await tx
							.update(testCase)
							.set({ latestVersionId: newVer.id })
							.where(and(eq(testCase.id, newTc.id), eq(testCase.projectId, projectId)));

						// Tags
						if (tagIds && tagIds.length > 0) {
							await tx
								.insert(testCaseTag)
								.values(tagIds.map((tagId) => ({ testCaseId: newTc.id, tagId })))
								.onConflictDoNothing();
						}

						return { id: newTc.id, key, title: newVer.title };
					});

					created.push(result);
				}
			} catch (error) {
				return toMcpTransactionError(error);
			}

			// Link to requirement (outside transaction since it's optional)
			if (requirementId && created.length > 0) {
				const { requirementTestCase } = await import('$lib/server/db/schema');
				await db
					.insert(requirementTestCase)
					.values(created.map((tc) => ({ requirementId, testCaseId: tc.id })))
					.onConflictDoNothing();
			}

			return ok({ createdCount: created.length, testCases: created });
		}
	);
}
