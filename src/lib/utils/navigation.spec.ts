import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadCollapsedGroups, saveCollapsedGroups, isDateRangeValid } from './navigation';

// Mock localStorage for node environment
const store: Record<string, string> = {};
const localStorageMock = {
	getItem: (key: string) => store[key] ?? null,
	setItem: (key: string, value: string) => { store[key] = value; },
	removeItem: (key: string) => { delete store[key]; },
	clear: () => { Object.keys(store).forEach(k => delete store[k]); },
	get length() { return Object.keys(store).length; },
	key: (i: number) => Object.keys(store)[i] ?? null
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('loadCollapsedGroups', () => {
	beforeEach(() => {
		localStorageMock.clear();
	});

	it('returns empty set when no stored data', () => {
		const result = loadCollapsedGroups(1);
		expect(result).toEqual(new Set());
	});

	it('loads stored group IDs', () => {
		localStorageMock.setItem('tc-collapsed-1', JSON.stringify([1, 2, 3]));
		const result = loadCollapsedGroups(1);
		expect(result).toEqual(new Set([1, 2, 3]));
	});

	it('handles corrupt JSON gracefully', () => {
		localStorageMock.setItem('tc-collapsed-1', 'not-json');
		const result = loadCollapsedGroups(1);
		expect(result).toEqual(new Set());
	});

	it('filters non-number values', () => {
		localStorageMock.setItem('tc-collapsed-1', JSON.stringify([1, 'bad', null, 3]));
		const result = loadCollapsedGroups(1);
		expect(result).toEqual(new Set([1, 3]));
	});

	it('uses project-specific keys', () => {
		localStorageMock.setItem('tc-collapsed-1', JSON.stringify([1]));
		localStorageMock.setItem('tc-collapsed-2', JSON.stringify([5]));
		expect(loadCollapsedGroups(1)).toEqual(new Set([1]));
		expect(loadCollapsedGroups(2)).toEqual(new Set([5]));
	});

	it('returns empty set for non-array stored value', () => {
		localStorageMock.setItem('tc-collapsed-1', JSON.stringify({ a: 1 }));
		const result = loadCollapsedGroups(1);
		expect(result).toEqual(new Set());
	});
});

describe('saveCollapsedGroups', () => {
	beforeEach(() => {
		localStorageMock.clear();
	});

	it('saves group IDs to localStorage', () => {
		saveCollapsedGroups(1, new Set([1, 2]));
		const stored = JSON.parse(localStorageMock.getItem('tc-collapsed-1')!);
		expect(stored).toEqual([1, 2]);
	});

	it('saves empty set', () => {
		saveCollapsedGroups(1, new Set());
		const stored = JSON.parse(localStorageMock.getItem('tc-collapsed-1')!);
		expect(stored).toEqual([]);
	});

	it('overwrites previous data', () => {
		saveCollapsedGroups(1, new Set([1]));
		saveCollapsedGroups(1, new Set([5, 6]));
		const stored = JSON.parse(localStorageMock.getItem('tc-collapsed-1')!);
		expect(stored).toEqual([5, 6]);
	});
});

describe('isDateRangeValid', () => {
	it('returns true when both dates are empty', () => {
		expect(isDateRangeValid('', '')).toBe(true);
	});

	it('returns true when only from is set', () => {
		expect(isDateRangeValid('2026-01-01', '')).toBe(true);
	});

	it('returns true when only to is set', () => {
		expect(isDateRangeValid('', '2026-12-31')).toBe(true);
	});

	it('returns true when from equals to', () => {
		expect(isDateRangeValid('2026-03-05', '2026-03-05')).toBe(true);
	});

	it('returns true when from is before to', () => {
		expect(isDateRangeValid('2026-01-01', '2026-12-31')).toBe(true);
	});

	it('returns false when from is after to', () => {
		expect(isDateRangeValid('2026-12-31', '2026-01-01')).toBe(false);
	});

	it('works with various date formats', () => {
		expect(isDateRangeValid('2025-06-15', '2026-03-01')).toBe(true);
		expect(isDateRangeValid('2026-03-01', '2025-06-15')).toBe(false);
	});
});
