import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockChangePassword = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	oidcProvider: {
		id: 'id',
		name: 'name',
		slug: 'slug',
		iconUrl: 'icon_url',
		displayOrder: 'display_order',
		enabled: 'enabled'
	},
	oidcAccount: {
		id: 'id',
		userId: 'user_id',
		providerId: 'provider_id',
		externalId: 'external_id',
		email: 'email',
		name: 'name'
	},
	userPreference: {
		userId: 'user_id'
	}
}));
vi.mock('$lib/server/db/auth.schema', () => ({
	account: {
		id: 'id',
		userId: 'user_id',
		providerId: 'provider_id'
	},
	user: {
		id: 'id',
		name: 'name',
		email: 'email',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => ['asc', a]),
	count: vi.fn(() => 'count')
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn().mockReturnValue(testUser)
}));
vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			changePassword: (...args: unknown[]) => mockChangePassword(...args)
		}
	}
}));

const { actions } = await import('./+page.server');
const MAX_PROFILE_FORM_BODY_SIZE = 16 * 1024;

function createFormData(accountId: string): FormData {
	const formData = new FormData();
	formData.set('accountId', accountId);
	return formData;
}

function createNameFormData(value: FormDataEntryValue): FormData {
	const formData = new FormData();
	formData.set('name', value);
	return formData;
}

function createPasswordFormData(values: {
	currentPassword?: FormDataEntryValue;
	newPassword?: FormDataEntryValue;
	confirmPassword?: FormDataEntryValue;
}): FormData {
	const formData = new FormData();
	if (values.currentPassword !== undefined) formData.set('currentPassword', values.currentPassword);
	if (values.newPassword !== undefined) formData.set('newPassword', values.newPassword);
	if (values.confirmPassword !== undefined) formData.set('confirmPassword', values.confirmPassword);
	return formData;
}

function chainWithResult(result: unknown[]) {
	const chain: Record<string, unknown> = {};
	for (const method of ['from', 'where', 'innerJoin', 'orderBy']) {
		chain[method] = vi.fn().mockReturnValue(chain);
	}
	chain.then = (resolve: (value: unknown[]) => void) => Promise.resolve(result).then(resolve);
	return chain;
}

function mockUnlinkTransaction(selectResults: unknown[][]) {
	let selectIndex = 0;
	const txDeleteWhere = vi.fn().mockResolvedValue(undefined);
	const txDelete = vi.fn(() => ({ where: txDeleteWhere }));
	const txSelect = vi.fn(() => chainWithResult(selectResults[selectIndex++]));
	mockDb.transaction.mockImplementationOnce(async (fn) =>
		fn({ select: txSelect, delete: txDelete })
	);
	return { txDeleteWhere, txDelete, txSelect };
}

describe('/account/profile +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('actions.updateName', () => {
		it('should reject oversized form bodies before updating', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createNameFormData('Updated Name'),
				headers: { 'content-length': String(MAX_PROFILE_FORM_BODY_SIZE + 1) },
				user: testUser
			});

			await expect(actions.updateName(event)).rejects.toMatchObject({
				status: 413,
				body: { message: 'Profile form body is too large' }
			});
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should update name on success', async () => {
			mockUpdateReturning(mockDb, [{ id: testUser.id }]);

			const event = createMockEvent({
				method: 'POST',
				formData: createNameFormData(' Updated Name '),
				user: testUser
			});

			const result = await actions.updateName(event);

			expect(result).toMatchObject({ nameSuccess: true });
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should reject file values for name before updating', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createNameFormData(new File(['content'], 'name.txt')),
				user: testUser
			});

			const result = await actions.updateName(event);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Name is required (1-100 characters)' }
			});
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject control characters in name before updating', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createNameFormData('Valid\u0000Name'),
				user: testUser
			});

			const result = await actions.updateName(event);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Name is required (1-100 characters)' }
			});
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 404 when user disappears before update', async () => {
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				formData: createNameFormData('Updated Name'),
				user: testUser
			});

			const result = await actions.updateName(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
		});
	});

	describe('actions.changePassword', () => {
		it('should reject oversized form bodies before calling auth', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createPasswordFormData({
					currentPassword: 'current-password',
					newPassword: 'new-password',
					confirmPassword: 'new-password'
				}),
				headers: { 'content-length': String(MAX_PROFILE_FORM_BODY_SIZE + 1) },
				user: testUser
			});

			await expect(actions.changePassword(event)).rejects.toMatchObject({
				status: 413,
				body: { message: 'Profile form body is too large' }
			});
			expect(mockChangePassword).not.toHaveBeenCalled();
		});

		it('should reject file values for password fields before calling auth', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createPasswordFormData({
					currentPassword: new File(['content'], 'password.txt'),
					newPassword: 'new-password',
					confirmPassword: 'new-password'
				}),
				user: testUser
			});

			const result = await actions.changePassword(event);

			expect(result).toMatchObject({
				status: 400,
				data: { passwordError: 'All fields are required' }
			});
			expect(mockChangePassword).not.toHaveBeenCalled();
		});

		it('should reject oversized new passwords before calling auth', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createPasswordFormData({
					currentPassword: 'current-password',
					newPassword: 'x'.repeat(1025),
					confirmPassword: 'x'.repeat(1025)
				}),
				user: testUser
			});

			const result = await actions.changePassword(event);

			expect(result).toMatchObject({
				status: 400,
				data: { passwordError: 'Password must be 1024 characters or less' }
			});
			expect(mockChangePassword).not.toHaveBeenCalled();
		});
	});

	describe('actions.unlink', () => {
		it('should reject invalid content-length before querying ownership', async () => {
			const event = createMockEvent({
				method: 'POST',
				formData: createFormData('7'),
				headers: { 'content-length': 'invalid' },
				user: testUser
			});

			await expect(actions.unlink(event)).rejects.toMatchObject({
				status: 400,
				body: { message: 'Invalid content-length header' }
			});
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it.each(['', '0', '-1', '+1', '01', '1.5', '1e3', ' 7', '7 ', 'Infinity', '9007199254740992'])(
			'should reject invalid accountId %s before querying ownership',
			async (accountId) => {
				const event = createMockEvent({
					method: 'POST',
					formData: createFormData(accountId),
					user: testUser
				});

				const result = await actions.unlink(event);

				expect(result).toMatchObject({ status: 400, data: { error: 'Invalid account ID' } });
				expect(mockDb.select).not.toHaveBeenCalled();
				expect(mockDb.delete).not.toHaveBeenCalled();
			}
		);

		it('should scope the unlink delete to the authenticated user', async () => {
			const { txDeleteWhere, txDelete, txSelect } = mockUnlinkTransaction([
				[{ id: 7 }],
				[{ count: 2 }],
				[]
			]);

			const event = createMockEvent({
				method: 'POST',
				formData: createFormData('7'),
				user: testUser
			});

			const result = await actions.unlink(event);

			expect(result).toEqual({ unlinkSuccess: true });
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
			expect(txSelect).toHaveBeenCalledTimes(3);
			expect(txDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'id' }));
			expect(txDeleteWhere).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 7],
					['user_id', testUser.id]
				])
			);
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});
});
