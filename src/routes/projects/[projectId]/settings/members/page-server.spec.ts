import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockInsertReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireProjectRole = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	projectMember: {
		id: 'id',
		projectId: 'project_id',
		userId: 'user_id',
		role: 'role',
		createdAt: 'created_at'
	},
	user: {
		id: 'id',
		name: 'name',
		email: 'email'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	count: vi.fn(() => 'count'),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn((locals: App.Locals) => {
		if (!locals.user) throw new Error('Authentication required');
		return locals.user;
	}),
	requireProjectRole: mockRequireProjectRole,
	parseId: vi.fn((raw: string | undefined) => Number(raw))
}));
vi.mock('$lib/server/audit', () => ({ logAudit: vi.fn() }));
vi.mock('$lib/server/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('$lib/server/cache', () => ({
	cacheDelete: vi.fn(),
	cacheDeleteProjectAnalytics: vi.fn()
}));

const { actions } = await import('./+page.server');
const { logAudit } = await import('$lib/server/audit');
const { createNotification } = await import('$lib/server/notifications');
const { cacheDelete } = await import('$lib/server/cache');
const MAX_PROJECT_MEMBER_FORM_BODY_SIZE = 16 * 1024;

function makeForm(values: Record<string, FormDataEntryValue>): FormData {
	const formData = new FormData();
	for (const [key, value] of Object.entries(values)) {
		formData.set(key, value);
	}
	return formData;
}

describe('/projects/[projectId]/settings/members page actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireProjectRole.mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('addMember', () => {
		it('rejects oversized form bodies before validating member data', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				headers: { 'content-length': String(MAX_PROJECT_MEMBER_FORM_BODY_SIZE + 1) },
				formData: makeForm({ userId: 'user-2', role: 'QA' })
			});

			await expect(actions.addMember(event)).rejects.toMatchObject({
				status: 413,
				body: { message: 'Project member form body is too large' }
			});
			expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('returns 400 before insert when target user does not exist', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValueOnce(null);
			const selectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				then: (resolve: (value: unknown[]) => void) => Promise.resolve([]).then(resolve)
			};
			mockDb.select.mockReturnValue(selectChain as never);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				formData: makeForm({ userId: 'missing-user', role: 'QA' })
			});

			const result = await actions.addMember(event);

			expect(result).toMatchObject({ status: 400 });
			expect(selectChain.where).toHaveBeenCalledWith(['id', 'missing-user']);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('returns 500 without side effects when insert returns no member', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValueOnce(null);
			const selectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				then: (resolve: (value: unknown[]) => void) =>
					Promise.resolve([{ id: 'user-2' }]).then(resolve)
			};
			mockDb.select.mockReturnValue(selectChain as never);
			mockInsertReturning(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				formData: makeForm({ userId: 'user-2', role: 'QA' })
			});

			const result = await actions.addMember(event);

			expect(result).toMatchObject({ status: 500, data: { error: 'Failed to add member' } });
			expect(cacheDelete).not.toHaveBeenCalled();
			expect(logAudit).not.toHaveBeenCalled();
			expect(createNotification).not.toHaveBeenCalled();
		});
	});

	describe('updateRole', () => {
		it('rejects invalid content-length before querying member records', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				headers: { 'content-length': 'invalid' },
				formData: makeForm({ memberId: '7', role: 'DEV' })
			});

			await expect(actions.updateRole(event)).rejects.toMatchObject({
				status: 400,
				body: { message: 'Invalid content-length header' }
			});
			expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('scopes role updates to the current project', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValueOnce({
				id: 7,
				projectId: 1,
				userId: 'target-user',
				role: 'QA'
			});
			const updateChain = mockUpdateReturning(mockDb, [{ id: 7 }]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				formData: makeForm({ memberId: '7', role: 'DEV' })
			});

			const result = await actions.updateRole(event);

			expect(result).toEqual({ success: true });
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 7],
					['project_id', 1]
				])
			);
		});

		it('returns 400 for invalid memberId before querying member records', async () => {
			for (const memberId of [
				'abc',
				'0',
				'-1',
				'+1',
				'01',
				'1.5',
				'1e3',
				' 1',
				'1 ',
				String(Number.MAX_SAFE_INTEGER + 1)
			]) {
				vi.clearAllMocks();
				mockRequireProjectRole.mockResolvedValue({ role: 'PROJECT_ADMIN' });
				const event = createMockEvent({
					method: 'POST',
					params: { projectId: '1' },
					user: testUser,
					formData: makeForm({ memberId, role: 'QA' })
				});

				const result = await actions.updateRole(event);

				expect(result).toMatchObject({ status: 400 });
				expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});

		it('returns 400 for invalid role before querying member records', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				formData: makeForm({ memberId: '7', role: 'OWNER' })
			});

			const result = await actions.updateRole(event);

			expect(result).toMatchObject({ status: 400 });
			expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('returns 400 for non-text role before querying member records', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				formData: makeForm({ memberId: '7', role: new File(['QA'], 'role.txt') })
			});

			const result = await actions.updateRole(event);

			expect(result).toMatchObject({ status: 400 });
			expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('returns 404 without side effects when update affects no rows', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValueOnce({
				id: 7,
				projectId: 1,
				userId: 'target-user',
				role: 'QA'
			});
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				formData: makeForm({ memberId: '7', role: 'DEV' })
			});

			const result = await actions.updateRole(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'Member not found' } });
			expect(cacheDelete).not.toHaveBeenCalled();
			expect(logAudit).not.toHaveBeenCalled();
		});
	});

	describe('removeMember', () => {
		it('rejects oversized form bodies before querying member records', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				headers: { 'content-length': String(MAX_PROJECT_MEMBER_FORM_BODY_SIZE + 1) },
				formData: makeForm({ memberId: '7' })
			});

			await expect(actions.removeMember(event)).rejects.toMatchObject({
				status: 413,
				body: { message: 'Project member form body is too large' }
			});
			expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('scopes member deletes to the current project', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValueOnce({
				id: 7,
				projectId: 1,
				userId: 'target-user',
				role: 'QA'
			});
			const deleteChain = mockDeleteReturning(mockDb, [{ id: 7 }]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				formData: makeForm({ memberId: '7' })
			});

			const result = await actions.removeMember(event);

			expect(result).toEqual({ success: true });
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 7],
					['project_id', 1]
				])
			);
		});

		it('returns 400 for invalid memberId before querying member records', async () => {
			for (const memberId of [
				'abc',
				'0',
				'-1',
				'+1',
				'01',
				'1.5',
				'1e3',
				' 1',
				'1 ',
				String(Number.MAX_SAFE_INTEGER + 1)
			]) {
				vi.clearAllMocks();
				mockRequireProjectRole.mockResolvedValue({ role: 'PROJECT_ADMIN' });
				const event = createMockEvent({
					method: 'POST',
					params: { projectId: '1' },
					user: testUser,
					formData: makeForm({ memberId })
				});

				const result = await actions.removeMember(event);

				expect(result).toMatchObject({ status: 400, data: { error: 'Invalid memberId' } });
				expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
				expect(mockDb.delete).not.toHaveBeenCalled();
			}
		});

		it('returns 404 without side effects when delete affects no rows', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValueOnce({
				id: 7,
				projectId: 1,
				userId: 'target-user',
				role: 'QA'
			});
			mockDeleteReturning(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				formData: makeForm({ memberId: '7' })
			});

			const result = await actions.removeMember(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'Member not found' } });
			expect(cacheDelete).not.toHaveBeenCalled();
			expect(logAudit).not.toHaveBeenCalled();
		});
	});
});
