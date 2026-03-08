import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockCreateNotification = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', key: 'key' },
	testCaseComment: { id: 'id', testCaseId: 'test_case_id', userId: 'user_id', content: 'content', parentId: 'parent_id', createdAt: 'created_at', updatedAt: 'updated_at' },
	testCaseAssignee: { userId: 'user_id', testCaseId: 'test_case_id' },
	projectMember: { userId: 'user_id', projectId: 'project_id' },
	user: { id: 'id', name: 'name', email: 'email', image: 'image' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => a),
	isNull: vi.fn((a: unknown) => a)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return { ...actual, requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }) };
});
vi.mock('$lib/server/notifications', () => ({
	createNotification: mockCreateNotification
}));

const { POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', testCaseId: '10' };

describe('Comment @mention notifications', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
		mockDb.query.testCase = { findFirst: vi.fn().mockResolvedValue({ id: 10, key: 'TC-0001', projectId: 1 }) };
		mockDb.query.user = { findFirst: vi.fn().mockResolvedValue({ id: testUser.id, name: testUser.name, email: testUser.email, image: null }) };
	});

	it('should send MENTION notification for @mentioned users', async () => {
		// Mock insert returning
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([{ id: 1, testCaseId: 10, userId: testUser.id, content: 'Hey @Alice check this', parentId: null }])
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		// No assignees
		const selectChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			innerJoin: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
		};
		mockDb.select.mockReturnValue(selectChain as never);

		// Mock project members query (second select call after assignees)
		let selectCallCount = 0;
		mockDb.select.mockImplementation(() => {
			selectCallCount++;
			if (selectCallCount === 2) {
				// Members query
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([
						{ userId: 'user-alice', userName: 'Alice' },
						{ userId: 'user-bob', userName: 'Bob' }
					]).then(r)
				} as never;
			}
			return selectChain as never;
		});

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { content: 'Hey @Alice check this' },
			user: testUser
		});
		await POST(event);

		// Should have called createNotification for Alice with type MENTION
		const mentionCalls = mockCreateNotification.mock.calls.filter(
			(c: Array<{ type: string }>) => c[0].type === 'MENTION'
		);
		expect(mentionCalls.length).toBe(1);
		expect(mentionCalls[0][0].userId).toBe('user-alice');
	});

	it('should not notify comment author even if self-mentioned', async () => {
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([{ id: 1, testCaseId: 10, userId: testUser.id, content: `@${testUser.name} test`, parentId: null }])
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		const selectChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			innerJoin: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
		};

		let selectCallCount = 0;
		mockDb.select.mockImplementation(() => {
			selectCallCount++;
			if (selectCallCount === 2) {
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([
						{ userId: testUser.id, userName: testUser.name }
					]).then(r)
				} as never;
			}
			return selectChain as never;
		});

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { content: `@${testUser.name} test` },
			user: testUser
		});
		await POST(event);

		const mentionCalls = mockCreateNotification.mock.calls.filter(
			(c: Array<{ type: string }>) => c[0].type === 'MENTION'
		);
		expect(mentionCalls.length).toBe(0);
	});
});
