import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodValidators } from './form-utils';

const testSchema = z.object({
	name: z.string().min(1)
});

describe('client form-utils', () => {
	// ── zodValidators ───────────────────────────────────

	describe('zodValidators', () => {
		it('should return a validators object', () => {
			const validators = zodValidators(testSchema);

			expect(validators).toBeDefined();
			expect(validators).not.toBeNull();
		});

		it('should return an object (not a primitive)', () => {
			const validators = zodValidators(testSchema);

			expect(typeof validators).toBe('object');
		});

		it('should work with different schema types', () => {
			const complexSchema = z.object({
				title: z.string().min(1),
				count: z.number().min(0),
				active: z.boolean().default(true)
			});

			const validators = zodValidators(complexSchema);

			expect(validators).toBeDefined();
			expect(typeof validators).toBe('object');
		});

		it('should work with optional fields', () => {
			const optionalSchema = z.object({
				name: z.string().min(1),
				description: z.string().optional()
			});

			const validators = zodValidators(optionalSchema);

			expect(validators).toBeDefined();
			expect(typeof validators).toBe('object');
		});
	});
});
