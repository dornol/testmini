import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createMockDb,
	mockSelectResult,
	mockInsertReturning
} from '$lib/server/test-helpers/mock-db';
import {
	sampleProject,
	sampleTestCase,
	sampleTestCaseVersion
} from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockFindTestCaseWithLatestVersion = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: mockDb,
	findTestCaseWithLatestVersion: mockFindTestCaseWithLatestVersion
}));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: {
		id: 'id',
		projectId: 'project_id',
		key: 'key',
		latestVersionId: 'latest_version_id',
		sortOrder: 'sort_order',
		groupId: 'group_id',
		createdBy: 'created_by',
		riskImpact: 'risk_impact',
		riskLikelihood: 'risk_likelihood',
		riskLevel: 'risk_level'
	},
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id',
		title: 'title',
		priority: 'priority',
		versionNo: 'version_no',
		precondition: 'precondition',
		steps: 'steps',
		expectedResult: 'expected_result',
		updatedBy: 'updated_by'
	},
	tag: { id: 'id', projectId: 'project_id', name: 'name', color: 'color' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' },
	testCaseAssignee: { testCaseId: 'test_case_id', userId: 'user_id' },
	testCaseGroup: { id: 'id', projectId: 'project_id' },
	projectMember: { projectId: 'project_id', userId: 'user_id', role: 'role' },
	requirementTestCase: { requirementId: 'requirement_id', testCaseId: 'test_case_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			strings,
			values,
			as: () => 'sql_alias'
		}),
		{ raw: (s: string) => s }
	),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerTestCaseTools } = await import('./test-cases');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerTestCaseTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

describe('MCP test-case tools', () => {
	let client: Client;
	let close: () => Promise<void>;

	beforeEach(async () => {
		vi.clearAllMocks();
		const c = await createClient();
		client = c.client;
		close = c.close;
	});

	afterEach(async () => {
		await close();
	});

	// ── search-test-cases ────────────────────────────────

	describe('list-test-cases', () => {
		it('should reject invalid limits before querying', async () => {
			const result = await client.callTool({
				name: 'list-test-cases',
				arguments: { limit: 0 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should reject invalid group IDs before querying', async () => {
			const result = await client.callTool({
				name: 'list-test-cases',
				arguments: { groupId: -1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.select).not.toHaveBeenCalled();
		});
	});

	// ── search-test-cases ────────────────────────────────

	describe('search-test-cases', () => {
		it('should return matching test cases', async () => {
			mockSelectResult(mockDb, [{ id: 10, key: 'TC-0001', title: 'Login test', priority: 'HIGH' }]);

			const result = await client.callTool({
				name: 'search-test-cases',
				arguments: { query: 'login' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].key).toBe('TC-0001');
		});

		it('should return empty array for no matches', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'search-test-cases',
				arguments: { query: 'xyz' }
			});

			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});

		it('should respect limit parameter', async () => {
			mockSelectResult(mockDb, []);

			await client.callTool({ name: 'search-test-cases', arguments: { query: 'test', limit: 5 } });

			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should reject invalid limits before querying', async () => {
			const result = await client.callTool({
				name: 'search-test-cases',
				arguments: { query: 'test', limit: 0 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.select).not.toHaveBeenCalled();
		});
	});

	// ── get-test-case ────────────────────────────────────

	describe('get-test-case', () => {
		it('should return test case by ID with tags', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			});
			mockSelectResult(mockDb, [{ name: 'smoke', color: '#ff0000' }]);

			const result = await client.callTool({ name: 'get-test-case', arguments: { id: 10 } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.key).toBe('TC-0001');
			expect(parsed.tags).toHaveLength(1);
			expect(parsed.tags[0].name).toBe('smoke');
		});

		it('should return test case by key', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			});
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'get-test-case',
				arguments: { key: 'TC-0001' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.key).toBe('TC-0001');
		});

		it('should return error when not found', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-test-case', arguments: { id: 999 } });

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
		});

		it('should reject invalid IDs before lookup', async () => {
			const result = await client.callTool({ name: 'get-test-case', arguments: { id: -1 } });

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockFindTestCaseWithLatestVersion).not.toHaveBeenCalled();
			expect(mockDb.query.testCase.findFirst).not.toHaveBeenCalled();
		});
	});

	// ── create-test-case ─────────────────────────────────

	describe('create-test-case', () => {
		it('should create test case with generated key', async () => {
			mockSelectResult(mockDb, [{ maxKey: 'TC-0003' }]);
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const createdTc = { id: 14, projectId: 1, key: 'TC-0004', createdBy: 'user-1', sortOrder: 4 };
			const createdVersion = {
				id: 140,
				testCaseId: 14,
				versionNo: 1,
				title: 'New test',
				priority: 'MEDIUM'
			};
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
			};

			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCallCount = 0;
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						return {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) =>
								Promise.resolve(insertCallCount === 1 ? [createdTc] : [createdVersion]).then(
									resolve
								)
						};
					}),
					update: vi.fn().mockReturnValue(txUpdateChain)
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'create-test-case',
				arguments: { title: 'New test' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.key).toBe('TC-0004');
			expect(parsed.latestVersion.title).toBe('New test');
			expect(txUpdateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', createdTc.id],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should reject blank titles before querying for the next key', async () => {
			const result = await client.callTool({
				name: 'create-test-case',
				arguments: { title: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Title cannot be empty'
			);
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should reject blank step actions before querying for the next key', async () => {
			const result = await client.callTool({
				name: 'create-test-case',
				arguments: { title: 'New test', steps: [{ action: '   ', expected: 'Expected' }] }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'steps[0].action cannot be empty'
			);
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return error when project not found', async () => {
			mockSelectResult(mockDb, [{ maxKey: null }]);
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-test-case',
				arguments: { title: 'Test' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Project not found'
			);
		});
	});

	// ── update-test-case ─────────────────────────────────

	describe('update-test-case', () => {
		it('should create new version when updating', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			});
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const updatedVersion = { ...sampleTestCaseVersion, id: 101, versionNo: 2, title: 'Updated' };
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
			};
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const tx = {
					insert: vi.fn().mockImplementation(() => ({
						values: vi.fn().mockReturnThis(),
						returning: vi.fn().mockReturnThis(),
						then: (resolve: (v: unknown) => void) => Promise.resolve([updatedVersion]).then(resolve)
					})),
					update: vi.fn().mockReturnValue(txUpdateChain)
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'update-test-case',
				arguments: { id: 10, title: 'Updated' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.latestVersion.title).toBe('Updated');
			expect(parsed.latestVersion.versionNo).toBe(2);
			expect(txUpdateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', sampleTestCase.id],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should reject empty updates before loading the test case', async () => {
			const result = await client.callTool({
				name: 'update-test-case',
				arguments: { id: 10 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'No fields to update'
			);
			expect(mockFindTestCaseWithLatestVersion).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should reject blank update titles before loading the test case', async () => {
			const result = await client.callTool({
				name: 'update-test-case',
				arguments: { id: 10, title: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Title cannot be empty'
			);
			expect(mockFindTestCaseWithLatestVersion).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return error when test case not found', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-test-case',
				arguments: { id: 999, title: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
		});
	});

	// ── delete-test-case ─────────────────────────────────

	describe('delete-test-case', () => {
		it('should delete test case by ID', async () => {
			const result = await client.callTool({
				name: 'delete-test-case',
				arguments: { id: 10 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(10);
		});

		it('should delete test case by key', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({ id: 10 });

			const result = await client.callTool({
				name: 'delete-test-case',
				arguments: { key: 'TC-0001' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(10);
		});

		it('should return error when not found by key', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-test-case',
				arguments: { key: 'TC-9999' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
		});
	});

	// ── batch-create-test-cases ─────────────────────────────

	describe('batch-create-test-cases', () => {
		it('should create multiple test cases with groupId and tagIds', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue({ id: 5, projectId: 1 });

			// Tag validation select
			mockSelectResult(mockDb, [{ id: 1 }, { id: 2 }]);

			let txCallCount = 0;
			const txUpdateChains: Array<{ where: ReturnType<typeof vi.fn> }> = [];
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				txCallCount++;
				let insertCallCount = 0;
				const txUpdateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
				};
				txUpdateChains.push(txUpdateChain);
				const txInsertChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockReturnThis(),
					onConflictDoNothing: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
				};
				const currentNum = txCallCount;
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						const callNum = insertCallCount;
						return {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							onConflictDoNothing: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) => {
								if (callNum === 1) {
									return Promise.resolve([
										{
											id: 100 + currentNum,
											projectId: 1,
											key: `TC-000${currentNum}`,
											createdBy: 'user-1'
										}
									]).then(resolve);
								} else if (callNum === 2) {
									return Promise.resolve([
										{
											id: 200 + currentNum,
											testCaseId: 100 + currentNum,
											versionNo: 1,
											title: `Test ${currentNum}`
										}
									]).then(resolve);
								}
								return Promise.resolve(undefined).then(resolve);
							}
						};
					}),
					update: vi.fn().mockReturnValue(txUpdateChain),
					select: vi.fn().mockReturnValue(txInsertChain)
				};
				return fn(tx);
			});

			// maxKey select (for starting key number) — already set via mockSelectResult above,
			// but the first call is for tag validation, then maxKey. Re-mock for the second call:
			// Actually the tag validation select happens first, then maxKey select.
			// Both use db.select() so we need the mock to return different values.
			// Let's chain: first call returns tags, second returns maxKey.
			let selectCallCount = 0;
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				if (selectCallCount === 1) {
					// tag validation
					return {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						then: (resolve: (v: unknown) => void) =>
							Promise.resolve([{ id: 1 }, { id: 2 }]).then(resolve)
					} as unknown as ReturnType<typeof mockDb.select>;
				}
				// maxKey query
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) =>
						Promise.resolve([{ maxKey: 'TC-0000' }]).then(resolve)
				} as unknown as ReturnType<typeof mockDb.select>;
			});

			// requirementTestCase insert (for linking)
			const insertChainForReq = {
				values: vi.fn().mockReturnThis(),
				onConflictDoNothing: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
			};
			mockDb.insert.mockReturnValue(
				insertChainForReq as unknown as ReturnType<typeof mockDb.insert>
			);

			const result = await client.callTool({
				name: 'batch-create-test-cases',
				arguments: {
					groupId: 5,
					tagIds: [1, 2],
					requirementId: 10,
					testCases: [{ title: 'Test 1', priority: 'HIGH' }, { title: 'Test 2' }]
				}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.createdCount).toBe(2);
			expect(parsed.testCases).toHaveLength(2);
			expect(txUpdateChains[0].where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 101],
					['project_id', PROJECT_ID]
				])
			);
			expect(txUpdateChains[1].where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 102],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should return error for empty array', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const result = await client.callTool({
				name: 'batch-create-test-cases',
				arguments: { testCases: [] }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'testCases array is empty'
			);
		});

		it('should reject invalid test cases before project lookup', async () => {
			const result = await client.callTool({
				name: 'batch-create-test-cases',
				arguments: { testCases: [{ title: 'Valid' }, { title: '   ' }] }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'testCases[1]: Title cannot be empty'
			);
			expect(mockDb.query.project.findFirst).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return error when group not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'batch-create-test-cases',
				arguments: {
					groupId: 999,
					testCases: [{ title: 'Test 1' }]
				}
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Group not found'
			);
		});
	});

	// ── move-test-case-to-group ─────────────────────────────

	describe('move-test-case-to-group', () => {
		it('should move test case to a group', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue({ id: 5, projectId: 1 });

			const result = await client.callTool({
				name: 'move-test-case-to-group',
				arguments: { testCaseId: 10, groupId: 5 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.groupId).toBe(5);
			expect(mockDb._chains.update.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 10],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should return error when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'move-test-case-to-group',
				arguments: { testCaseId: 999, groupId: 5 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
		});

		it('should ungroup test case when groupId is null', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({ ...sampleTestCase, groupId: 5 });

			const result = await client.callTool({
				name: 'move-test-case-to-group',
				arguments: { testCaseId: 10, groupId: null }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.groupId).toBeNull();
		});
	});

	// ── assign-test-case ────────────────────────────────────

	describe('assign-test-case', () => {
		it('should assign a user to a test case', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.projectMember.findFirst.mockResolvedValue({
				projectId: 1,
				userId: 'user-1',
				role: 'QA'
			});

			const result = await client.callTool({
				name: 'assign-test-case',
				arguments: { testCaseId: 10, userId: 'user-1' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.userId).toBe('user-1');
			expect(mockDb.insert).toHaveBeenCalled();
		});

		it('should reject assignment when user is not a project member', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.projectMember.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'assign-test-case',
				arguments: { testCaseId: 10, userId: 'external-user' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'User is not a project member'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject assignment when test case is outside the project', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'assign-test-case',
				arguments: { testCaseId: 999, userId: 'user-1' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
			expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});

	// ── unassign-test-case ──────────────────────────────────

	describe('unassign-test-case', () => {
		it('should remove a user assignment from a test case', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);

			const result = await client.callTool({
				name: 'unassign-test-case',
				arguments: { testCaseId: 10, userId: 'user-1' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.userId).toBe('user-1');
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it('should return error when unassign target test case is outside the project', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'unassign-test-case',
				arguments: { testCaseId: 999, userId: 'user-1' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});

	// ── update-test-case-risk ───────────────────────────────

	describe('update-test-case-risk', () => {
		it('should set HIGH/HIGH to CRITICAL risk level', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);

			const result = await client.callTool({
				name: 'update-test-case-risk',
				arguments: { testCaseId: 10, riskImpact: 'HIGH', riskLikelihood: 'HIGH' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.riskLevel).toBe('CRITICAL');
			expect(parsed.riskImpact).toBe('HIGH');
			expect(parsed.riskLikelihood).toBe('HIGH');
			expect(mockDb.update).toHaveBeenCalled();
			expect(mockDb._chains.update.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 10],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should return error when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-test-case-risk',
				arguments: { testCaseId: 999, riskImpact: 'HIGH', riskLikelihood: 'HIGH' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
		});
	});
});
