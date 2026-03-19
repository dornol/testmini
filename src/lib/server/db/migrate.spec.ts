import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMigrate = vi.fn().mockResolvedValue(undefined);
const mockEnd = vi.fn().mockResolvedValue(undefined);
const mockDrizzle = vi.fn().mockReturnValue({ __drizzleDb: true });
const mockPostgres = vi.fn().mockReturnValue({ end: mockEnd });

vi.mock('drizzle-orm/postgres-js/migrator', () => ({
	migrate: (...args: unknown[]) => mockMigrate(...args)
}));

vi.mock('postgres', () => ({
	default: (...args: unknown[]) => mockPostgres(...args)
}));

vi.mock('drizzle-orm/postgres-js', () => ({
	drizzle: (...args: unknown[]) => mockDrizzle(...args)
}));

const mockLogger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn()
};

vi.mock('$lib/server/logger', () => ({
	logger: mockLogger
}));

const mockReadFileSync = vi.fn().mockReturnValue(
	JSON.stringify({
		entries: [
			{ tag: '0001_initial' },
			{ tag: '0002_add_users' }
		]
	})
);
const mockReaddirSync = vi.fn().mockReturnValue([
	'0001_initial.sql',
	'0002_add_users.sql'
]);

vi.mock('node:fs', () => ({
	readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
	readdirSync: (...args: unknown[]) => mockReaddirSync(...args)
}));

let mockEnv: Record<string, string | undefined> = {
	DATABASE_URL: 'postgres://localhost:5432/testdb'
};

vi.mock('$env/dynamic/private', () => ({
	get env() {
		return mockEnv;
	}
}));

// ---------------------------------------------------------------------------
// Reset the global migration flag between tests
// ---------------------------------------------------------------------------

const migrationKey = Symbol.for('__drizzle_migrated');

function resetMigrationFlag() {
	delete (globalThis as Record<symbol, boolean>)[migrationKey];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runMigrations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetMigrationFlag();
		mockEnv = { DATABASE_URL: 'postgres://localhost:5432/testdb' };
		mockMigrate.mockResolvedValue(undefined);
		mockEnd.mockResolvedValue(undefined);
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				entries: [
					{ tag: '0001_initial' },
					{ tag: '0002_add_users' }
				]
			})
		);
		mockReaddirSync.mockReturnValue([
			'0001_initial.sql',
			'0002_add_users.sql'
		]);
	});

	it('should run migrations successfully', async () => {
		const { runMigrations } = await import('./migrate');
		await runMigrations();

		expect(mockPostgres).toHaveBeenCalledWith('postgres://localhost:5432/testdb', { max: 1 });
		expect(mockDrizzle).toHaveBeenCalled();
		expect(mockMigrate).toHaveBeenCalled();
		expect(mockEnd).toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith('Database migrations applied successfully');
	});

	it('should be idempotent — skip on second call (globalThis flag)', async () => {
		const { runMigrations } = await import('./migrate');

		await runMigrations();
		expect(mockMigrate).toHaveBeenCalledTimes(1);

		await runMigrations();
		expect(mockMigrate).toHaveBeenCalledTimes(1); // still 1
	});

	it('should throw when DATABASE_URL is not set', async () => {
		mockEnv = {};
		const { runMigrations } = await import('./migrate');

		await expect(runMigrations()).rejects.toThrow('DATABASE_URL is not set');
	});

	it('should throw when DATABASE_URL is empty string', async () => {
		mockEnv = { DATABASE_URL: '' };
		const { runMigrations } = await import('./migrate');

		await expect(runMigrations()).rejects.toThrow('DATABASE_URL is not set');
	});

	it('should close the migration client even when migration fails', async () => {
		mockMigrate.mockRejectedValueOnce(new Error('migration syntax error'));

		const { runMigrations } = await import('./migrate');

		await expect(runMigrations()).rejects.toThrow('migration syntax error');
		expect(mockEnd).toHaveBeenCalled(); // finally block
	});

	it('should log error when migration fails', async () => {
		const err = new Error('migration failed');
		mockMigrate.mockRejectedValueOnce(err);

		const { runMigrations } = await import('./migrate');

		await expect(runMigrations()).rejects.toThrow('migration failed');
		expect(mockLogger.error).toHaveBeenCalledWith({ err }, 'Database migration failed');
	});

	it('should not set global flag when migration fails', async () => {
		mockMigrate.mockRejectedValueOnce(new Error('fail'));

		const { runMigrations } = await import('./migrate');

		await expect(runMigrations()).rejects.toThrow('fail');

		// Flag should not be set, so next call should attempt migration again
		mockMigrate.mockResolvedValueOnce(undefined);
		await runMigrations();
		expect(mockMigrate).toHaveBeenCalledTimes(2);
	});

	it('should re-throw the migration error', async () => {
		const originalError = new Error('unique constraint violation');
		mockMigrate.mockRejectedValueOnce(originalError);

		const { runMigrations } = await import('./migrate');

		await expect(runMigrations()).rejects.toBe(originalError);
	});
});

describe('checkMigrationIntegrity', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetMigrationFlag();
		mockEnv = { DATABASE_URL: 'postgres://localhost:5432/testdb' };
	});

	it('should pass when all SQL files have journal entries', async () => {
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				entries: [{ tag: '0001_init' }, { tag: '0002_users' }]
			})
		);
		mockReaddirSync.mockReturnValue(['0001_init.sql', '0002_users.sql']);

		const { runMigrations } = await import('./migrate');
		await expect(runMigrations()).resolves.toBeUndefined();
	});

	it('should throw when SQL files exist without journal entries', async () => {
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				entries: [{ tag: '0001_init' }]
			})
		);
		mockReaddirSync.mockReturnValue(['0001_init.sql', '0002_orphan.sql']);

		const { runMigrations } = await import('./migrate');

		await expect(runMigrations()).rejects.toThrow('Unregistered migration files found: 0002_orphan');
	});

	it('should log error for unregistered migration files', async () => {
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				entries: [{ tag: '0001_init' }]
			})
		);
		mockReaddirSync.mockReturnValue(['0001_init.sql', '0002_orphan.sql']);

		const { runMigrations } = await import('./migrate');

		await expect(runMigrations()).rejects.toThrow();
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unregistered migration files'));
	});

	it('should not invoke migrate when integrity check fails', async () => {
		mockReadFileSync.mockReturnValue(
			JSON.stringify({ entries: [] })
		);
		mockReaddirSync.mockReturnValue(['0001_orphan.sql']);

		const { runMigrations } = await import('./migrate');

		await expect(runMigrations()).rejects.toThrow();
		expect(mockMigrate).not.toHaveBeenCalled();
	});

	it('should ignore non-SQL files in the migrations directory', async () => {
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				entries: [{ tag: '0001_init' }]
			})
		);
		mockReaddirSync.mockReturnValue([
			'0001_init.sql',
			'README.md',
			'meta'  // directory name, no .sql extension
		]);

		const { runMigrations } = await import('./migrate');
		await expect(runMigrations()).resolves.toBeUndefined();
	});

	it('should list multiple unregistered files in error message', async () => {
		mockReadFileSync.mockReturnValue(
			JSON.stringify({ entries: [] })
		);
		mockReaddirSync.mockReturnValue(['0001_a.sql', '0002_b.sql', '0003_c.sql']);

		const { runMigrations } = await import('./migrate');

		await expect(runMigrations()).rejects.toThrow('0001_a, 0002_b, 0003_c');
	});
});
