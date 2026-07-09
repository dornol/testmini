import { describe, expect, it } from 'vitest';
import { redactSecrets } from './secret-redaction';

describe('redactSecrets', () => {
	it('redacts configured secrets and common auth patterns', () => {
		const message =
			'Authorization: Bearer ghp_secret123 apiToken=ghp_secret123 url=https://user:pass@example.com';

		const result = redactSecrets(message, ['ghp_secret123']);

		expect(result).not.toContain('ghp_secret123');
		expect(result).not.toContain('user:pass');
		expect(result).toContain('[redacted]');
	});

	it('redacts basic auth payload variants for colon-delimited tokens', () => {
		const secret = 'user@test.com:very-secret-token';
		const encoded = Buffer.from(secret, 'utf8').toString('base64');

		const result = redactSecrets(`Jira returned token ${encoded} and very-secret-token`, [secret]);

		expect(result).not.toContain(encoded);
		expect(result).not.toContain('very-secret-token');
		expect(result).toContain('[redacted]');
	});
});
