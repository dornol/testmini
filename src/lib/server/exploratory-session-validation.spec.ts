import { describe, expect, it } from 'vitest';
import {
	validateCreateExploratorySessionPayload,
	validateUpdateExploratorySessionPayload
} from './exploratory-session-validation';

class SessionPayload {
	title = 'Exploratory session';
}

describe('exploratory session validation', () => {
	it('rejects non-plain create payload objects', async () => {
		const result = validateCreateExploratorySessionPayload(new SessionPayload());

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'Request body must be an object'
		});
	});

	it('rejects non-plain update payload objects', async () => {
		const result = validateUpdateExploratorySessionPayload(new SessionPayload());

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toEqual({
			error: 'Request body must be an object'
		});
	});
});
