import { describe, expect, it } from 'vitest';
import {
	validateTestCasePatchPayload,
	validateTestCasePutPayload,
	validateTestCaseVersionFields
} from './test-case-update-validation';

describe('test-case-update-validation', () => {
	it('rejects non-plain patch bodies', async () => {
		const result = validateTestCasePatchPayload(new Date());

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'Request body must be an object'
		});
	});

	it('rejects non-plain customFields objects', async () => {
		const result = validateTestCasePatchPayload({
			customFields: new (class CustomFields {
				value = 'x';
			})()
		});

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'customFields must be an object'
		});
	});

	it('rejects non-plain step objects', async () => {
		const result = validateTestCasePutPayload({
			title: 'Login works',
			priority: 'HIGH',
			revision: 1,
			steps: [new Date()]
		});

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'steps[0] must be an object'
		});
	});

	it('accepts plain version field objects', () => {
		const result = validateTestCaseVersionFields({
			title: 'Login works',
			priority: 'MEDIUM',
			steps: [{ action: 'Open login page', expected: 'Login form is visible' }]
		});

		expect(result).toEqual({
			title: 'Login works',
			priority: 'MEDIUM',
			steps: [{ order: 1, action: 'Open login page', expected: 'Login form is visible' }]
		});
	});
});
