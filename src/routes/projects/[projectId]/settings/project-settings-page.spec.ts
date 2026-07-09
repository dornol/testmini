import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: {
		id: 'id',
		name: 'name',
		description: 'description',
		active: 'active',
		requireSignoff: 'require_signoff'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireAuth: vi.fn().mockReturnValue(testUser),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		parseId: vi.fn((raw: string) => Number(raw))
	};
});
vi.mock('$lib/schemas/project.schema', () => ({ updateProjectSchema: {} }));
vi.mock('$lib/server/form-utils', () => ({ zodAdapter: vi.fn(() => ({})) }));
vi.mock('sveltekit-superforms', () => ({
	superValidate: vi.fn(),
	message: vi.fn((form: unknown, text: string) => ({ form, message: text }))
}));

const { actions } = await import('./+page.server');

const PARAMS = { projectId: '1' };

function createActionEvent() {
	return createMockEvent({
		method: 'POST',
		params: PARAMS,
		user: testUser
	});
}

describe('project settings page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('actions.toggleSignoff', () => {
		it('toggles requireSignoff for an existing project', async () => {
			mockSelectResult(mockDb, [{ requireSignoff: false }]);
			const updateChain = mockUpdateReturning(mockDb, [{ id: 1 }]);

			const result = await actions.toggleSignoff(createActionEvent());

			expect(result).toEqual({ success: true });
			expect(updateChain.set).toHaveBeenCalledWith({ requireSignoff: true });
			expect(updateChain.where).toHaveBeenCalledWith(['id', 1]);
		});

		it('returns 404 when the project is missing before toggle', async () => {
			mockSelectResult(mockDb, []);

			await expect(actions.toggleSignoff(createActionEvent())).rejects.toMatchObject({
				status: 404,
				body: { message: 'Project not found' }
			});
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('returns 404 when the project disappears during toggle', async () => {
			mockSelectResult(mockDb, [{ requireSignoff: true }]);
			mockUpdateReturning(mockDb, []);

			await expect(actions.toggleSignoff(createActionEvent())).rejects.toMatchObject({
				status: 404,
				body: { message: 'Project not found' }
			});
		});
	});
});
