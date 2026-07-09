import { describe, expect, it } from 'vitest';
import { attachmentContentDisposition } from './content-disposition';

describe('attachmentContentDisposition', () => {
	it('returns an attachment disposition with ascii filename and encoded filename star', () => {
		expect(attachmentContentDisposition('export.csv')).toBe(
			`attachment; filename="export.csv"; filename*=UTF-8''export.csv`
		);
	});

	it('sanitizes unsafe fallback filename characters', () => {
		const disposition = attachmentContentDisposition('bad"\r\nSet-Cookie: x=1.csv');

		expect(disposition).toContain('filename="bad___Set-Cookie: x=1.csv"');
		expect(disposition).toContain(`filename*=UTF-8''bad%22%0D%0ASet-Cookie%3A%20x%3D1.csv`);
		expect(disposition).not.toContain('\r');
		expect(disposition).not.toContain('\n');
	});

	it('uses a safe fallback for blank filenames', () => {
		expect(attachmentContentDisposition('   ')).toBe(
			`attachment; filename="download"; filename*=UTF-8''%20%20%20`
		);
	});
});
