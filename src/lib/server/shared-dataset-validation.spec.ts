import { describe, expect, it } from 'vitest';
import { validateDataSetRows, validateRequestBody } from './shared-dataset-validation';

describe('shared-dataset-validation', () => {
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
