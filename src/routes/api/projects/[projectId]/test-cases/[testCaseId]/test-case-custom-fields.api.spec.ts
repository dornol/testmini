import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser, sampleTestCase, sampleTestCaseVersion } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockFindTestCase = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, findTestCaseWithLatestVersion: mockFindTestCase }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', key: 'key', automationKey: 'automation_key', latestVersionId: 'latest_version_id' },
	testCaseVersion: {
		id: 'id', testCaseId: 'test_case_id', versionNo: 'version_no',
		title: 'title', priority: 'priority', customFields: 'custom_fields',
		revision: 'revision', updatedBy: 'updated_by', createdAt: 'created_at'
	},
	user: { id: 'id', name: 'name', image: 'image' },
	tag: { id: 'id', name: 'name', color: 'color', projectId: 'project_id' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' },
	testCaseAssignee: { testCaseId: 'test_case_id', userId: 'user_id' },
	projectMember: { projectId: 'project_id', userId: 'user_id' },
	customField: { name: 'name', projectId: 'project_id' }
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
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});
vi.mock('$lib/server/queries', () => ({
	loadTestCaseMetadata: vi.fn().mockResolvedValue({ assignedTags: [], projectTags: [], assignedAssignees: [], projectMembers: [] })
}));
vi.mock('$lib/server/errors', () => ({
	badRequest: vi.fn((msg: string) => new Response(JSON.stringify({ error: msg }), { status: 400 })),
	conflict: vi.fn((msg: string) => new Response(JSON.stringify({ error: msg }), { status: 409 }))
}));

const { PATCH } = await import('./+server');

const PARAMS = { projectId: '1', testCaseId: '10' };

function makeTcWithVersion(customFields: Record<string, unknown> | null = { '1': 'existing_value', '2': 42 }) {
	return {
		...sampleTestCase,
		automationKey: null,
		approvalStatus: 'DRAFT',
		latestVersion: {
			...sampleTestCaseVersion,
			stepFormat: 'STEPS',
			expectedResult: null,
			customFields
		}
	};
}

function mockUpdateChain() {
	const updateChain = {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
	};
	mockDb.update.mockReturnValue(updateChain as never);
	return updateChain;
}

describe('/api/projects/[projectId]/test-cases/[testCaseId] — PATCH customFields', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Mock allowed custom field names for the project
		mockSelectResult(mockDb, [{ name: '1' }, { name: '2' }, { name: '3' }]);
	});

	it('should create new version with merged custom fields', async () => {
		const tc = makeTcWithVersion({ '1': 'existing_value', '2': 42 });
		mockFindTestCase.mockResolvedValue(tc);

		const insertChain = mockInsertReturning(mockDb, [{ id: 101 }]);
		mockUpdateChain();

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { customFields: { '3': 'new_value' } },
			user: adminUser
		});
		const response = await PATCH(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);

		// Verify the insert was called with merged custom fields
		const valuesCall = insertChain.values as ReturnType<typeof vi.fn>;
		expect(valuesCall).toHaveBeenCalledWith(
			expect.objectContaining({
				customFields: { '1': 'existing_value', '2': 42, '3': 'new_value' }
			})
		);
	});

	it('should remove null entries during merge', async () => {
		const tc = makeTcWithVersion({ '1': 'existing_value', '2': 42, '3': 'to_remove' });
		mockFindTestCase.mockResolvedValue(tc);

		const insertChain = mockInsertReturning(mockDb, [{ id: 101 }]);
		mockUpdateChain();

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { customFields: { '3': null } },
			user: adminUser
		});
		const response = await PATCH(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);

		const valuesCall = insertChain.values as ReturnType<typeof vi.fn>;
		expect(valuesCall).toHaveBeenCalledWith(
			expect.objectContaining({
				customFields: { '1': 'existing_value', '2': 42 }
			})
		);
	});

	it('should work when no existing custom fields', async () => {
		const tc = makeTcWithVersion(null);
		mockFindTestCase.mockResolvedValue(tc);

		const insertChain = mockInsertReturning(mockDb, [{ id: 101 }]);
		mockUpdateChain();

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { customFields: { '1': 'brand_new' } },
			user: adminUser
		});
		const response = await PATCH(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);

		const valuesCall = insertChain.values as ReturnType<typeof vi.fn>;
		expect(valuesCall).toHaveBeenCalledWith(
			expect.objectContaining({
				customFields: { '1': 'brand_new' }
			})
		);
	});

	it('should create version with both title and custom fields changes', async () => {
		const tc = makeTcWithVersion({ '1': 'existing_value' });
		mockFindTestCase.mockResolvedValue(tc);

		const insertChain = mockInsertReturning(mockDb, [{ id: 101 }]);
		mockUpdateChain();

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { title: 'Updated Title', customFields: { '2': 'added' } },
			user: adminUser
		});
		const response = await PATCH(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);

		const valuesCall = insertChain.values as ReturnType<typeof vi.fn>;
		expect(valuesCall).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'Updated Title',
				customFields: { '1': 'existing_value', '2': 'added' }
			})
		);
	});

	it('should reject unknown custom field names (mass assignment prevention)', async () => {
		const tc = makeTcWithVersion({ '1': 'existing_value' });
		mockFindTestCase.mockResolvedValue(tc);
		// Only allow fields '1', '2', '3'
		mockSelectResult(mockDb, [{ name: '1' }, { name: '2' }, { name: '3' }]);

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { customFields: { '1': 'ok', 'not_defined': 'malicious' } },
			user: adminUser
		});
		const response = await PATCH(event);
		expect(response.status).toBe(400);

		const body = await response.json();
		expect(body.error).toContain('not_defined');
	});

	it('should return 404 when test case not found', async () => {
		mockFindTestCase.mockResolvedValue(null);

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { customFields: { '1': 'value' } },
			user: adminUser
		});
		await expect(PATCH(event)).rejects.toThrow();
	});

	it('should succeed when submitting only valid custom field names', async () => {
		const tc = makeTcWithVersion({ '1': 'existing_value' });
		mockFindTestCase.mockResolvedValue(tc);

		const insertChain = mockInsertReturning(mockDb, [{ id: 101 }]);
		mockUpdateChain();

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { customFields: { '1': 'updated', '2': 'new', '3': 'also_new' } },
			user: adminUser
		});
		const response = await PATCH(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);

		const valuesCall = insertChain.values as ReturnType<typeof vi.fn>;
		expect(valuesCall).toHaveBeenCalledWith(
			expect.objectContaining({
				customFields: { '1': 'updated', '2': 'new', '3': 'also_new' }
			})
		);
	});

	it('should reject the entire request when mixing valid and invalid field names', async () => {
		const tc = makeTcWithVersion({ '1': 'existing_value' });
		mockFindTestCase.mockResolvedValue(tc);
		mockSelectResult(mockDb, [{ name: '1' }, { name: '2' }, { name: '3' }]);

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { customFields: { '1': 'ok', '2': 'also_ok', 'hacked_field': 'bad', 'another_bad': 'evil' } },
			user: adminUser
		});
		const response = await PATCH(event);
		expect(response.status).toBe(400);

		const body = await response.json();
		expect(body.error).toContain('hacked_field');
		expect(body.error).toContain('another_bad');

		// Ensure no version was created (insert should not be called)
		expect(mockDb.insert).not.toHaveBeenCalled();
	});

	it('should succeed with an empty customFields object', async () => {
		const tc = makeTcWithVersion({ '1': 'existing_value', '2': 42 });
		mockFindTestCase.mockResolvedValue(tc);

		const insertChain = mockInsertReturning(mockDb, [{ id: 101 }]);
		mockUpdateChain();

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { customFields: {} },
			user: adminUser
		});
		const response = await PATCH(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);

		// Existing custom fields should be preserved as-is
		const valuesCall = insertChain.values as ReturnType<typeof vi.fn>;
		expect(valuesCall).toHaveBeenCalledWith(
			expect.objectContaining({
				customFields: { '1': 'existing_value', '2': 42 }
			})
		);
	});

	it('should succeed when custom field names are numeric-like strings matching real field IDs', async () => {
		const tc = makeTcWithVersion(null);
		mockFindTestCase.mockResolvedValue(tc);
		// Simulate project with numeric-like field names
		mockSelectResult(mockDb, [{ name: '100' }, { name: '200' }, { name: '300' }]);

		const insertChain = mockInsertReturning(mockDb, [{ id: 101 }]);
		mockUpdateChain();

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { customFields: { '100': 'val_a', '200': 'val_b' } },
			user: adminUser
		});
		const response = await PATCH(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);

		const valuesCall = insertChain.values as ReturnType<typeof vi.fn>;
		expect(valuesCall).toHaveBeenCalledWith(
			expect.objectContaining({
				customFields: { '100': 'val_a', '200': 'val_b' }
			})
		);
	});

	it('should list all unknown field names in the error message', async () => {
		const tc = makeTcWithVersion(null);
		mockFindTestCase.mockResolvedValue(tc);
		mockSelectResult(mockDb, [{ name: '1' }, { name: '2' }, { name: '3' }]);

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { customFields: { 'foo': 1, 'bar': 2, 'baz': 3 } },
			user: adminUser
		});
		const response = await PATCH(event);
		expect(response.status).toBe(400);

		const body = await response.json();
		expect(body.error).toContain('foo');
		expect(body.error).toContain('bar');
		expect(body.error).toContain('baz');
		expect(body.error).toMatch(/Unknown custom field/);
	});
});
