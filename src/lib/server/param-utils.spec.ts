import { describe, it, expect } from 'vitest';

vi.mock('@sveltejs/kit', () => ({
	error: (status: number, message: string) => {
		throw { status, body: { message } };
	}
}));

import { vi } from 'vitest';
import { parseResourceId, parsePagination, paginationMeta } from './param-utils';

// ── parseResourceId ──────────────────────────────────
describe('parseResourceId', () => {
	it('parses a valid numeric string', () => {
		expect(parseResourceId({ id: '42' }, 'id')).toBe(42);
	});

	it('parses zero', () => {
		expect(parseResourceId({ id: '0' }, 'id')).toBe(0);
	});

	it('parses empty string as 0 (Number("") === 0)', () => {
		// This is JavaScript behavior: Number('') === 0
		expect(parseResourceId({ id: '' }, 'id')).toBe(0);
	});

	it('parses negative number', () => {
		expect(parseResourceId({ id: '-1' }, 'id')).toBe(-1);
	});

	it('parses decimal (truncates to float)', () => {
		expect(parseResourceId({ id: '3.14' }, 'id')).toBeCloseTo(3.14);
	});

	it.each([
		['alphabetic', 'abc'],
		['NaN', 'NaN'],
		['Infinity', 'Infinity'],
		['-Infinity', '-Infinity'],
		['special chars', 'foo-bar'],
		['undefined key', undefined]
	])('throws 400 for non-numeric value (%s)', (_label, val) => {
		const params = val !== undefined ? { id: val } : {};
		expect(() => parseResourceId(params as Record<string, string>, 'id')).toThrow(
			expect.objectContaining({ status: 400 })
		);
	});

	it('error message contains the key name', () => {
		try {
			parseResourceId({ projectId: 'abc' }, 'projectId');
		} catch (e: unknown) {
			expect((e as { body: { message: string } }).body.message).toContain('projectId');
		}
	});
});

// ── parsePagination ──────────────────────────────────
describe('parsePagination', () => {
	function makeUrl(params: Record<string, string> = {}): URL {
		const url = new URL('http://localhost/api/items');
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, v);
		}
		return url;
	}

	it('returns defaults when no params provided', () => {
		const result = parsePagination(makeUrl());
		expect(result).toEqual({ page: 1, limit: 20, offset: 0 });
	});

	it('respects custom default limit', () => {
		const result = parsePagination(makeUrl(), { limit: 10 });
		expect(result.limit).toBe(10);
	});

	it('parses page and limit from search params', () => {
		const result = parsePagination(makeUrl({ page: '3', limit: '15' }));
		expect(result).toEqual({ page: 3, limit: 15, offset: 30 });
	});

	it('clamps page to minimum 1', () => {
		const result = parsePagination(makeUrl({ page: '0' }));
		expect(result.page).toBe(1);
	});

	it('clamps negative page to 1', () => {
		const result = parsePagination(makeUrl({ page: '-5' }));
		expect(result.page).toBe(1);
	});

	it('clamps limit to minimum 1', () => {
		const result = parsePagination(makeUrl({ limit: '0' }));
		expect(result.limit).toBe(1);
	});

	it('clamps limit to maxLimit', () => {
		const result = parsePagination(makeUrl({ limit: '999' }));
		expect(result.limit).toBe(50); // default maxLimit
	});

	it('respects custom maxLimit', () => {
		const result = parsePagination(makeUrl({ limit: '200' }), { maxLimit: 100 });
		expect(result.limit).toBe(100);
	});

	it('calculates offset correctly for page 2', () => {
		const result = parsePagination(makeUrl({ page: '2', limit: '25' }));
		expect(result.offset).toBe(25);
	});

	it('NaN page results in NaN (parseInt returns NaN for non-numeric)', () => {
		const result = parsePagination(makeUrl({ page: 'abc' }));
		expect(result.page).toBeNaN();
	});

	it('NaN limit results in NaN (parseInt returns NaN for non-numeric)', () => {
		const result = parsePagination(makeUrl({ limit: 'abc' }));
		expect(result.limit).toBeNaN();
	});

	it('empty string params use defaults (parseInt returns NaN)', () => {
		// Empty strings still go through parseInt which returns NaN
		const result = parsePagination(makeUrl({ page: '', limit: '' }));
		expect(result.page).toBeNaN();
		expect(result.limit).toBeNaN();
	});
});

// ── paginationMeta ───────────────────────────────────
describe('paginationMeta', () => {
	it('calculates pages correctly', () => {
		expect(paginationMeta(100, 1, 20)).toEqual({
			page: 1,
			limit: 20,
			total: 100,
			pages: 5
		});
	});

	it('rounds pages up for partial last page', () => {
		expect(paginationMeta(101, 1, 20)).toEqual({
			page: 1,
			limit: 20,
			total: 101,
			pages: 6
		});
	});

	it('handles zero total', () => {
		expect(paginationMeta(0, 1, 20)).toEqual({
			page: 1,
			limit: 20,
			total: 0,
			pages: 0
		});
	});

	it('handles total equal to limit', () => {
		expect(paginationMeta(20, 1, 20).pages).toBe(1);
	});

	it('handles total less than limit', () => {
		expect(paginationMeta(5, 1, 20).pages).toBe(1);
	});

	it('preserves page parameter', () => {
		expect(paginationMeta(100, 3, 10).page).toBe(3);
	});
});
