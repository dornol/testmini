import { describe, expect, it } from 'vitest';
import { validateRequirementFields } from './requirement-validation';

describe('requirement-validation', () => {
	it('rejects non-plain request bodies', async () => {
		const result = validateRequirementFields(new Date());

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Invalid request body' });
	});

	it('accepts plain requirement fields', () => {
		const result = validateRequirementFields(
			{
				title: 'Login support',
				externalId: 'REQ-1',
				description: 'Users can log in',
				source: 'PRD'
			},
			{ requireTitle: true }
		);

		expect(result).toEqual({
			title: 'Login support',
			externalId: 'REQ-1',
			description: 'Users can log in',
			source: 'PRD'
		});
	});
});
