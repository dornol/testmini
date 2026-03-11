import { describe, it, expect } from 'vitest';
import { createCrossEnvRunSchema } from './cross-env-run.schema';

describe('cross-env-run.schema', () => {
	it('accepts valid input with 2 environments', () => {
		const result = createCrossEnvRunSchema.safeParse({
			name: 'Regression',
			testCaseIds: [1, 2, 3],
			environments: ['QA', 'STAGE']
		});
		expect(result.success).toBe(true);
	});

	it('accepts optional fields', () => {
		const result = createCrossEnvRunSchema.safeParse({
			name: 'Regression',
			testCaseIds: [1],
			environments: ['QA', 'STAGE'],
			testPlanId: 1,
			releaseId: 2,
			testCycleId: 3
		});
		expect(result.success).toBe(true);
	});

	it('rejects fewer than 2 environments', () => {
		const result = createCrossEnvRunSchema.safeParse({
			name: 'Regression',
			testCaseIds: [1],
			environments: ['QA']
		});
		expect(result.success).toBe(false);
	});

	it('rejects empty testCaseIds', () => {
		const result = createCrossEnvRunSchema.safeParse({
			name: 'Regression',
			testCaseIds: [],
			environments: ['QA', 'STAGE']
		});
		expect(result.success).toBe(false);
	});

	it('rejects missing name', () => {
		const result = createCrossEnvRunSchema.safeParse({
			testCaseIds: [1],
			environments: ['QA', 'STAGE']
		});
		expect(result.success).toBe(false);
	});
});
