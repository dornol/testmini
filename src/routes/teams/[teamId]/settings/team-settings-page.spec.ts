import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';
import { superValidate } from 'sveltekit-superforms';

const mockDb = createMockDb();
mockDb.query.teamMember = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	team: { id: 'id', name: 'name', description: 'description' },
	teamMember: { teamId: 'team_id', userId: 'user_id', role: 'role' },
	project: { id: 'project_id', teamId: 'project_team_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn((locals: App.Locals) => {
		if (!locals.user) throw new Error('Authentication required');
		return locals.user;
	}),
	isGlobalAdmin: vi.fn((user: { role?: string }) => user.role === 'admin'),
	parseId: vi.fn((raw: string) => Number(raw))
}));
vi.mock('$lib/schemas/team.schema', () => ({ createTeamSchema: {}, updateTeamSchema: {} }));
vi.mock('$lib/server/form-utils', () => ({ zodAdapter: vi.fn(() => ({})) }));
vi.mock('sveltekit-superforms', () => ({
	superValidate: vi.fn(),
	message: vi.fn((form: unknown, text: string) => ({ form, message: text }))
}));

const { actions } = await import('./+page.server');

const PARAMS = { teamId: '5' };

function createActionEvent(user: NonNullable<App.Locals['user']> | null = testUser) {
	return createMockEvent({
		method: 'POST',
		formData: new FormData(),
		params: PARAMS,
		user
	});
}

function mockValidTeamForm(data: { name?: string; description?: string | null }) {
	vi.mocked(superValidate).mockResolvedValue({
		valid: true,
		data
	} as never);
}

function mockDeleteTransaction(deletedRows: unknown[]) {
	const updateWhere = vi.fn().mockResolvedValue(undefined);
	const updateSet = vi.fn(() => ({ where: updateWhere }));
	const txUpdate = vi.fn(() => ({ set: updateSet }));
	const deleteReturning = vi.fn().mockResolvedValue(deletedRows);
	const deleteWhere = vi.fn(() => ({ returning: deleteReturning }));
	const txDelete = vi.fn(() => ({ where: deleteWhere }));
	mockDb.transaction.mockImplementationOnce(async (fn) =>
		fn({ update: txUpdate, delete: txDelete })
	);
	return { deleteReturning, deleteWhere, txDelete, txUpdate, updateSet, updateWhere };
}

describe('/teams/[teamId]/settings +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.teamMember.findFirst.mockResolvedValue({
			teamId: 5,
			userId: testUser.id,
			role: 'OWNER'
		});
		mockValidTeamForm({ name: 'Updated Team', description: 'Updated description' });
	});

	describe('actions.update', () => {
		it('should return 401 when not authenticated', async () => {
			await expect(actions.update(createActionEvent(null))).rejects.toThrow();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 403 when user is not OWNER or ADMIN', async () => {
			mockDb.query.teamMember.findFirst.mockResolvedValue({
				teamId: 5,
				userId: testUser.id,
				role: 'MEMBER'
			});

			const result = await actions.update(createActionEvent());

			expect(result).toMatchObject({ status: 403, data: { error: 'Insufficient permissions' } });
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should update team on success', async () => {
			const updateChain = mockUpdateReturning(mockDb, [{ id: 5 }]);

			const result = await actions.update(createActionEvent());

			expect(result).toMatchObject({ message: 'Team updated successfully' });
			expect(updateChain.where).toHaveBeenCalledWith(['id', 5]);
			expect(updateChain.set).toHaveBeenCalledWith({
				name: 'Updated Team',
				description: 'Updated description'
			});
		});

		it('should allow global admin without membership lookup', async () => {
			mockUpdateReturning(mockDb, [{ id: 5 }]);

			await actions.update(createActionEvent(adminUser));

			expect(mockDb.query.teamMember.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('returns the submitted form when the database update fails', async () => {
			const form = { valid: true, data: { name: 'Draft name', description: 'Draft description' } };
			vi.mocked(superValidate).mockResolvedValueOnce(form as never);
			mockDb.update.mockReturnValueOnce({
				set: () => ({
					where: () => ({ returning: vi.fn().mockRejectedValue(new Error('Unavailable')) })
				})
			});
			expect(await actions.update(createActionEvent())).toEqual({ form, message: 'save_failed' });
		});

		it('should throw 404 when team disappears before update', async () => {
			mockUpdateReturning(mockDb, []);

			await expect(actions.update(createActionEvent())).rejects.toMatchObject({
				status: 404,
				body: { message: 'Team not found' }
			});
		});
	});

	describe('actions.delete', () => {
		it('should return 401 when not authenticated', async () => {
			await expect(actions.delete(createActionEvent(null))).rejects.toThrow();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should return 403 when user is not OWNER', async () => {
			mockDb.query.teamMember.findFirst.mockResolvedValue({
				teamId: 5,
				userId: testUser.id,
				role: 'ADMIN'
			});

			const result = await actions.delete(createActionEvent());

			expect(result).toMatchObject({
				status: 403,
				data: { error: 'Only team owner can delete the team' }
			});
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should delete team on success', async () => {
			const tx = mockDeleteTransaction([{ id: 5 }]);

			await expect(actions.delete(createActionEvent())).rejects.toMatchObject({
				status: 303,
				location: '/teams'
			});

			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
			expect(tx.txUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ teamId: 'project_team_id' })
			);
			expect(tx.updateSet).toHaveBeenCalledWith({ teamId: null });
			expect(tx.updateWhere).toHaveBeenCalledWith(['project_team_id', 5]);
			expect(tx.txDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'id' }));
			expect(tx.deleteWhere).toHaveBeenCalledWith(['id', 5]);
			expect(tx.deleteReturning).toHaveBeenCalled();
		});

		it('should allow global admin without membership lookup when deleting', async () => {
			mockDeleteTransaction([{ id: 5 }]);

			await expect(actions.delete(createActionEvent(adminUser))).rejects.toMatchObject({
				status: 303,
				location: '/teams'
			});

			expect(mockDb.query.teamMember.findFirst).not.toHaveBeenCalled();
		});

		it('should throw 404 when team disappears before delete', async () => {
			mockDeleteTransaction([]);

			await expect(actions.delete(createActionEvent())).rejects.toMatchObject({
				status: 404,
				body: { message: 'Team not found' }
			});
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		});

		it('returns a retryable failure when the deletion transaction fails', async () => {
			mockDb.transaction.mockRejectedValueOnce(new Error('Unavailable'));
			await expect(actions.delete(createActionEvent())).resolves.toMatchObject({
				status: 500,
				data: { deleteFailed: true }
			});
		});
	});
});
