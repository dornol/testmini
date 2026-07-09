import { describe, expect, it } from 'vitest';
import { validateWebhookFields } from './webhook-validation';

class WebhookPayload {
	name = 'Webhook';
	url = 'https://example.com/hook';
}

describe('webhook validation', () => {
	it('rejects non-plain webhook payload objects', async () => {
		const result = await validateWebhookFields(new WebhookPayload(), {
			requireName: true,
			requireUrl: true
		});

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({ error: 'Invalid request body' });
	});
});
