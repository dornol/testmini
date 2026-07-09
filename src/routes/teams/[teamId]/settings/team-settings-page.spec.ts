import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
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
vi.mock('$lib/schemas/team.schema', () => ({ updateTeamSchema: {} }));
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
			const deleteChain = mockDeleteReturning(mockDb, [{ id: 5 }]);

			await expect(actions.delete(createActionEvent())).rejects.toMatchObject({
				status: 303,
				location: '/teams'
			});

			expect(mockDb.update).toHaveBeenCalled();
			expect(deleteChain.where).toHaveBeenCalledWith(['id', 5]);
		});

		it('should allow global admin without membership lookup when deleting', async () => {
			mockDeleteReturning(mockDb, [{ id: 5 }]);

			await expect(actions.delete(createActionEvent(adminUser))).rejects.toMatchObject({
				status: 303,
				location: '/teams'
			});

			expect(mockDb.query.teamMember.findFirst).not.toHaveBeenCalled();
		});

		it('should throw 404 when team disappears before delete', async () => {
			mockDeleteReturning(mockDb, []);

			await expect(actions.delete(createActionEvent())).rejects.toMatchObject({
				status: 404,
				body: { message: 'Team not found' }
			});
		});
	});
});
