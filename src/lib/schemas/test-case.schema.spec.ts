import { describe, it, expect } from 'vitest';
import { createTestCaseSchema, updateTestCaseSchema, stepSchema } from './test-case.schema';

describe('stepSchema', () => {
	it('should accept valid step', () => {
		const result = stepSchema.safeParse({ action: 'Click button', expected: 'Dialog opens' });
		expect(result.success).toBe(true);
	});

	it('should reject empty action', () => {
		const result = stepSchema.safeParse({ action: '', expected: '' });
		expect(result.success).toBe(false);
	});

	it('should default expected to empty string', () => {
		const result = stepSchema.safeParse({ action: 'Do something' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.expected).toBe('');
		}
	});
});

describe('createTestCaseSchema', () => {
	it('should accept valid input with all fields', () => {
		const result = createTestCaseSchema.safeParse({
			title: 'Login test',
			precondition: 'User exists',
			steps: [{ action: 'Enter email', expected: 'Email field filled' }],
			expectedResult: 'Login success',
			priority: 'HIGH'
		});
		expect(result.success).toBe(true);
	});

	it('should apply defaults for optional fields', () => {
		const result = createTestCaseSchema.safeParse({ title: 'Minimal' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.precondition).toBe('');
			expect(result.data.steps).toEqual([]);
			expect(result.data.expectedResult).toBe('');
			expect(result.data.priority).toBe('MEDIUM');
		}
	});

	it('should reject missing title', () => {
		const result = createTestCaseSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it('should reject empty title', () => {
		const result = createTestCaseSchema.safeParse({ title: '' });
		expect(result.success).toBe(false);
	});

	it('should reject title exceeding 200 characters', () => {
		const result = createTestCaseSchema.safeParse({ title: 'a'.repeat(201) });
		expect(result.success).toBe(false);
	});

	it('should reject invalid priority enum', () => {
		const result = createTestCaseSchema.safeParse({ title: 'T', priority: 'URGENT' });
		expect(result.success).toBe(false);
	});

	it('should accept all valid priority values', () => {
		for (const p of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
			const result = createTestCaseSchema.safeParse({ title: 'T', priority: p });
			expect(result.success).toBe(true);
		}
	});

	it('should validate steps array structure', () => {
		const result = createTestCaseSchema.safeParse({
			title: 'T',
			steps: [{ action: 'Step 1' }, { action: 'Step 2', expected: 'Result 2' }]
		});
		expect(result.success).toBe(true);
	});

	it('should reject steps with invalid items', () => {
		const result = createTestCaseSchema.safeParse({
			title: 'T',
			steps: [{ expected: 'no action' }]
		});
		expect(result.success).toBe(false);
	});
});

describe('updateTestCaseSchema', () => {
	it('should require revision', () => {
		const result = updateTestCaseSchema.safeParse({ title: 'Updated' });
		expect(result.success).toBe(false);
	});

	it('should accept valid update with revision', () => {
		const result = updateTestCaseSchema.safeParse({ title: 'Updated', revision: 1 });
		expect(result.success).toBe(true);
	});

	it('should reject non-positive revision', () => {
		const result = updateTestCaseSchema.safeParse({ title: 'T', revision: 0 });
		expect(result.success).toBe(false);
	});
});
