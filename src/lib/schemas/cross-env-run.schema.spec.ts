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

	it('trims name and environments', () => {
		const result = createCrossEnvRunSchema.safeParse({
			name: '  Regression  ',
			testCaseIds: [1],
			environments: ['  QA  ', ' STAGE ']
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('Regression');
			expect(result.data.environments).toEqual(['QA', 'STAGE']);
		}
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

	it('rejects duplicate testCaseIds', () => {
		const result = createCrossEnvRunSchema.safeParse({
			name: 'Regression',
			testCaseIds: [1, 1],
			environments: ['QA', 'STAGE']
		});
		expect(result.success).toBe(false);
	});

	it('rejects more than 500 testCaseIds', () => {
		const result = createCrossEnvRunSchema.safeParse({
			name: 'Regression',
			testCaseIds: Array.from({ length: 501 }, (_, index) => index + 1),
			environments: ['QA', 'STAGE']
		});
		expect(result.success).toBe(false);
	});

	it('rejects duplicate environments after trimming', () => {
		const result = createCrossEnvRunSchema.safeParse({
			name: 'Regression',
			testCaseIds: [1],
			environments: ['QA', ' QA ']
		});
		expect(result.success).toBe(false);
	});

	it('rejects too many environments', () => {
		const result = createCrossEnvRunSchema.safeParse({
			name: 'Regression',
			testCaseIds: [1],
			environments: Array.from({ length: 21 }, (_, index) => `ENV_${index}`)
		});
		expect(result.success).toBe(false);
	});

	it('rejects environment names longer than 30 characters', () => {
		const result = createCrossEnvRunSchema.safeParse({
			name: 'Regression',
			testCaseIds: [1],
			environments: ['QA', 'x'.repeat(31)]
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
