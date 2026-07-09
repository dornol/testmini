import { describe, expect, it } from 'vitest';
import {
	parseCanonicalNonNegativeInteger,
	parseCanonicalPositiveInteger,
	parseCanonicalPositiveIntegerList,
	parseNonNegativeIntegerSearchParam,
	parseOptionalPositiveIntegerSearchParam,
	parsePositiveIntegerSearchParam,
	parsePositiveIntegerSearchParamStrict,
	parseRequiredCanonicalPositiveIntegerList
} from './search-param-validation';

describe('search-param-validation', () => {
	describe('parseCanonicalPositiveInteger', () => {
		it('should parse canonical positive safe integers', () => {
			expect(parseCanonicalPositiveInteger('1')).toBe(1);
			expect(parseCanonicalPositiveInteger('42')).toBe(42);
		});

		it.each(['', '0', '-1', '+1', '01', '1.5', '1e3', ' 12', '12 ', '9007199254740992'])(
			'should reject non-canonical positive integer value %s',
			(value) => {
				expect(parseCanonicalPositiveInteger(value)).toBeNull();
			}
		);
	});

	describe('parseCanonicalNonNegativeInteger', () => {
		it('should parse canonical non-negative safe integers', () => {
			expect(parseCanonicalNonNegativeInteger('0')).toBe(0);
			expect(parseCanonicalNonNegativeInteger('42')).toBe(42);
		});

		it.each(['', '-1', '+1', '01', '1.5', '1e3', ' 12', '12 ', '9007199254740992'])(
			'should reject non-canonical non-negative integer value %s',
			(value) => {
				expect(parseCanonicalNonNegativeInteger(value)).toBeNull();
			}
		);
	});

	describe('parseCanonicalPositiveIntegerList', () => {
		it('should parse valid comma-separated positive integers', () => {
			expect(parseCanonicalPositiveIntegerList('1,2,42')).toEqual([1, 2, 42]);
		});

		it('should ignore invalid list tokens', () => {
			expect(
				parseCanonicalPositiveIntegerList('abc,0,-1,+1,01,1e3, 7,7 ,9007199254740992,5')
			).toEqual([5]);
		});
	});

	describe('parseRequiredCanonicalPositiveIntegerList', () => {
		it('should parse and deduplicate valid comma-separated positive integers', () => {
			expect(parseRequiredCanonicalPositiveIntegerList('1,1,2,42', 'ids')).toEqual([1, 2, 42]);
		});

		it.each(['', '1,,2', '1,0,2', '1,01,2', '1,1e3,2', '1, 2', '1,2 '])(
			'should reject malformed required integer list %s',
			(value) => {
				expect(() => parseRequiredCanonicalPositiveIntegerList(value, 'ids')).toThrow(
					'ids must contain only positive integers'
				);
			}
		);
	});

	describe('parsePositiveIntegerSearchParam', () => {
		it.each([
			null,
			'',
			' ',
			'abc',
			'0',
			'-1',
			'+1',
			'01',
			'1.5',
			'1e3',
			' 12',
			'12 ',
			'Infinity',
			'9007199254740992'
		])('should return the default for invalid value %s', (value) => {
			expect(parsePositiveIntegerSearchParam(value, 7)).toBe(7);
		});

		it('should parse positive safe integers', () => {
			expect(parsePositiveIntegerSearchParam('12', 1)).toBe(12);
		});

		it('should clamp values to the configured maximum', () => {
			expect(parsePositiveIntegerSearchParam('500', 20, { max: 50 })).toBe(50);
		});

		it('should reject invalid defaults at development time', () => {
			expect(() => parsePositiveIntegerSearchParam('1', 0)).toThrow(
				'defaultValue must be a positive safe integer'
			);
		});
	});

	describe('parseOptionalPositiveIntegerSearchParam', () => {
		it('should return null for absent values', () => {
			expect(parseOptionalPositiveIntegerSearchParam(null, 'id')).toBeNull();
			expect(parseOptionalPositiveIntegerSearchParam('', 'id')).toBeNull();
		});

		it.each(['0', '-1', '+1', '01', '1.5', '1e3', ' 12', '12 ', 'Infinity', '9007199254740992'])(
			'should reject invalid value %s',
			(value) => {
				expect(() => parseOptionalPositiveIntegerSearchParam(value, 'id')).toThrow('Invalid id');
			}
		);
	});

	describe('parsePositiveIntegerSearchParamStrict', () => {
		it('should return a default for absent values', () => {
			expect(parsePositiveIntegerSearchParamStrict(null, 'limit', { defaultValue: 20 })).toBe(20);
		});

		it('should clamp to max', () => {
			expect(parsePositiveIntegerSearchParamStrict('500', 'limit', { max: 100 })).toBe(100);
		});

		it.each(['0', '-1', '+1', '01', '1.5', '1e3', ' 12', '12 ', 'Infinity', '9007199254740992'])(
			'should reject invalid value %s',
			(value) => {
				expect(() => parsePositiveIntegerSearchParamStrict(value, 'limit')).toThrow(
					'Invalid limit'
				);
			}
		);
	});

	describe('parseNonNegativeIntegerSearchParam', () => {
		it('should allow zero and clamp to max', () => {
			expect(parseNonNegativeIntegerSearchParam('0', 'offset')).toBe(0);
			expect(parseNonNegativeIntegerSearchParam('500', 'offset', { max: 100 })).toBe(100);
		});

		it.each(['-1', '+1', '01', '1.5', '1e3', ' 12', '12 ', 'Infinity', '9007199254740992'])(
			'should reject invalid value %s',
			(value) => {
				expect(() => parseNonNegativeIntegerSearchParam(value, 'offset')).toThrow('Invalid offset');
			}
		);
	});
});
