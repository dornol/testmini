import { describe, it, expect } from 'vitest';
import { createFailureSchema } from './failure.schema';

describe('createFailureSchema', () => {
	it('should accept empty object (all fields have defaults)', () => {
		const result = createFailureSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.failureEnvironment).toBe('');
			expect(result.data.testMethod).toBe('');
			expect(result.data.errorMessage).toBe('');
			expect(result.data.stackTrace).toBe('');
			expect(result.data.comment).toBe('');
		}
	});

	it('should accept valid full input', () => {
		const result = createFailureSchema.safeParse({
			failureEnvironment: 'Chrome 120',
			testMethod: 'manual',
			errorMessage: 'Element not found',
			stackTrace: 'at line 42',
			comment: 'Needs investigation'
		});
		expect(result.success).toBe(true);
	});

	it('should reject failureEnvironment exceeding 200 characters', () => {
		const result = createFailureSchema.safeParse({
			failureEnvironment: 'x'.repeat(201)
		});
		expect(result.success).toBe(false);
	});

	it('should reject testMethod exceeding 500 characters', () => {
		const result = createFailureSchema.safeParse({
			testMethod: 'x'.repeat(501)
		});
		expect(result.success).toBe(false);
	});

	it('should reject errorMessage exceeding 2000 characters', () => {
		const result = createFailureSchema.safeParse({
			errorMessage: 'x'.repeat(2001)
		});
		expect(result.success).toBe(false);
	});

	it('should reject stackTrace exceeding 10000 characters', () => {
		const result = createFailureSchema.safeParse({
			stackTrace: 'x'.repeat(10001)
		});
		expect(result.success).toBe(false);
	});

	it('should reject comment exceeding 2000 characters', () => {
		const result = createFailureSchema.safeParse({
			comment: 'x'.repeat(2001)
		});
		expect(result.success).toBe(false);
	});

	it('should accept values at max length', () => {
		const result = createFailureSchema.safeParse({
			failureEnvironment: 'x'.repeat(200),
			testMethod: 'x'.repeat(500),
			errorMessage: 'x'.repeat(2000),
			stackTrace: 'x'.repeat(10000),
			comment: 'x'.repeat(2000)
		});
		expect(result.success).toBe(true);
	});
});
