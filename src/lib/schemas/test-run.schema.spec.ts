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

	it('should reject blank name after trimming', () => {
		const result = createTestRunSchema.safeParse({
			name: '   ',
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

	it('should reject empty environment', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			environment: '',
			testCaseIds: [1]
		});
		expect(result.success).toBe(false);
	});

	it('should reject blank environment after trimming', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			environment: '   ',
			testCaseIds: [1]
		});
		expect(result.success).toBe(false);
	});

	it('should trim accepted name and environment', () => {
		const result = createTestRunSchema.safeParse({
			name: '  Run  ',
			environment: ' QA ',
			testCaseIds: [1]
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('Run');
			expect(result.data.environment).toBe('QA');
		}
	});

	it.each([
		['name', 'Run\nName', 'Name must not contain control characters'],
		['environment', 'QA\nProd', 'Environment must not contain control characters']
	])('should reject control characters in %s', (field, value, message) => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			environment: 'QA',
			testCaseIds: [1],
			[field]: value
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.map((issue) => issue.message)).toContain(message);
		}
	});

	it('should accept any non-empty environment string', () => {
		for (const env of ['DEV', 'QA', 'STAGE', 'PROD', 'PRODUCTION', 'UAT', 'SANDBOX']) {
			const result = createTestRunSchema.safeParse({
				name: 'Run',
				environment: env,
				testCaseIds: [1]
			});
			expect(result.success).toBe(true);
		}
	});

	it('should reject environment longer than 30 chars', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			environment: 'A'.repeat(31),
			testCaseIds: [1]
		});
		expect(result.success).toBe(false);
	});

	it('should reject empty testCaseIds', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			environment: 'QA',
			testCaseIds: []
		});
		expect(result.success).toBe(false);
	});

	it('should reject duplicate testCaseIds', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			environment: 'QA',
			testCaseIds: [1, 1]
		});
		expect(result.success).toBe(false);
	});

	it('should reject more than 500 testCaseIds', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			environment: 'QA',
			testCaseIds: Array.from({ length: 501 }, (_, index) => index + 1)
		});
		expect(result.success).toBe(false);
	});

	it('should reject unknown fields', () => {
		const result = createTestRunSchema.safeParse({
			name: 'Run',
			environment: 'QA',
			testCaseIds: [1],
			priority: 'high'
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

	it('should reject unknown fields', () => {
		const result = updateExecutionSchema.safeParse({ status: 'PASS', duration: 100 });
		expect(result.success).toBe(false);
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

	it('should accept any non-empty environment string', () => {
		const result = updateTestRunSchema.safeParse({ environment: 'PRODUCTION' });
		expect(result.success).toBe(true);
	});

	it('should reject empty environment', () => {
		const result = updateTestRunSchema.safeParse({ environment: '' });
		expect(result.success).toBe(false);
	});

	it('should reject blank updated name and environment after trimming', () => {
		expect(updateTestRunSchema.safeParse({ name: '   ' }).success).toBe(false);
		expect(updateTestRunSchema.safeParse({ environment: '   ' }).success).toBe(false);
	});

	it('should trim updated name and environment', () => {
		const result = updateTestRunSchema.safeParse({ name: '  New name  ', environment: ' QA ' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('New name');
			expect(result.data.environment).toBe('QA');
		}
	});

	it.each([
		['name', 'New\nName', 'Name must not contain control characters'],
		['environment', 'QA\nProd', 'Environment must not contain control characters']
	])('should reject control characters in updated %s', (field, value, message) => {
		const result = updateTestRunSchema.safeParse({ [field]: value });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.map((issue) => issue.message)).toContain(message);
		}
	});

	it('should reject unknown fields', () => {
		const result = updateTestRunSchema.safeParse({ name: 'New name', status: 'IN_PROGRESS' });
		expect(result.success).toBe(false);
	});
});
