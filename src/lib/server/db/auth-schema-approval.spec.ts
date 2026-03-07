/**
 * Tests for the approved column in the user schema.
 * Verifies the column definition and default value.
 */
import { describe, it, expect } from 'vitest';
import { user } from './auth.schema';

describe('user table schema - approved column', () => {
	it('should have an approved column defined', () => {
		expect(user.approved).toBeDefined();
	});

	it('should have the correct column name', () => {
		expect(user.approved.name).toBe('approved');
	});

	it('should be a not-null column', () => {
		expect(user.approved.notNull).toBe(true);
	});

	it('should have a default value of true', () => {
		expect(user.approved.hasDefault).toBe(true);
		expect(user.approved.default).toBe(true);
	});
});
