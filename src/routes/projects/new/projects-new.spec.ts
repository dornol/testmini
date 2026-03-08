import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', name: 'name', description: 'description', active: 'active', createdBy: 'created_by', createdAt: 'created_at' },
	projectMember: { projectId: 'project_id', userId: 'user_id', role: 'role' },
	priorityConfig: { id: 'id', projectId: 'project_id', name: 'name', color: 'color', position: 'position', isDefault: 'is_default', createdBy: 'created_by', createdAt: 'created_at' },
	environmentConfig: { id: 'id', projectId: 'project_id', name: 'name', color: 'color', position: 'position', isDefault: 'is_default', createdBy: 'created_by', createdAt: 'created_at' }
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

// Import after mocks
const { load, actions } = await import('./+page.server');

function createFormData(data: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(data)) {
		fd.append(key, value);
	}
	return fd;
}

describe('/projects/new', () => {
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
		// Helper to set up the transaction mock and capture insert calls
		function setupTransaction(createdProject = { ...sampleProject, id: 99 }) {
			const txInsertCalls: { table: unknown; values: unknown }[] = [];

			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockImplementation(function (this: typeof txInsertChain, vals: unknown) {
						// Capture each insert call's values
						txInsertCalls.push({ table: txInsertChain._lastTable, values: vals });
						return txInsertChain;
					}),
					returning: vi.fn().mockResolvedValue([createdProject]),
					_lastTable: undefined as unknown,
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) =>
					Promise.resolve([createdProject]).then(r);

				const tx = {
					insert: vi.fn().mockImplementation((table: unknown) => {
						txInsertChain._lastTable = table;
						return txInsertChain;
					})
				};
				return fn(tx);
			});

			return { txInsertCalls };
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

		it('should create project and redirect on valid input', async () => {
			const createdProject = { ...sampleProject, id: 99 };
			setupTransaction(createdProject);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'New Project', description: 'A description' }),
				user: testUser
			});

			await expect(actions.default(event)).rejects.toThrow();

			// Verify transaction was called
			expect(mockDb.transaction).toHaveBeenCalledOnce();
		});

		it('should redirect to the newly created project page', async () => {
			const createdProject = { ...sampleProject, id: 42 };
			setupTransaction(createdProject);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'My Project' }),
				user: testUser
			});

			try {
				await actions.default(event);
			} catch (e: unknown) {
				// SvelteKit redirect throws — check the redirect location
				const err = e as { status: number; location: string };
				expect(err.status).toBe(303);
				expect(err.location).toBe('/projects/42');
			}
		});

		it('should insert project with correct data in transaction', async () => {
			const createdProject = { ...sampleProject, id: 99 };
			let txRef: Record<string, ReturnType<typeof vi.fn>> | undefined;

			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockResolvedValue([createdProject]),
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) =>
					Promise.resolve([createdProject]).then(r);

				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain)
				};
				txRef = tx as never;
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'Test Project', description: 'desc' }),
				user: testUser
			});

			try { await actions.default(event); } catch { /* redirect */ }

			// tx.insert should be called 4 times: project, projectMember, priorityConfig, environmentConfig
			expect(txRef!.insert).toHaveBeenCalledTimes(4);
		});

		it('should add creator as PROJECT_ADMIN member', async () => {
			const createdProject = { ...sampleProject, id: 99 };
			const insertedValues: unknown[] = [];

			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockImplementation((vals: unknown) => {
						insertedValues.push(vals);
						return txInsertChain;
					}),
					returning: vi.fn().mockResolvedValue([createdProject]),
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) =>
					Promise.resolve([createdProject]).then(r);

				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain)
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'Test' }),
				user: testUser
			});

			try { await actions.default(event); } catch { /* redirect */ }

			// Second insert call is projectMember
			const memberValues = insertedValues[1] as { projectId: number; userId: string; role: string };
			expect(memberValues).toEqual({
				projectId: createdProject.id,
				userId: testUser.id,
				role: 'PROJECT_ADMIN'
			});
		});

		it('should seed 4 default priorities with correct values', async () => {
			const createdProject = { ...sampleProject, id: 99 };
			const insertedValues: unknown[] = [];

			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockImplementation((vals: unknown) => {
						insertedValues.push(vals);
						return txInsertChain;
					}),
					returning: vi.fn().mockResolvedValue([createdProject]),
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) =>
					Promise.resolve([createdProject]).then(r);

				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain)
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'Test' }),
				user: testUser
			});

			try { await actions.default(event); } catch { /* redirect */ }

			// Third insert call is priorityConfig (index 2)
			const priorities = insertedValues[2] as Array<{
				projectId: number; name: string; color: string; position: number; isDefault: boolean; createdBy: string;
			}>;

			expect(priorities).toHaveLength(4);

			expect(priorities[0]).toMatchObject({ name: 'LOW', color: '#6b7280', position: 0, isDefault: false });
			expect(priorities[1]).toMatchObject({ name: 'MEDIUM', color: '#3b82f6', position: 1, isDefault: true });
			expect(priorities[2]).toMatchObject({ name: 'HIGH', color: '#f97316', position: 2, isDefault: false });
			expect(priorities[3]).toMatchObject({ name: 'CRITICAL', color: '#ef4444', position: 3, isDefault: false });

			// All priorities belong to the created project
			for (const p of priorities) {
				expect(p.projectId).toBe(createdProject.id);
				expect(p.createdBy).toBe(testUser.id);
			}
		});

		it('should seed 4 default environments with correct values', async () => {
			const createdProject = { ...sampleProject, id: 99 };
			const insertedValues: unknown[] = [];

			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockImplementation((vals: unknown) => {
						insertedValues.push(vals);
						return txInsertChain;
					}),
					returning: vi.fn().mockResolvedValue([createdProject]),
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) =>
					Promise.resolve([createdProject]).then(r);

				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain)
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'Test' }),
				user: testUser
			});

			try { await actions.default(event); } catch { /* redirect */ }

			// Fourth insert call is environmentConfig (index 3)
			const environments = insertedValues[3] as Array<{
				projectId: number; name: string; color: string; position: number; isDefault: boolean; createdBy: string;
			}>;

			expect(environments).toHaveLength(4);

			expect(environments[0]).toMatchObject({ name: 'DEV', color: '#3b82f6', position: 0, isDefault: true });
			expect(environments[1]).toMatchObject({ name: 'QA', color: '#8b5cf6', position: 1, isDefault: false });
			expect(environments[2]).toMatchObject({ name: 'STAGE', color: '#f97316', position: 2, isDefault: false });
			expect(environments[3]).toMatchObject({ name: 'PROD', color: '#ef4444', position: 3, isDefault: false });

			// All environments belong to the created project
			for (const env of environments) {
				expect(env.projectId).toBe(createdProject.id);
				expect(env.createdBy).toBe(testUser.id);
			}
		});

		it('should set DEV as the default environment', async () => {
			const createdProject = { ...sampleProject, id: 99 };
			const insertedValues: unknown[] = [];

			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockImplementation((vals: unknown) => {
						insertedValues.push(vals);
						return txInsertChain;
					}),
					returning: vi.fn().mockResolvedValue([createdProject]),
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) =>
					Promise.resolve([createdProject]).then(r);

				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain)
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'Test' }),
				user: testUser
			});

			try { await actions.default(event); } catch { /* redirect */ }

			const environments = insertedValues[3] as Array<{
				name: string; isDefault: boolean;
			}>;

			const defaults = environments.filter(e => e.isDefault);
			expect(defaults).toHaveLength(1);
			expect(defaults[0].name).toBe('DEV');
		});

		it('should set MEDIUM as the default priority', async () => {
			const createdProject = { ...sampleProject, id: 99 };
			const insertedValues: unknown[] = [];

			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockImplementation((vals: unknown) => {
						insertedValues.push(vals);
						return txInsertChain;
					}),
					returning: vi.fn().mockResolvedValue([createdProject]),
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) =>
					Promise.resolve([createdProject]).then(r);

				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain)
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'Test' }),
				user: testUser
			});

			try { await actions.default(event); } catch { /* redirect */ }

			const priorities = insertedValues[2] as Array<{
				name: string; isDefault: boolean;
			}>;

			const defaults = priorities.filter(p => p.isDefault);
			expect(defaults).toHaveLength(1);
			expect(defaults[0].name).toBe('MEDIUM');
		});

		it('should create project without description', async () => {
			const createdProject = { ...sampleProject, id: 99 };
			const insertedValues: unknown[] = [];

			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockImplementation((vals: unknown) => {
						insertedValues.push(vals);
						return txInsertChain;
					}),
					returning: vi.fn().mockResolvedValue([createdProject]),
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) =>
					Promise.resolve([createdProject]).then(r);

				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain)
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'No Description Project' }),
				user: testUser
			});

			try { await actions.default(event); } catch { /* redirect */ }

			// First insert is project
			const projectValues = insertedValues[0] as { name: string; description: string | null; createdBy: string };
			expect(projectValues.name).toBe('No Description Project');
			expect(projectValues.description).toBeNull();
			expect(projectValues.createdBy).toBe(testUser.id);
		});

		it('should accept a name exactly 100 characters long', async () => {
			const createdProject = { ...sampleProject, id: 99 };
			setupTransaction(createdProject);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData({ name: 'a'.repeat(100) }),
				user: testUser
			});

			// Should not return a validation error — should redirect (throw)
			await expect(actions.default(event)).rejects.toThrow();
			expect(mockDb.transaction).toHaveBeenCalledOnce();
		});
	});
});
