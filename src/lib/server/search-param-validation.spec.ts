import { describe, expect, it } from 'vitest';
import {
	parseNonNegativeIntegerSearchParam,
	parseOptionalPositiveIntegerSearchParam,
	parsePositiveIntegerSearchParam,
	parsePositiveIntegerSearchParamStrict
} from './search-param-validation';

describe('search-param-validation', () => {
	describe('parsePositiveIntegerSearchParam', () => {
		it.each([null, '', ' ', 'abc', '0', '-1', '1.5', 'Infinity', '9007199254740992'])(
			'should return the default for invalid value %s',
			(value) => {
				expect(parsePositiveIntegerSearchParam(value, 7)).toBe(7);
			}
		);

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

		it.each(['0', '-1', '1.5', 'Infinity', '9007199254740992'])(
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

		it.each(['0', '-1', '1.5', 'Infinity', '9007199254740992'])(
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

		it.each(['-1', '1.5', 'Infinity', '9007199254740992'])(
			'should reject invalid value %s',
			(value) => {
				expect(() => parseNonNegativeIntegerSearchParam(value, 'offset')).toThrow('Invalid offset');
			}
		);
	});
});
