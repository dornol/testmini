import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockSelectResult,
	mockInsertReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { sampleProject, sampleTestCase } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id', key: 'key', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', title: 'title' },
	requirement: {
		id: 'id',
		projectId: 'project_id',
		externalId: 'external_id',
		title: 'title',
		description: 'description',
		source: 'source',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	requirementTestCase: {
		id: 'id',
		requirementId: 'requirement_id',
		testCaseId: 'test_case_id',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
		{ raw: (s: string) => s }
	),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerRequirementTools } = await import('./requirements');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerRequirementTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleRequirement = {
	id: 1,
	projectId: 1,
	externalId: 'REQ-001',
	title: 'User Authentication',
	description: 'Users must be able to log in',
	source: 'JIRA',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('MCP requirement tools', () => {
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

	// ── create-requirement ───────────────────────────────

	describe('create-requirement', () => {
		it('should create a requirement', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			const insertChain = mockInsertReturning(mockDb, [sampleRequirement]);

			const result = await client.callTool({
				name: 'create-requirement',
				arguments: { title: ' User Authentication ', externalId: ' REQ-001 ', source: ' JIRA ' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.title).toBe('User Authentication');
			expect(parsed.externalId).toBe('REQ-001');
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'User Authentication',
					externalId: 'REQ-001',
					source: 'JIRA'
				})
			);
		});

		it('should reject empty titles before creating a requirement', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const result = await client.callTool({
				name: 'create-requirement',
				arguments: { title: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Title is required'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return error when requirement insert returns no row', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, []);

			const result = await client.callTool({
				name: 'create-requirement',
				arguments: { title: 'User Authentication' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Failed to create requirement'
			);
		});

		it('should reject long fields before creating a requirement', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const result = await client.callTool({
				name: 'create-requirement',
				arguments: { title: 'A'.repeat(256) }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Title must be 255 characters or less'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-requirement',
				arguments: { title: 'Req' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Project not found'
			);
		});
	});

	// ── link-requirement-test-case ───────────────────────

	describe('link-requirement-test-case', () => {
		it('should link requirement to test case', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockInsertReturning(mockDb, [{ id: 1 }]);

			const result = await client.callTool({
				name: 'link-requirement-test-case',
				arguments: { requirementId: 1, testCaseId: 10 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.requirementId).toBe(1);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.linked).toBe(true);
		});

		it('should report linked false when requirement link already exists', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockInsertReturning(mockDb, []);

			const result = await client.callTool({
				name: 'link-requirement-test-case',
				arguments: { requirementId: 1, testCaseId: 10 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.requirementId).toBe(1);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.linked).toBe(false);
		});

		it('should return error when requirement not found', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'link-requirement-test-case',
				arguments: { requirementId: 999, testCaseId: 10 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Requirement not found'
			);
		});

		it('should return error when test case not found', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'link-requirement-test-case',
				arguments: { requirementId: 1, testCaseId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
		});
	});

	// ── get-traceability-matrix ──────────────────────────

	describe('get-traceability-matrix', () => {
		it('should return matrix with coverage summary', async () => {
			let selectCallCount = 0;
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				const data =
					selectCallCount === 1
						? [
								{ id: 1, externalId: 'REQ-001', title: 'Auth', description: null, source: 'JIRA' },
								{ id: 2, externalId: 'REQ-002', title: 'Reports', description: null, source: null }
							]
						: [
								{ requirementId: 1, testCaseId: 10, testCaseKey: 'TC-0001', testCaseTitle: 'Login' }
							];
				const chain = {
					from: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve)
				};
				return chain as never;
			});

			const result = await client.callTool({
				name: 'get-traceability-matrix',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.summary.totalRequirements).toBe(2);
			expect(parsed.summary.coveredRequirements).toBe(1);
			expect(parsed.summary.uncoveredRequirements).toBe(1);
			expect(parsed.summary.coveragePercent).toBe(50);
			expect(parsed.matrix[0].covered).toBe(true);
			expect(parsed.matrix[0].testCases).toHaveLength(1);
			expect(parsed.matrix[1].covered).toBe(false);
		});

		it('should return 0% coverage when no requirements exist', async () => {
			let selectCallCount = 0;
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				const chain = {
					from: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve)
				};
				return chain as never;
			});

			const result = await client.callTool({
				name: 'get-traceability-matrix',
				arguments: {}
			});

			const parsed = parseResult(result);
			expect(parsed.summary.totalRequirements).toBe(0);
			expect(parsed.summary.coveragePercent).toBe(0);
		});
	});

	// ── update-requirement ──────────────────────────────

	describe('update-requirement', () => {
		it('should update title', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			const updateChain = mockUpdateReturning(mockDb, [
				{ ...sampleRequirement, title: 'Updated Title' }
			]);

			const result = await client.callTool({
				name: 'update-requirement',
				arguments: { requirementId: 1, title: ' Updated Title ', description: '   ' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.title).toBe('Updated Title');
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['project_id', 1]
				])
			);
			expect(updateChain.set).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'Updated Title',
					description: null
				})
			);
		});

		it('should reject empty titles before updating a requirement', async () => {
			const result = await client.callTool({
				name: 'update-requirement',
				arguments: { requirementId: 1, title: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Title is required'
			);
			expect(mockDb.query.requirement.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject empty updates', async () => {
			const result = await client.callTool({
				name: 'update-requirement',
				arguments: { requirementId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'No fields to update'
			);
			expect(mockDb.query.requirement.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject long source before updating a requirement', async () => {
			const result = await client.callTool({
				name: 'update-requirement',
				arguments: { requirementId: 1, source: 'A'.repeat(256) }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Source must be 255 characters or less'
			);
			expect(mockDb.query.requirement.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return error when not found', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-requirement',
				arguments: { requirementId: 999, title: 'Nope' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Requirement not found'
			);
		});

		it('should return error when requirement disappears before update', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockUpdateReturning(mockDb, []);

			const result = await client.callTool({
				name: 'update-requirement',
				arguments: { requirementId: 1, title: 'Updated Title' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Requirement not found'
			);
		});

		it('should reject unsafe IDs before linking', async () => {
			const result = await client.callTool({
				name: 'link-requirement-test-case',
				arguments: { requirementId: Number.MAX_SAFE_INTEGER + 1, testCaseId: 10 }
			});

			expect(result.isError).toBe(true);
			expect(mockDb.query.requirement.findFirst).not.toHaveBeenCalled();
			expect(mockDb.query.testCase.findFirst).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});

	// ── delete-requirement ──────────────────────────────

	describe('delete-requirement', () => {
		it('should delete requirement and its links', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockDeleteReturning(mockDb, [{ id: 1 }]);

			const result = await client.callTool({
				name: 'delete-requirement',
				arguments: { requirementId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			expect(mockDb.delete).toHaveBeenCalledTimes(2);
			const linkDeleteChain = mockDb.delete.mock.results[0]?.value as {
				where: ReturnType<typeof vi.fn>;
			};
			expect(linkDeleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([['requirement_id', 1], expect.objectContaining({ values: [1, 1] })])
			);
			const requirementDeleteChain = mockDb.delete.mock.results[1]?.value as {
				where: ReturnType<typeof vi.fn>;
			};
			expect(requirementDeleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['project_id', 1]
				])
			);
		});

		it('should return error when not found', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-requirement',
				arguments: { requirementId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Requirement not found'
			);
		});

		it('should return error when requirement disappears before delete', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockDeleteReturning(mockDb, []);

			const result = await client.callTool({
				name: 'delete-requirement',
				arguments: { requirementId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Requirement not found'
			);
		});
	});

	// ── unlink-requirement-test-case ────────────────────

	describe('unlink-requirement-test-case', () => {
		it('should unlink requirement from test case', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			const deleteChain = mockDeleteReturning(mockDb, [{ id: 1 }]);

			const result = await client.callTool({
				name: 'unlink-requirement-test-case',
				arguments: { requirementId: 1, testCaseId: 10 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.requirementId).toBe(1);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.unlinked).toBe(true);
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['requirement_id', 1],
					['test_case_id', 10],
					expect.objectContaining({ values: [1, 1] })
				])
			);
		});

		it('should report unlinked false when requirement link does not exist', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDeleteReturning(mockDb, []);

			const result = await client.callTool({
				name: 'unlink-requirement-test-case',
				arguments: { requirementId: 1, testCaseId: 10 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.unlinked).toBe(false);
		});

		it('should reject unlink when requirement is not in the current project', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'unlink-requirement-test-case',
				arguments: { requirementId: 999, testCaseId: 10 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Requirement not found'
			);
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should reject unlink when test case is not in the current project', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'unlink-requirement-test-case',
				arguments: { requirementId: 1, testCaseId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});
});
