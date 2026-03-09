import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

// Must add team and teamMember to query mock
mockDb.query.team = { findFirst: vi.fn() };
mockDb.query.teamMember = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	team: { id: 'id', name: 'name', description: 'description', createdBy: 'created_by', createdAt: 'created_at' },
	teamMember: { id: 'id', teamId: 'team_id', userId: 'user_id', role: 'role', joinedAt: 'joined_at' },
	user: { id: 'user.id', name: 'user.name', email: 'user.email', image: 'user.image' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	count: vi.fn(() => 'count_fn'),
	asc: vi.fn((a: unknown) => ['asc', a])
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn((locals: App.Locals) => {
		if (!locals.user) throw new Error('Authentication required');
		return locals.user;
	}),
	isGlobalAdmin: vi.fn((user: { role?: string }) => user.role === 'admin')
}));

const mockLoadTeamMembers = vi.fn();
vi.mock('$lib/server/queries', () => ({
	loadTeamMembers: (...args: unknown[]) => mockLoadTeamMembers(...args)
}));

const { load, actions } = await import('./+page.server');

function createFormData(data: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(data)) {
		fd.append(key, value);
	}
	return fd;
}

const sampleMembers = [
	{ id: 1, userId: 'user-1', role: 'OWNER', joinedAt: new Date(), userName: 'Test User', userEmail: 'test@example.com', userImage: null },
	{ id: 2, userId: 'user-2', role: 'MEMBER', joinedAt: new Date(), userName: 'Another User', userEmail: 'another@example.com', userImage: null }
];

describe('/teams/[teamId]/settings/members', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: user is OWNER (passes requireTeamAdmin)
		mockDb.query.teamMember.findFirst.mockResolvedValue({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' });
	});

	describe('load', () => {
		it('should return team members', async () => {
			mockLoadTeamMembers.mockResolvedValue(sampleMembers);

			const event = createMockEvent({
				params: { teamId: '5' },
				user: testUser
			});
			const result = await load(event) as Record<string, any>;

			expect(result.members).toEqual(sampleMembers);
			expect(mockLoadTeamMembers).toHaveBeenCalledWith(5);
		});

		it('should return addForm', async () => {
			mockLoadTeamMembers.mockResolvedValue([]);

			const event = createMockEvent({
				params: { teamId: '5' },
				user: testUser
			});
			const result = await load(event) as Record<string, any>;

			expect(result).toHaveProperty('addForm');
			expect(result.addForm).toHaveProperty('valid');
		});
	});

	describe('actions.addMember', () => {
		it('should add member with specified role', async () => {
			// Mock: user not already a member
			mockDb.query.teamMember.findFirst
				.mockResolvedValueOnce({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' }) // requireTeamAdmin
				.mockResolvedValueOnce(undefined); // existing check

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ userId: 'user-3', role: 'MEMBER' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.addMember(event);

			expect(mockDb.insert).toHaveBeenCalled();
			// Should return a message form
			expect(result).toBeDefined();
		});

		it('should reject when user is already a member', async () => {
			mockDb.query.teamMember.findFirst
				.mockResolvedValueOnce({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' }) // requireTeamAdmin
				.mockResolvedValueOnce({ id: 2, teamId: 5, userId: 'user-3', role: 'MEMBER' }); // existing

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ userId: 'user-3', role: 'MEMBER' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.addMember(event);
			// superforms message with status 400
			expect(result).toBeDefined();
		});

		it('should return 400 for missing userId', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ role: 'MEMBER' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.addMember(event);
			expect(result?.status).toBe(400);
		});

		it('should return 400 for invalid role', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ userId: 'user-3', role: 'SUPERADMIN' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.addMember(event);
			expect(result?.status).toBe(400);
		});
	});

	describe('actions.updateRole', () => {
		it('should update member role', async () => {
			mockDb.query.teamMember.findFirst
				.mockResolvedValueOnce({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' }) // requireTeamAdmin
				.mockResolvedValueOnce({ id: 2, teamId: 5, userId: 'user-2', role: 'MEMBER' }); // member lookup

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ memberId: '2', role: 'ADMIN' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.updateRole(event);

			expect(mockDb.update).toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});

		it('should return 400 for missing memberId', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ role: 'ADMIN' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.updateRole(event);
			expect(result?.status).toBe(400);
		});

		it('should return 404 when member not found', async () => {
			mockDb.query.teamMember.findFirst
				.mockResolvedValueOnce({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' }) // requireTeamAdmin
				.mockResolvedValueOnce(undefined); // member not found

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ memberId: '999', role: 'ADMIN' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.updateRole(event);
			expect(result?.status).toBe(404);
		});

		it('should prevent demoting the last OWNER', async () => {
			mockDb.query.teamMember.findFirst
				.mockResolvedValueOnce({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' }) // requireTeamAdmin
				.mockResolvedValueOnce({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' }); // member is OWNER

			// Mock count query: only 1 OWNER
			mockSelectResult(mockDb, [{ count: 1 }]);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ memberId: '1', role: 'MEMBER' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.updateRole(event);
			expect(result?.status).toBe(400);
			expect(result?.data?.error).toContain('last team owner');
		});
	});

	describe('actions.removeMember', () => {
		it('should remove member', async () => {
			mockDb.query.teamMember.findFirst
				.mockResolvedValueOnce({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' }) // requireTeamAdmin
				.mockResolvedValueOnce({ id: 2, teamId: 5, userId: 'user-2', role: 'MEMBER' }); // member to remove

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ memberId: '2' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.removeMember(event);

			expect(mockDb.delete).toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});

		it('should return 400 for missing memberId', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({}),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.removeMember(event);
			expect(result?.status).toBe(400);
		});

		it('should return 404 when member not found', async () => {
			mockDb.query.teamMember.findFirst
				.mockResolvedValueOnce({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' }) // requireTeamAdmin
				.mockResolvedValueOnce(undefined); // not found

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ memberId: '999' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.removeMember(event);
			expect(result?.status).toBe(404);
		});

		it('should prevent removing the last OWNER', async () => {
			mockDb.query.teamMember.findFirst
				.mockResolvedValueOnce({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' }) // requireTeamAdmin
				.mockResolvedValueOnce({ id: 1, teamId: 5, userId: testUser.id, role: 'OWNER' }); // member is OWNER

			// Mock count query: only 1 OWNER
			mockSelectResult(mockDb, [{ count: 1 }]);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ memberId: '1' }),
				params: { teamId: '5' },
				user: testUser
			});

			const result = await actions.removeMember(event);
			expect(result?.status).toBe(400);
			expect(result?.data?.error).toContain('last team owner');
		});
	});
});
