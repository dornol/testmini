import { describe, it, expect } from 'vitest';
import { createTestPlanSchema, updateTestPlanSchema } from './test-plan.schema';

describe('createTestPlanSchema', () => {
	it('should accept valid input', () => {
		const result = createTestPlanSchema.safeParse({
			name: 'Sprint 1 Plan'
		});
		expect(result.success).toBe(true);
	});

	it('should reject missing name', () => {
		const result = createTestPlanSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it('should reject empty name', () => {
		const result = createTestPlanSchema.safeParse({ name: '' });
		expect(result.success).toBe(false);
	});

	it('should reject name longer than 200 chars', () => {
		const result = createTestPlanSchema.safeParse({ name: 'A'.repeat(201) });
		expect(result.success).toBe(false);
	});

	it('should accept valid input with all fields', () => {
		const result = createTestPlanSchema.safeParse({
			name: 'Full Plan',
			description: 'A comprehensive test plan',
			milestone: 'v1.0',
			startDate: '2025-01-01',
			endDate: '2025-01-31',
			testCaseIds: [1, 2, 3]
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('Full Plan');
			expect(result.data.testCaseIds).toEqual([1, 2, 3]);
		}
	});

	it('should default testCaseIds to empty array', () => {
		const result = createTestPlanSchema.safeParse({ name: 'Plan' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.testCaseIds).toEqual([]);
		}
	});

	it('should accept name at exactly 200 chars', () => {
		const result = createTestPlanSchema.safeParse({ name: 'A'.repeat(200) });
		expect(result.success).toBe(true);
	});

	it('should reject description longer than 2000 chars', () => {
		const result = createTestPlanSchema.safeParse({
			name: 'Plan',
			description: 'A'.repeat(2001)
		});
		expect(result.success).toBe(false);
	});
});

describe('updateTestPlanSchema', () => {
	it('should accept valid partial update', () => {
		const result = updateTestPlanSchema.safeParse({ name: 'Updated Plan' });
		expect(result.success).toBe(true);
	});

	it('should accept valid status values', () => {
		for (const status of ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']) {
			const result = updateTestPlanSchema.safeParse({ status });
			expect(result.success).toBe(true);
		}
	});

	it('should reject invalid status', () => {
		const result = updateTestPlanSchema.safeParse({ status: 'INVALID' });
		expect(result.success).toBe(false);
	});

	it('should accept empty object (all optional)', () => {
		const result = updateTestPlanSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it('should accept nullable fields', () => {
		const result = updateTestPlanSchema.safeParse({
			description: null,
			milestone: null,
			startDate: null,
			endDate: null
		});
		expect(result.success).toBe(true);
	});

	it('should reject empty name', () => {
		const result = updateTestPlanSchema.safeParse({ name: '' });
		expect(result.success).toBe(false);
	});
});
