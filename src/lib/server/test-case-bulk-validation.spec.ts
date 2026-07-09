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

	it('rejects unknown fields', async () => {
		const result = validateBulkTestCasePayload({
			action: 'clone',
			testCaseIds: [1],
			force: true
		});

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Unknown field(s): force' });
	});

	it('rejects fields that do not belong to the selected action', async () => {
		const result = validateBulkTestCasePayload({
			action: 'delete',
			testCaseIds: [1],
			priority: 'HIGH'
		});

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Unknown field(s): priority' });
	});
});
