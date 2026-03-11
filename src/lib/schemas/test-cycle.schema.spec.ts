import { describe, it, expect } from 'vitest';
import { createTestCycleSchema, updateTestCycleSchema } from './test-cycle.schema';

describe('test-cycle.schema', () => {
	describe('createTestCycleSchema', () => {
		it('accepts valid input', () => {
			const result = createTestCycleSchema.safeParse({ name: 'Cycle 1', cycleNumber: 1 });
			expect(result.success).toBe(true);
		});

		it('accepts all optional fields', () => {
			const result = createTestCycleSchema.safeParse({
				name: 'Cycle 1',
				cycleNumber: 1,
				releaseId: 5,
				status: 'IN_PROGRESS',
				startDate: '2026-01-01',
				endDate: '2026-01-31'
			});
			expect(result.success).toBe(true);
		});

		it('rejects missing name', () => {
			const result = createTestCycleSchema.safeParse({ cycleNumber: 1 });
			expect(result.success).toBe(false);
		});

		it('rejects missing cycleNumber', () => {
			const result = createTestCycleSchema.safeParse({ name: 'Cycle 1' });
			expect(result.success).toBe(false);
		});

		it('rejects non-positive cycleNumber', () => {
			const result = createTestCycleSchema.safeParse({ name: 'Cycle 1', cycleNumber: 0 });
			expect(result.success).toBe(false);
		});

		it('rejects invalid status', () => {
			const result = createTestCycleSchema.safeParse({ name: 'Cycle 1', cycleNumber: 1, status: 'INVALID' });
			expect(result.success).toBe(false);
		});
	});

	describe('updateTestCycleSchema', () => {
		it('accepts partial update', () => {
			const result = updateTestCycleSchema.safeParse({ name: 'Updated' });
			expect(result.success).toBe(true);
		});

		it('accepts status update', () => {
			const result = updateTestCycleSchema.safeParse({ status: 'COMPLETED' });
			expect(result.success).toBe(true);
		});

		it('accepts nullable releaseId', () => {
			const result = updateTestCycleSchema.safeParse({ releaseId: null });
			expect(result.success).toBe(true);
		});
	});
});
