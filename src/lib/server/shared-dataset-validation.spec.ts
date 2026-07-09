import { describe, expect, it } from 'vitest';
import {
	validateDataSetName,
	validateDataSetParameters,
	validateDataSetRows,
	validateRequestBody
} from './shared-dataset-validation';

describe('shared-dataset-validation', () => {
	it('rejects control characters in data set names', async () => {
		const result = validateDataSetName('Login\u0000Data');

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'Name must not contain control characters'
		});
	});

	it('rejects control characters in parameter names', async () => {
		const result = validateDataSetParameters(['username', 'pass\u0000word']);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'Parameters must not contain control characters'
		});
	});

	it('rejects non-plain request bodies', async () => {
		const result = validateRequestBody(new Date());

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Invalid request body' });
	});

	it('rejects non-plain row objects', async () => {
		const result = validateDataSetRows([new Date()], ['name']);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'Row 1 must be an object'
		});
	});
});
