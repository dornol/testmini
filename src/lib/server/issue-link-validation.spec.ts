import { describe, expect, it } from 'vitest';
import {
	validateIssueLinkCreateInput,
	validateIssueLinkProvider,
	validateIssueLinkRequestBody
} from './issue-link-validation';

async function responseError(response: Response): Promise<string> {
	return (await response.json()).error;
}

describe('issue-link-validation', () => {
	it('rejects non-plain request bodies', async () => {
		const result = validateIssueLinkRequestBody(new Date());

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Invalid request body' });
	});

	it('rejects control characters in external URLs', async () => {
		const result = validateIssueLinkCreateInput({
			testCaseId: 1,
			externalUrl: 'https://example.com/issue/1\nInjected: yes'
		});

		expect(result).toBeInstanceOf(Response);
		expect(await responseError(result as Response)).toContain('External URL contains invalid');
	});

	it('rejects control characters in optional issue link text fields', async () => {
		const result = validateIssueLinkCreateInput({
			testCaseId: 1,
			externalUrl: 'https://example.com/issue/1',
			externalKey: 'ISSUE\r1',
			title: 'Valid title'
		});

		expect(result).toBeInstanceOf(Response);
		expect(await responseError(result as Response)).toContain('External key contains invalid');
	});

	it('rejects control characters in provider names', async () => {
		const result = validateIssueLinkProvider('JIRA\nX');

		expect(result).toBeInstanceOf(Response);
		expect(await responseError(result as Response)).toContain('Provider contains invalid');
	});
});
