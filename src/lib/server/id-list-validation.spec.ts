import { describe, expect, it } from 'vitest';
import {
	validatePositiveInteger,
	validatePositiveIntegerList,
	validateRequestBody
} from './id-list-validation';

describe('id-list-validation', () => {
	describe('validateRequestBody', () => {
		it('accepts plain objects', () => {
			expect(validateRequestBody({ ids: [1] })).toEqual({ ids: [1] });
		});

		it.each([null, [], new Date(), new (class CustomBody {})(), Object.create(null)])(
			'rejects non-plain object body %s',
			async (body) => {
				const result = validateRequestBody(body);

				expect(result).toBeInstanceOf(Response);
				expect((result as Response).status).toBe(400);
				expect(await (result as Response).json()).toEqual({
					error: 'Invalid request body'
				});
			}
		);
	});

	describe('validatePositiveInteger', () => {
		it('accepts positive safe integers', () => {
			expect(validatePositiveInteger(1, 'id')).toBe(1);
			expect(validatePositiveInteger('42', 'id')).toBe(42);
			expect(validatePositiveInteger(Number.MAX_SAFE_INTEGER, 'id')).toBe(Number.MAX_SAFE_INTEGER);
		});

		it('rejects unsafe integers', async () => {
			const numericResult = validatePositiveInteger(Number.MAX_SAFE_INTEGER + 1, 'id');
			const stringResult = validatePositiveInteger('9007199254740993', 'id');

			expect(numericResult).toBeInstanceOf(Response);
			expect((numericResult as Response).status).toBe(400);
			expect(await (numericResult as Response).json()).toEqual({
				error: 'id must be a positive integer'
			});
			expect(stringResult).toBeInstanceOf(Response);
			expect((stringResult as Response).status).toBe(400);
		});

		it.each(['abc', 0, -1, 1.5, '+1', '01', '1.5', '1e3', ' 1', '1 ', {}])(
			'rejects invalid integer value %s',
			async (value) => {
				const result = validatePositiveInteger(value, 'id');

				expect(result).toBeInstanceOf(Response);
				expect((result as Response).status).toBe(400);
				expect(await (result as Response).json()).toEqual({
					error: 'id must be a positive integer'
				});
			}
		);
	});

	describe('validatePositiveIntegerList', () => {
		it('rejects unsafe integers in lists', async () => {
			const result = validatePositiveIntegerList([1, Number.MAX_SAFE_INTEGER + 1], 'ids');

			expect(result).toBeInstanceOf(Response);
			expect((result as Response).status).toBe(400);
			expect(await (result as Response).json()).toEqual({
				error: 'ids items must be a positive integer'
			});
		});

		it.each([[['01']], [['1e3']], [[' 1']], [[{}]]])(
			'rejects invalid list item %j',
			async (ids) => {
				const result = validatePositiveIntegerList(ids, 'ids');

				expect(result).toBeInstanceOf(Response);
				expect((result as Response).status).toBe(400);
				expect(await (result as Response).json()).toEqual({
					error: 'ids items must be a positive integer'
				});
			}
		);
	});
});
