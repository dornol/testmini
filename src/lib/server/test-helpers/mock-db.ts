/**
 * Drizzle-orm mock factory for API integration tests.
 * Provides chainable query builders that mimic drizzle's fluent API.
 */
import { vi } from 'vitest';

function chainable(terminal?: () => unknown) {
	const resolver = terminal ?? (() => []);
	const chain: Record<string, unknown> = {};
	const methods = [
		'from',
		'where',
		'orderBy',
		'limit',
		'offset',
		'innerJoin',
		'leftJoin',
		'groupBy',
		'as',
		'set',
		'values',
		'returning',
		'onConflictDoNothing',
		'onConflictDoUpdate',
		'$dynamic'
	];

	for (const m of methods) {
		chain[m] = vi.fn().mockImplementation(() => chain);
	}

	// Make chain thenable so `await db.select().from()...` resolves
	chain.then = (resolve: (v: unknown) => void) => Promise.resolve(resolver()).then(resolve);

	return chain;
}

function rawSql(strings: TemplateStringsArray, ...values: unknown[]) {
	const text = strings.reduce(
		(acc, part, index) => `${acc}${part}${index < values.length ? String(values[index]) : ''}`,
		''
	);
	return { as: vi.fn().mockReturnValue({ text }), text };
}

export const mockCol = vi.fn((column: unknown) => column);

export function createMockDb() {
	const selectChain = chainable();
	const insertChain = chainable();
	const updateChain = chainable();
	const deleteChain = chainable();

	const db = {
		select: vi.fn().mockReturnValue(selectChain),
		selectDistinct: vi.fn().mockReturnValue(selectChain),
		insert: vi.fn().mockReturnValue(insertChain),
		update: vi.fn().mockReturnValue(updateChain),
		delete: vi.fn().mockReturnValue(deleteChain),
		transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
			const txSelectChain = chainable();
			const txInsertChain = chainable();
			const txUpdateChain = chainable();
			const txDeleteChain = chainable();
			const tx = {
				select: vi.fn().mockReturnValue(txSelectChain),
				insert: vi.fn().mockReturnValue(txInsertChain),
				update: vi.fn().mockReturnValue(txUpdateChain),
				delete: vi.fn().mockReturnValue(txDeleteChain)
			};
			return fn(tx);
		}),
		execute: vi.fn().mockResolvedValue([]),
		query: {
			testCase: { findFirst: vi.fn() },
			testRun: { findFirst: vi.fn() },
			testExecution: { findFirst: vi.fn() },
			testCaseVersion: { findFirst: vi.fn() },
			projectMember: { findFirst: vi.fn() },
			testCaseGroup: { findFirst: vi.fn() },
			priorityConfig: { findFirst: vi.fn() },
			tag: { findFirst: vi.fn() },
			testCaseTag: { findFirst: vi.fn() },
			testSuite: { findFirst: vi.fn() },
			testPlan: { findFirst: vi.fn() },
			testCaseTemplate: { findFirst: vi.fn() },
			requirement: { findFirst: vi.fn() },
			exploratorySession: { findFirst: vi.fn() },
			project: { findFirst: vi.fn() },
			release: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
			testPlanSignoff: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
			testCycle: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
			module: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
			environmentConfig: { findFirst: vi.fn() },
			customField: { findFirst: vi.fn() },
			savedFilter: { findFirst: vi.fn() },
			projectWebhook: { findFirst: vi.fn() },
			sharedDataSet: { findFirst: vi.fn() },
			issueLink: { findFirst: vi.fn() }
		} as Record<
			string,
			{ findFirst: ReturnType<typeof vi.fn>; findMany?: ReturnType<typeof vi.fn> }
		>,
		_chains: { select: selectChain, insert: insertChain, update: updateChain, delete: deleteChain },
		sql: Object.assign(vi.fn(rawSql), { raw: vi.fn((text: string) => ({ text })) }),
		col: mockCol
	};

	return db;
}

/**
 * Sets what the select chain resolves to.
 */
export function mockSelectResult(db: ReturnType<typeof createMockDb>, result: unknown[]) {
	const chain = chainable(() => result);
	db.select.mockReturnValue(chain);
	return chain;
}

/**
 * Sets what the insert().values().returning() chain resolves to.
 */
export function mockInsertReturning(db: ReturnType<typeof createMockDb>, result: unknown[]) {
	const chain = chainable(() => result);
	db.insert.mockReturnValue(chain);
	return chain;
}

/**
 * Sets what the update().set().where().returning() chain resolves to.
 */
export function mockUpdateReturning(db: ReturnType<typeof createMockDb>, result: unknown[]) {
	const chain = chainable(() => result);
	db.update.mockReturnValue(chain);
	return chain;
}

/**
 * Sets what the delete().where().returning() chain resolves to.
 */
export function mockDeleteReturning(db: ReturnType<typeof createMockDb>, result: unknown[]) {
	const chain = chainable(() => result);
	db.delete.mockReturnValue(chain);
	return chain;
}
