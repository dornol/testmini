import { describe, expect, it } from 'vitest';
import { createTestSuiteSchema, suiteItemsSchema, updateTestSuiteSchema } from './test-suite.schema';

describe('createTestSuiteSchema', () => {
	it('should trim fields and accept valid input', () => {
		const result = createTestSuiteSchema.safeParse({
			name: ' Smoke Tests ',
			description: ' Critical path tests ',
			testCaseIds: [1, 2]
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('Smoke Tests');
			expect(result.data.description).toBe('Critical path tests');
			expect(result.data.testCaseIds).toEqual([1, 2]);
		}
	});

	it('should default testCaseIds to an empty array', () => {
		const result = createTestSuiteSchema.safeParse({ name: 'Smoke Tests' });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.testCaseIds).toEqual([]);
		}
	});

	it('should reject empty names', () => {
		const result = createTestSuiteSchema.safeParse({ name: '   ' });

		expect(result.success).toBe(false);
	});

	it('should reject descriptions longer than 1000 characters', () => {
		const result = createTestSuiteSchema.safeParse({
			name: 'Smoke Tests',
			description: 'A'.repeat(1001)
		});

		expect(result.success).toBe(false);
	});

	it('should reject duplicate testCaseIds', () => {
		const result = createTestSuiteSchema.safeParse({
			name: 'Smoke Tests',
			testCaseIds: [1, 1]
		});

		expect(result.success).toBe(false);
	});
});

describe('updateTestSuiteSchema', () => {
	it('should accept a valid partial update', () => {
		const result = updateTestSuiteSchema.safeParse({ name: ' Updated Suite ' });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('Updated Suite');
		}
	});

	it('should normalize an empty description to null', () => {
		const result = updateTestSuiteSchema.safeParse({ description: '   ' });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.description).toBeNull();
		}
	});

	it('should reject empty names', () => {
		const result = updateTestSuiteSchema.safeParse({ name: '' });

		expect(result.success).toBe(false);
	});
});

describe('suiteItemsSchema', () => {
	it('should reject empty testCaseIds', () => {
		const result = suiteItemsSchema.safeParse({ testCaseIds: [] });

		expect(result.success).toBe(false);
	});

	it('should reject unsafe testCaseIds', () => {
		const result = suiteItemsSchema.safeParse({
			testCaseIds: [Number.MAX_SAFE_INTEGER + 1]
		});

		expect(result.success).toBe(false);
	});
});
