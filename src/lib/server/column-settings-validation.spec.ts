import { describe, expect, it } from 'vitest';
import { validateColumnSettingsInput } from './column-settings-validation';

class ColumnSettingPayload {
	id = 'priority';
	visible = true;
}

describe('column settings validation', () => {
	it('rejects non-plain column setting objects', async () => {
		const result = validateColumnSettingsInput({
			columnSettings: [new ColumnSettingPayload()]
		});

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'Each column must be an object'
		});
	});
});
