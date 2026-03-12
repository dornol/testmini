import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sveltejs/kit', () => ({
	error: (status: number, message: string) => {
		throw { status, body: { message } };
	},
	json: (data: unknown, init?: { status?: number }) => {
		return new Response(JSON.stringify(data), {
			status: init?.status ?? 200,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}));

const mockParseJsonBody = vi.fn();
vi.mock('$lib/server/auth-utils', () => ({
	parseJsonBody: (...args: unknown[]) => mockParseJsonBody(...args)
}));

vi.mock('$lib/server/errors', () => ({
	badRequest: (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 400 })
}));

// drizzle-orm stubs
vi.mock('drizzle-orm', async (importOriginal) => {
	const actual = await importOriginal<typeof import('drizzle-orm')>();
	return {
		...actual,
		eq: vi.fn((_col: unknown, val: unknown) => ({ _type: 'eq', val })),
		and: vi.fn((...args: unknown[]) => ({ _type: 'and', args }))
	};
});

vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', projectId: 'project_id', status: 'status' }
}));

// Mock $lib/server/db with a factory that uses inline mock creation
vi.mock('$lib/server/db', async () => {
	const { createMockDb } = await import('./test-helpers/mock-db');
	return { db: createMockDb() };
});

import { db } from '$lib/server/db';
import { findOrFail, parseAndValidate, buildUpdates, deleteResource } from './crud-helpers';
import { mockSelectResult } from './test-helpers/mock-db';
import type { SQL, Table } from 'drizzle-orm';

// Cast the mocked db for use with test helpers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = db as any;

const fakeTable = {} as Table;
const fakeIdCol = {} as SQL;
const fakeProjectIdCol = {} as SQL;

// ── findOrFail ───────────────────────────────────────
describe('findOrFail', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns the first matching row', async () => {
		mockSelectResult(mockDb, [{ id: 1, name: 'Resource' }]);

		const result = await findOrFail(fakeTable, fakeIdCol, fakeProjectIdCol, 1, 10, 'Test Case');
		expect(result).toEqual({ id: 1, name: 'Resource' });
	});

	it('throws 404 when no rows found', async () => {
		mockSelectResult(mockDb, []);

		await expect(
			findOrFail(fakeTable, fakeIdCol, fakeProjectIdCol, 999, 10, 'Test Case')
		).rejects.toMatchObject({ status: 404 });
	});

	it('error message includes label', async () => {
		mockSelectResult(mockDb, []);

		try {
			await findOrFail(fakeTable, fakeIdCol, fakeProjectIdCol, 999, 10, 'Test Suite');
		} catch (e: unknown) {
			expect((e as { body: { message: string } }).body.message).toBe('Test Suite not found');
		}
	});

	it('returns only the first row even when multiple match', async () => {
		mockSelectResult(mockDb, [{ id: 1 }, { id: 2 }]);

		const result = await findOrFail(fakeTable, fakeIdCol, fakeProjectIdCol, 1, 10, 'Item');
		expect(result).toEqual({ id: 1 });
	});
});

// ── parseAndValidate ─────────────────────────────────
describe('parseAndValidate', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns parsed data on valid input', async () => {
		const request = new Request('http://localhost', {
			method: 'POST',
			body: JSON.stringify({ name: 'Test' })
		});
		mockParseJsonBody.mockResolvedValue({ name: 'Test' });

		const schema = {
			safeParse: (data: unknown) => ({ success: true as const, data })
		};

		const result = await parseAndValidate(request, schema);
		expect(result).toEqual({ name: 'Test' });
	});

	it('throws badRequest response on invalid input', async () => {
		const request = new Request('http://localhost', {
			method: 'POST',
			body: JSON.stringify({})
		});
		mockParseJsonBody.mockResolvedValue({});

		const schema = {
			safeParse: () => ({
				success: false as const,
				error: { flatten: () => ({ fieldErrors: { name: ['Required'] } }) }
			})
		};

		try {
			await parseAndValidate(request, schema);
			expect.fail('Should have thrown');
		} catch (e: unknown) {
			const response = e as Response;
			expect(response.status).toBe(400);
		}
	});
});

// ── buildUpdates ─────────────────────────────────────
describe('buildUpdates', () => {
	it('includes only defined fields', () => {
		const data = { name: 'New', description: undefined, status: 'ACTIVE' };
		const result = buildUpdates(data, ['name', 'description', 'status']);
		expect(result).toEqual({ name: 'New', status: 'ACTIVE' });
	});

	it('returns null when no fields are defined', () => {
		const data = { name: undefined, status: undefined };
		const result = buildUpdates(data, ['name', 'status']);
		expect(result).toBeNull();
	});

	it('returns null for empty fields array', () => {
		const data = { name: 'Test' };
		const result = buildUpdates(data, []);
		expect(result).toBeNull();
	});

	it('includes falsy but defined values', () => {
		const data = { name: '', count: 0, active: false };
		const result = buildUpdates(data, ['name', 'count', 'active']);
		expect(result).toEqual({ name: '', count: 0, active: false });
	});

	it('includes null values', () => {
		const data = { name: null as unknown as string };
		const result = buildUpdates(data, ['name']);
		expect(result).toEqual({ name: null });
	});

	it('ignores fields not in the fields array', () => {
		const data = { name: 'New', extra: 'ignored' };
		const result = buildUpdates(data, ['name']);
		expect(result).toEqual({ name: 'New' });
		expect(result).not.toHaveProperty('extra');
	});
});

// ── deleteResource ───────────────────────────────────
describe('deleteResource', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns success response after deleting', async () => {
		mockSelectResult(mockDb, [{ id: 5, projectId: 10 }]);

		const response = await deleteResource(fakeTable, fakeIdCol, fakeProjectIdCol, 5, 10, 'Tag');
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body).toEqual({ success: true });
	});

	it('throws 404 when resource does not exist', async () => {
		mockSelectResult(mockDb, []);

		await expect(
			deleteResource(fakeTable, fakeIdCol, fakeProjectIdCol, 999, 10, 'Tag')
		).rejects.toMatchObject({ status: 404 });
	});

	it('calls db.delete after successful findOrFail', async () => {
		mockSelectResult(mockDb, [{ id: 5 }]);

		await deleteResource(fakeTable, fakeIdCol, fakeProjectIdCol, 5, 10, 'Tag');

		expect(mockDb.delete).toHaveBeenCalled();
	});
});
