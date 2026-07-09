import { describe, expect, it } from 'vitest';
import {
	validateCreateTestCaseDataSetInput,
	validateUpdateTestCaseDataSetInput
} from './test-case-dataset-validation';

describe('test-case-dataset-validation', () => {
	it('rejects control characters in data set names', async () => {
		const result = validateCreateTestCaseDataSetInput({
			name: 'Set\u0000A',
			values: { browser: 'Chrome' }
		});

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'name must not contain control characters'
		});
	});

	it('rejects control characters in values keys', async () => {
		const result = validateUpdateTestCaseDataSetInput({
			values: { 'browser\u0000name': 'Chrome' }
		});

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'values keys must not contain control characters'
		});
	});

	it('rejects non-plain values objects', async () => {
		const result = validateCreateTestCaseDataSetInput({ name: 'Dataset', values: new Date() });

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'values must be an object' });
	});
});
