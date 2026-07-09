import { describe, expect, it } from 'vitest';
import { validateIssueLinkRequestBody } from './issue-link-validation';

describe('issue-link-validation', () => {
	it('rejects non-plain request bodies', async () => {
		const result = validateIssueLinkRequestBody(new Date());

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Invalid request body' });
	});
});
