import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser, sampleTestCase, sampleTestCaseVersion } from '$lib/server/test-helpers/fixtures';

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
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { PATCH, PUT, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', testCaseId: '10' };

describe('/api/projects/[projectId]/test-cases/[testCaseId] — PATCH, PUT & DELETE', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('PUT', () => {
		it('should update test case and create new version', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
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
					precondition: 'User is logged in',
					steps: [{ action: 'Click login', expected: 'Redirected' }],
					expectedResult: 'Dashboard shown',
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

		it('should return 403 for VIEWER (requireProjectRole rejects)', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'Updated', priority: 'HIGH', revision: 1 },
				user: testUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 400 when title is empty', async () => {
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
				body: { title: 'Valid Title', priority: 'EXTREME', revision: 1 },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
		});

		it('should return 409 on revision conflict', async () => {
			const tc = {
				...sampleTestCase,
				latestVersion: { ...sampleTestCaseVersion, revision: 99 }
			};
			mockFindTC.mockResolvedValue(tc);

			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'New Title', priority: 'MEDIUM', revision: 1 },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toContain('modified by another user');
		});
	});

	describe('PATCH', () => {
		it('should update test case title and create new version', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
			mockFindTC.mockResolvedValue(tc);

			const newVersion = { ...sampleTestCaseVersion, id: 101, versionNo: 2 };
			mockInsertReturning(mockDb, [newVersion]);

			// Also mock the update for latestVersionId
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { title: 'Quick Title Update' },
				user: adminUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should return 403 for VIEWER (requireProjectRole rejects)', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { title: 'Update' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when test case not found', async () => {
			mockFindTC.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { title: 'Update' },
				user: adminUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 400 when key is empty string', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
			mockFindTC.mockResolvedValue(tc);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { key: '   ' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toContain('Key cannot be empty');
		});

		it('should return 409 when key already exists in project', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
			// findTestCaseWithLatestVersion returns the test case, findFirst returns a conflicting one
			mockFindTC.mockResolvedValue(tc);
			mockDb.query.testCase.findFirst
				.mockResolvedValueOnce({ ...sampleTestCase, id: 999, key: 'TC-DUPE' });

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { key: 'TC-DUPE' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toContain('Key already exists');
		});

		it('should update priority and create new version', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
			mockFindTC.mockResolvedValue(tc);

			const newVersion = { ...sampleTestCaseVersion, id: 102, versionNo: 2, priority: 'CRITICAL' };
			mockInsertReturning(mockDb, [newVersion]);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { priority: 'CRITICAL' },
				user: adminUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});
	});

	describe('DELETE', () => {
		it('should require PROJECT_ADMIN', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should return 403 for non-admin roles', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should delete test case on success', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});
	});
});
