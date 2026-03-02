import { describe, it, expect } from 'vitest';
import { createTestRunSchema, updateExecutionSchema, updateTestRunSchema } from './test-run.schema';

describe('createTestRunSchema', () => {
	it('should accept valid input', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Sprint 1 Run',
			environment: 'QA',
			testCaseIds: [1, 2, 3]
		});
		expect(result.success).toBe(true);
	});

	it('should reject missing name', () => {
		const result = createTestRunSchema.safeParse({
			environment: 'QA',
			testCaseIds: [1]
		});
		expect(result.success).toBe(false);
	});

	it('should reject empty name', () => {
		const result = createTestRunSchema.safeParse({
			name: '',
			environment: 'QA',
			testCaseIds: [1]
		});
		expect(result.success).toBe(false);
	});

	it('should reject missing environment', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			testCaseIds: [1]
		});
		expect(result.success).toBe(false);
	});

	it('should reject invalid environment', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			environment: 'PRODUCTION',
			testCaseIds: [1]
		});
		expect(result.success).toBe(false);
	});

	it('should accept all valid environments', () => {
		for (const env of ['DEV', 'QA', 'STAGE', 'PROD']) {
			const result = createTestRunSchema.safeParse({
				name: 'Run',
				environment: env,
				testCaseIds: [1]
			});
			expect(result.success).toBe(true);
		}
	});

	it('should reject empty testCaseIds', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			environment: 'QA',
			testCaseIds: []
		});
		expect(result.success).toBe(false);
	});
});

describe('updateExecutionSchema', () => {
	it('should accept valid status', () => {
		const result = updateExecutionSchema.safeParse({ status: 'PASS' });
		expect(result.success).toBe(true);
	});

	it('should reject invalid status', () => {
		const result = updateExecutionSchema.safeParse({ status: 'PENDING' });
		expect(result.success).toBe(false);
	});

	it('should accept optional comment', () => {
		const result = updateExecutionSchema.safeParse({ status: 'FAIL', comment: 'Bug found' });
		expect(result.success).toBe(true);
	});
});

describe('updateTestRunSchema', () => {
	it('should accept partial update', () => {
		const result = updateTestRunSchema.safeParse({ name: 'New name' });
		expect(result.success).toBe(true);
	});

	it('should accept empty object (all optional)', () => {
		const result = updateTestRunSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it('should reject invalid environment', () => {
		const result = updateTestRunSchema.safeParse({ environment: 'INVALID' });
		expect(result.success).toBe(false);
	});
});
