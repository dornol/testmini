import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
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
vi.mock('$lib/server/cache', () => ({ cacheDelete: vi.fn() }));

const { actions } = await import('./+page.server');

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

	describe('updateRole', () => {
		it('scopes role updates to the current project', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValueOnce({
				id: 7,
				projectId: 1,
				userId: 'target-user',
				role: 'QA'
			});

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				formData: makeForm({ memberId: '7', role: 'DEV' })
			});

			const result = await actions.updateRole(event);

			expect(result).toEqual({ success: true });
			expect(mockDb._chains.update.where).toHaveBeenCalledWith(
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
	});

	describe('removeMember', () => {
		it('scopes member deletes to the current project', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValueOnce({
				id: 7,
				projectId: 1,
				userId: 'target-user',
				role: 'QA'
			});

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				user: testUser,
				formData: makeForm({ memberId: '7' })
			});

			const result = await actions.removeMember(event);

			expect(result).toEqual({ success: true });
			expect(mockDb._chains.delete.where).toHaveBeenCalledWith(
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
	});
});
