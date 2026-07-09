import { describe, expect, it } from 'vitest';
import { validateCustomIssueTemplate } from './custom-template';

class CustomTemplatePayload {
	titleTemplate = '{{title}}';
}

class CustomHeadersPayload {
	'X-Test' = 'enabled';
}

describe('custom issue template validation', () => {
	it('rejects non-plain custom template objects', () => {
		expect(validateCustomIssueTemplate(new CustomTemplatePayload())).toEqual({
			ok: false,
			error: 'Custom template must be an object'
		});
	});

	it('rejects non-plain custom template header objects', () => {
		expect(
			validateCustomIssueTemplate({
				titleTemplate: '{{title}}',
				headers: new CustomHeadersPayload()
			})
		).toEqual({
			ok: false,
			error: 'Custom template headers must be an object'
		});
	});
});
