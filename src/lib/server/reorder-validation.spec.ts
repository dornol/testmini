import { describe, expect, it } from 'vitest';
import { validateRequestBody, validateTestCaseReorderItems } from './reorder-validation';

describe('reorder-validation', () => {
	it('rejects non-plain request bodies', async () => {
		const result = validateRequestBody(new Date());

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Invalid request body' });
	});

	it('rejects non-plain reorder items', async () => {
		const result = validateTestCaseReorderItems([new Date()]);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'items 1 must be an object'
		});
	});
});
