import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	team: { id: 'id', name: 'name', description: 'description', createdBy: 'created_by', createdAt: 'created_at' },
	teamMember: { id: 'id', teamId: 'team_id', userId: 'user_id', role: 'role', joinedAt: 'joined_at' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));

const { load, actions } = await import('./+page.server');

function createFormData(data: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(data)) {
		fd.append(key, value);
	}
	return fd;
}

const sampleTeam = {
	id: 10,
	name: 'Test Team',
	description: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('/teams/new', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('load', () => {
		it('should redirect to login when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			await expect(load(event)).rejects.toThrow();
		});

		it('should return form for authenticated user', async () => {
			const event = createMockEvent({ user: testUser });
			const result = await load(event);
			expect(result).toHaveProperty('form');
			expect(result.form).toHaveProperty('valid');
		});
	});

	describe('actions.default', () => {
		function setupTransaction(createdTeam = { ...sampleTeam }) {
			const insertedValues: unknown[] = [];

			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockImplementation(function (this: typeof txInsertChain, vals: unknown) {
						insertedValues.push(vals);
						return txInsertChain;
					}),
					returning: vi.fn().mockResolvedValue([createdTeam]),
					_lastTable: undefined as unknown,
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) =>
					Promise.resolve([createdTeam]).then(r);

				const tx = {
					insert: vi.fn().mockImplementation((table: unknown) => {
						txInsertChain._lastTable = table;
						return txInsertChain;
					})
				};
				return fn(tx);
			});

			return { insertedValues };
		}

		it('should redirect to login when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'Test' }),
				user: null
			});
			await expect(actions.default(event)).rejects.toThrow();
		});

		it('should return 400 for missing name', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({}),
				user: testUser
			});
			const result = await actions.default(event);
			expect(result).toBeDefined();
			expect(result?.status).toBe(400);
			expect(result?.data).toHaveProperty('form');
		});

		it('should return 400 for empty name', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: '' }),
				user: testUser
			});
			const result = await actions.default(event);
			expect(result?.status).toBe(400);
		});

		it('should return 400 for name exceeding 100 characters', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'a'.repeat(101) }),
				user: testUser
			});
			const result = await actions.default(event);
			expect(result?.status).toBe(400);
		});

		it('should return 400 for description exceeding 1000 characters', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'Valid', description: 'x'.repeat(1001) }),
				user: testUser
			});
			const result = await actions.default(event);
			expect(result?.status).toBe(400);
		});

		it('should create team in transaction and redirect on valid input', async () => {
			const createdTeam = { ...sampleTeam, id: 42 };
			setupTransaction(createdTeam);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'New Team', description: 'A description' }),
				user: testUser
			});

			await expect(actions.default(event)).rejects.toThrow();
			expect(mockDb.transaction).toHaveBeenCalledOnce();
		});

		it('should redirect to /teams/{id} after creation', async () => {
			const createdTeam = { ...sampleTeam, id: 42 };
			setupTransaction(createdTeam);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'My Team' }),
				user: testUser
			});

			try {
				await actions.default(event);
			} catch (e: unknown) {
				const err = e as { status: number; location: string };
				expect(err.status).toBe(303);
				expect(err.location).toBe('/teams/42');
			}
		});

		it('should insert team and teamMember as OWNER in transaction', async () => {
			const createdTeam = { ...sampleTeam, id: 99 };
			const { insertedValues } = setupTransaction(createdTeam);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'Test Team', description: 'desc' }),
				user: testUser
			});

			try { await actions.default(event); } catch { /* redirect */ }

			// First insert: team data
			const teamValues = insertedValues[0] as { name: string; description: string | null; createdBy: string };
			expect(teamValues.name).toBe('Test Team');
			expect(teamValues.description).toBe('desc');
			expect(teamValues.createdBy).toBe(testUser.id);

			// Second insert: teamMember with OWNER role
			const memberValues = insertedValues[1] as { teamId: number; userId: string; role: string };
			expect(memberValues).toEqual({
				teamId: createdTeam.id,
				userId: testUser.id,
				role: 'OWNER'
			});
		});

		it('should create team without description', async () => {
			const createdTeam = { ...sampleTeam, id: 99 };
			const { insertedValues } = setupTransaction(createdTeam);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'No Desc Team' }),
				user: testUser
			});

			try { await actions.default(event); } catch { /* redirect */ }

			const teamValues = insertedValues[0] as { name: string; description: string | null; createdBy: string };
			expect(teamValues.name).toBe('No Desc Team');
			expect(teamValues.description).toBeNull();
			expect(teamValues.createdBy).toBe(testUser.id);
		});

		it('should accept a name exactly 100 characters long', async () => {
			const createdTeam = { ...sampleTeam, id: 99 };
			setupTransaction(createdTeam);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'a'.repeat(100) }),
				user: testUser
			});

			await expect(actions.default(event)).rejects.toThrow();
			expect(mockDb.transaction).toHaveBeenCalledOnce();
		});
	});
});
