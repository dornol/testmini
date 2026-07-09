import { describe, expect, it } from 'vitest';
import { validateCreateTestCaseDataSetInput } from './test-case-dataset-validation';

describe('test-case-dataset-validation', () => {
	it('rejects non-plain values objects', async () => {
		const result = validateCreateTestCaseDataSetInput({ name: 'Dataset', values: new Date() });

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'values must be an object' });
	});
});
