import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	appConfig: {
		id: 'id',
		appName: 'app_name',
		logoUrl: 'logo_url',
		faviconUrl: 'favicon_url'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/storage', () => ({
	saveFile: vi.fn(),
	deleteFile: vi.fn()
}));
vi.mock('$lib/server/cache', () => ({
	cacheDelete: vi.fn()
}));
vi.mock('node:crypto', () => ({
	randomUUID: () => 'test-uuid-1234'
}));

const { actions, load } = await import('./+page.server');
const { saveFile, deleteFile } = await import('$lib/server/storage');
const { cacheDelete } = await import('$lib/server/cache');

function createFormData(entries: Record<string, string | File>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(entries)) {
		if (v instanceof File) {
			fd.set(k, v);
		} else {
			fd.set(k, v);
		}
	}
	return fd;
}

function createActionEvent(
	user: NonNullable<App.Locals['user']> | null,
	formEntries: Record<string, string | File>
) {
	const formData = createFormData(formEntries);
	return {
		request: {
			formData: () => Promise.resolve(formData)
		},
		locals: {
			user: user ?? undefined,
			session: user ? { id: 'session-1' } : undefined,
			requestId: 'test-req'
		},
		url: new URL('http://localhost:5173/admin/branding')
	} as never;
}

function createTestFile(name: string, size: number, type: string): File {
	const buffer = new ArrayBuffer(size);
	return new File([buffer], name, { type });
}

describe('admin/branding +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.appConfig = { findFirst: vi.fn().mockResolvedValue(null) } as never;
	});

	describe('load', () => {
		it('should return config when it exists', async () => {
			const mockConfig = { id: 1, appName: 'TestApp', logoUrl: null, faviconUrl: null };
			(mockDb.query as Record<string, unknown>).appConfig = {
				findFirst: vi.fn().mockResolvedValue(mockConfig)
			};

			const result = (await load({} as never)) as Record<string, unknown>;
			expect(result.config).toEqual(mockConfig);
		});

		it('should return null config when table does not exist', async () => {
			(mockDb.query as Record<string, unknown>).appConfig = {
				findFirst: vi.fn().mockRejectedValue(new Error('table not found'))
			};

			const result = (await load({} as never)) as Record<string, unknown>;
			expect(result.config).toBeNull();
		});
	});

	describe('save action', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { appName: 'MyApp' });
			const result = await actions.save(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should return 401 when not authenticated', async () => {
			const event = createActionEvent(null, { appName: 'MyApp' });
			await expect(actions.save(event)).rejects.toThrow();
		});

		it('should return 400 when appName is empty', async () => {
			const event = createActionEvent(adminUser, { appName: '  ' });
			const result = await actions.save(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'App name is required' } });
		});

		it('should insert new config when none exists', async () => {
			(mockDb.query as Record<string, unknown>).appConfig = {
				findFirst: vi.fn().mockResolvedValue(null)
			};

			const event = createActionEvent(adminUser, { appName: 'NewApp' });
			const result = await actions.save(event);

			expect(result).toMatchObject({ success: true });
			expect(mockDb.insert).toHaveBeenCalled();
			expect(cacheDelete).toHaveBeenCalledWith('global:branding');
		});

		it('should update existing config', async () => {
			(mockDb.query as Record<string, unknown>).appConfig = {
				findFirst: vi.fn().mockResolvedValue({
					id: 1,
					appName: 'OldApp',
					logoUrl: null,
					faviconUrl: null
				})
			};

			const event = createActionEvent(adminUser, { appName: 'UpdatedApp' });
			const result = await actions.save(event);

			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
			expect(cacheDelete).toHaveBeenCalledWith('global:branding');
		});

		it('should return 400 for logo file too large', async () => {
			(mockDb.query as Record<string, unknown>).appConfig = {
				findFirst: vi.fn().mockResolvedValue(null)
			};

			const bigFile = createTestFile('logo.png', 3 * 1024 * 1024, 'image/png');
			const event = createActionEvent(adminUser, {
				appName: 'MyApp',
				logo: bigFile as unknown as string
			});
			const result = await actions.save(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Logo file too large (max 2MB)' } });
		});

		it('should return 400 for invalid logo file type', async () => {
			(mockDb.query as Record<string, unknown>).appConfig = {
				findFirst: vi.fn().mockResolvedValue(null)
			};

			const badFile = createTestFile('logo.exe', 100, 'application/octet-stream');
			const event = createActionEvent(adminUser, {
				appName: 'MyApp',
				logo: badFile as unknown as string
			});
			const result = await actions.save(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Invalid logo file type' }
			});
		});

		it('should upload logo file on success', async () => {
			(mockDb.query as Record<string, unknown>).appConfig = {
				findFirst: vi.fn().mockResolvedValue(null)
			};

			const logoFile = createTestFile('logo.png', 1000, 'image/png');
			const event = createActionEvent(adminUser, {
				appName: 'MyApp',
				logo: logoFile as unknown as string
			});
			const result = await actions.save(event);

			expect(result).toMatchObject({ success: true });
			expect(saveFile).toHaveBeenCalledWith('branding/test-uuid-1234.png', expect.any(Buffer));
		});

		it('should remove logo when removeLogo is true', async () => {
			(mockDb.query as Record<string, unknown>).appConfig = {
				findFirst: vi.fn().mockResolvedValue({
					id: 1,
					appName: 'App',
					logoUrl: '/api/branding/branding/old-logo.png',
					faviconUrl: null
				})
			};

			const event = createActionEvent(adminUser, {
				appName: 'App',
				removeLogo: 'true'
			});
			const result = await actions.save(event);

			expect(result).toMatchObject({ success: true });
			expect(deleteFile).toHaveBeenCalledWith('branding/old-logo.png');
		});

		it('should return 400 for favicon file too large', async () => {
			(mockDb.query as Record<string, unknown>).appConfig = {
				findFirst: vi.fn().mockResolvedValue(null)
			};

			const bigFile = createTestFile('favicon.ico', 3 * 1024 * 1024, 'image/x-icon');
			const event = createActionEvent(adminUser, {
				appName: 'MyApp',
				favicon: bigFile as unknown as string
			});
			const result = await actions.save(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Favicon file too large (max 2MB)' }
			});
		});

		it('should return 400 for invalid favicon file type', async () => {
			(mockDb.query as Record<string, unknown>).appConfig = {
				findFirst: vi.fn().mockResolvedValue(null)
			};

			const badFile = createTestFile('favicon.exe', 100, 'application/octet-stream');
			const event = createActionEvent(adminUser, {
				appName: 'MyApp',
				favicon: badFile as unknown as string
			});
			const result = await actions.save(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Invalid favicon file type' }
			});
		});
	});
});
