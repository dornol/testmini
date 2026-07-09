import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
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
	testCase: {
		id: 'id',
		projectId: 'project_id',
		key: 'key',
		automationKey: 'automation_key',
		latestVersionId: 'latest_version_id'
	},
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id',
		versionNo: 'version_no',
		title: 'title',
		priority: 'priority',
		updatedBy: 'updated_by',
		createdAt: 'created_at'
	},
	user: { id: 'id', name: 'name', image: 'image' },
	tag: { id: 'id', name: 'name', color: 'color', projectId: 'project_id' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' },
	testCaseAssignee: { testCaseId: 'test_case_id', userId: 'user_id' },
	projectMember: { projectId: 'project_id', userId: 'user_id' },
	customField: { projectId: 'project_id', name: 'name' }
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
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
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

		it('should return 400 when body is not an object', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: ['not-valid'],
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 400 for unknown fields before loading test case', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'Updated', priority: 'HIGH', revision: 1, status: 'DRAFT' },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toContain('Unknown field(s): status');
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 400 when revision is not an integer', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'Updated', priority: 'HIGH', revision: '1' },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 400 when steps is not an array', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'Updated', priority: 'HIGH', revision: 1, steps: { action: 'x' } },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 400 when a step action is missing', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'Updated', priority: 'HIGH', revision: 1, steps: [{ expected: 'x' }] },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 400 when a step has unknown fields', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: {
					title: 'Updated',
					priority: 'HIGH',
					revision: 1,
					steps: [{ action: 'Click login', expected: 'Redirected', id: 'client-only' }]
				},
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toContain('steps[0] has unknown field(s): id');
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 400 when stepFormat is invalid', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { title: 'Updated', priority: 'HIGH', revision: 1, stepFormat: 'HTML' },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should accept custom priority values', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
			mockFindTC.mockResolvedValue(tc);
			mockDb.transaction.mockImplementation(async (fn) => {
				const newVersion = { ...sampleTestCaseVersion, id: 101, versionNo: 2, priority: 'EXTREME' };
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
				body: { title: 'Valid Title', priority: 'EXTREME', revision: 1 },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(200);
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
				returning: vi.fn().mockResolvedValue([{ id: 10 }])
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
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 10],
					['project_id', 1]
				])
			);
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

		it('should return 400 when patch body is not an object', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: 'invalid',
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 400 when title is not a string', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { title: 123 },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 400 for unknown patch fields before loading test case', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { title: 'Update', revision: 1 },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toContain('Unknown field(s): revision');
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 400 when automationKey is not a string or null', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { automationKey: { value: 'AK-1' } },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 400 when customFields is not an object', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { customFields: ['bad'] },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect(mockFindTC).not.toHaveBeenCalled();
		});

		it('should return 409 when key already exists in project', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
			// findTestCaseWithLatestVersion returns the test case, findFirst returns a conflicting one
			mockFindTC.mockResolvedValue(tc);
			mockDb.query.testCase.findFirst.mockResolvedValueOnce({
				...sampleTestCase,
				id: 999,
				key: 'TC-DUPE'
			});

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
				returning: vi.fn().mockResolvedValue([{ id: 10 }])
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

		it('should return 404 when direct test case update finds no row', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
			mockFindTC.mockResolvedValue(tc);
			mockDb.query.testCase.findFirst.mockResolvedValueOnce(undefined);
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([])
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { key: 'TC-NEW' },
				user: adminUser
			});

			await expect(PATCH(event)).rejects.toMatchObject({ status: 404 });
			expect(updateChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});
	});

	describe('PUT mutation verification', () => {
		it('should return 404 when latest version pointer update finds no row', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
			mockFindTC.mockResolvedValue(tc);
			const newVersion = { ...sampleTestCaseVersion, id: 101, versionNo: 2 };
			const insertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([newVersion])
			};
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([])
			};
			const tx = {
				insert: vi.fn().mockReturnValue(insertChain),
				update: vi.fn().mockReturnValue(updateChain)
			};
			mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx));

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

			await expect(PUT(event)).rejects.toMatchObject({ status: 404 });
			expect(updateChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});
	});

	describe('DELETE', () => {
		it('should require PROJECT_ADMIN', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: 10 }])
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
				returning: vi.fn().mockResolvedValue([{ id: 10 }])
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
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 10],
					['project_id', 1]
				])
			);
		});

		it('should return 404 when delete finds no row after preflight lookup', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([])
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});

			await expect(DELETE(event)).rejects.toMatchObject({ status: 404 });
			expect(deleteChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});
	});
});
