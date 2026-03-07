import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import {
	testUser,
	adminUser,
	sampleTestCase,
	sampleTestCaseVersion
} from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockFindTC = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, findTestCaseWithLatestVersion: mockFindTC }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', key: 'key', latestVersionId: 'latest_version_id' },
	testCaseVersion: {
		id: 'id', testCaseId: 'test_case_id', versionNo: 'version_no',
		title: 'title', priority: 'priority', updatedBy: 'updated_by', createdAt: 'created_at'
	},
	user: { id: 'id', name: 'name', image: 'image' },
	tag: { id: 'id', name: 'name', color: 'color', projectId: 'project_id' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' },
	testCaseAssignee: { testCaseId: 'test_case_id', userId: 'user_id' },
	projectMember: { projectId: 'project_id', userId: 'user_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	desc: vi.fn((a: unknown) => ['desc', a]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, PUT, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', testCaseId: '10' };

describe('/api/projects/[projectId]/test-cases/[testCaseId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when test case not found', async () => {
			mockFindTC.mockResolvedValue(null);
			const event = createMockEvent({ params: PARAMS, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return test case with versions and tags', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
			mockFindTC.mockResolvedValue(tc);

			// 4 parallel queries: assignedTags, projectTags, assignedAssignees, projectMembers
			const selectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			};
			mockDb.select.mockReturnValue(selectChain as never);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.testCase.id).toBe(sampleTestCase.id);
			expect(body.testCase.key).toBe(sampleTestCase.key);
		});
	});

	describe('PUT', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'Updated', priority: 'HIGH', revision: 1 },
				user: null
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 400 when title is missing', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: '', priority: 'HIGH', revision: 1 },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 for invalid priority', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'Valid', priority: 'INVALID', revision: 1 },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
		});

		it('should return 404 when test case not found', async () => {
			mockFindTC.mockResolvedValue(null);
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'Updated', priority: 'HIGH', revision: 1 },
				user: adminUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 409 on revision conflict', async () => {
			const tc = {
				...sampleTestCase,
				latestVersion: { ...sampleTestCaseVersion, revision: 5 }
			};
			mockFindTC.mockResolvedValue(tc);

			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'Updated', priority: 'HIGH', revision: 1 },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toContain('modified by another user');
		});

		it('should create new version on success', async () => {
			const tc = {
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			};
			mockFindTC.mockResolvedValue(tc);
			mockDb.transaction.mockImplementation(async (fn) => {
				const newVersion = { ...sampleTestCaseVersion, id: 101, versionNo: 2 };
				const txChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockResolvedValue([newVersion]),
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: undefined as unknown
				};
				txChain.then = (r: (v: unknown) => void) => Promise.resolve([newVersion]).then(r);
				const tx = {
					insert: vi.fn().mockReturnValue(txChain),
					update: vi.fn().mockReturnValue(txChain)
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: {
					title: 'Updated Title',
					precondition: '',
					steps: [{ action: 'Step 1', expected: 'Result 1' }],
					expectedResult: 'Pass',
					priority: 'HIGH',
					revision: 1
				},
				user: adminUser
			});
			const response = await PUT(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 403 when lacking PROJECT_ADMIN role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403 })
			);
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: adminUser });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should delete test case on success', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: adminUser });
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});
	});
});
