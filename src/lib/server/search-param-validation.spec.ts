import { describe, expect, it } from 'vitest';
import { parsePositiveIntegerSearchParam } from './search-param-validation';

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
});
