import { describe, expect, it } from 'vitest';
import { validateBulkTestCasePayload } from './test-case-bulk-validation';

describe('test-case-bulk-validation', () => {
	it('rejects non-plain request bodies', async () => {
		const result = validateBulkTestCasePayload(new Date());

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Invalid request body' });
	});

	it('accepts plain bulk payloads', () => {
		const result = validateBulkTestCasePayload({
			action: 'setPriority',
			testCaseIds: [1, 2],
			priority: 'HIGH'
		});

		expect(result).toEqual({
			action: 'setPriority',
			testCaseIds: [1, 2],
			priority: 'HIGH'
		});
	});
});
