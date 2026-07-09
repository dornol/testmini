import { describe, expect, it } from 'vitest';
import { validateCreateTemplateInput, validateUpdateTemplateInput } from './template-validation';

class TemplateStepPayload {
	action = 'Open page';
	expected = 'Page loads';
}

describe('template validation', () => {
	it('rejects non-plain create template step objects', async () => {
		const result = validateCreateTemplateInput({
			name: 'Login template',
			steps: [new TemplateStepPayload()]
		});

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Each step must be an object' });
	});

	it('rejects non-plain update template step objects', async () => {
		const result = validateUpdateTemplateInput({
			steps: [new TemplateStepPayload()]
		});

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Each step must be an object' });
	});
});
