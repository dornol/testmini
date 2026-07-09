import { describe, it, expect } from 'vitest';
import {
	createTestCaseSchema,
	gherkinStepSchema,
	stepSchema,
	updateTestCaseSchema
} from './test-case.schema';

describe('stepSchema', () => {
	it('should accept valid step', () => {
		const result = stepSchema.safeParse({ action: 'Click button', expected: 'Dialog opens' });
		expect(result.success).toBe(true);
	});

	it('should reject empty action', () => {
		const result = stepSchema.safeParse({ action: '', expected: '' });
		expect(result.success).toBe(false);
	});

	it('should reject whitespace-only action', () => {
		const result = stepSchema.safeParse({ action: '   ', expected: '' });
		expect(result.success).toBe(false);
	});

	it('should trim action while preserving expected text', () => {
		const result = stepSchema.parse({ action: '  Click button  ', expected: '  Dialog opens  ' });
		expect(result).toEqual({ action: 'Click button', expected: '  Dialog opens  ' });
	});

	it('should default expected to empty string', () => {
		const result = stepSchema.safeParse({ action: 'Do something' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.expected).toBe('');
		}
	});

	it('should reject unknown fields', () => {
		const result = stepSchema.safeParse({ action: 'Click button', expected: 'OK', note: 'extra' });
		expect(result.success).toBe(false);
	});
});

describe('gherkinStepSchema', () => {
	it('should reject whitespace-only text', () => {
		const result = gherkinStepSchema.safeParse({
			keyword: 'Given',
			text: '   ',
			expected: ''
		});
		expect(result.success).toBe(false);
	});

	it('should trim text while preserving expected text', () => {
		const result = gherkinStepSchema.parse({
			keyword: 'Given',
			text: '  the user is logged in  ',
			expected: '  Dashboard is visible  '
		});
		expect(result).toEqual({
			keyword: 'Given',
			text: 'the user is logged in',
			expected: '  Dashboard is visible  '
		});
	});

	it('should reject unknown fields', () => {
		const result = gherkinStepSchema.safeParse({
			keyword: 'Given',
			text: 'the user is logged in',
			expected: '',
			note: 'extra'
		});
		expect(result.success).toBe(false);
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

	it('should reject whitespace-only title', () => {
		const result = createTestCaseSchema.safeParse({ title: '   ' });
		expect(result.success).toBe(false);
	});

	it('should trim identifier fields while preserving descriptive text', () => {
		const result = createTestCaseSchema.parse({
			title: '  Login test  ',
			precondition: '  User exists  ',
			expectedResult: '  Login succeeds  ',
			priority: '  HIGH  ',
			automationKey: '  AUTH-LOGIN  '
		});

		expect(result).toMatchObject({
			title: 'Login test',
			precondition: '  User exists  ',
			expectedResult: '  Login succeeds  ',
			priority: 'HIGH',
			automationKey: 'AUTH-LOGIN'
		});
	});

	it('should reject title exceeding 200 characters', () => {
		const result = createTestCaseSchema.safeParse({ title: 'a'.repeat(201) });
		expect(result.success).toBe(false);
	});

	it('should accept any string priority', () => {
		for (const p of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'P1', 'Minor']) {
			const result = createTestCaseSchema.safeParse({ title: 'T', priority: p });
			expect(result.success).toBe(true);
		}
	});

	it('should accept custom priority names', () => {
		for (const p of ['URGENT', 'P0', 'Blocker']) {
			const result = createTestCaseSchema.safeParse({ title: 'T', priority: p });
			expect(result.success).toBe(true);
		}
	});

	it('should reject empty priority', () => {
		const result = createTestCaseSchema.safeParse({ title: 'T', priority: '' });
		expect(result.success).toBe(false);
	});

	it('should reject whitespace-only priority', () => {
		const result = createTestCaseSchema.safeParse({ title: 'T', priority: '   ' });
		expect(result.success).toBe(false);
	});

	it('should reject priority exceeding 30 characters', () => {
		const result = createTestCaseSchema.safeParse({ title: 'T', priority: 'a'.repeat(31) });
		expect(result.success).toBe(false);
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

	it('should reject unknown top-level fields', () => {
		const result = createTestCaseSchema.safeParse({ title: 'T', status: 'DRAFT' });
		expect(result.success).toBe(false);
	});

	it('should reject unknown fields inside steps', () => {
		const result = createTestCaseSchema.safeParse({
			title: 'T',
			steps: [{ action: 'Step 1', expected: 'Result 1', id: 'client-only' }]
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

	it('should reject whitespace-only title', () => {
		const result = updateTestCaseSchema.safeParse({ title: '   ', revision: 1 });
		expect(result.success).toBe(false);
	});

	it('should trim update identifier fields', () => {
		const result = updateTestCaseSchema.parse({
			title: '  Updated  ',
			priority: '  LOW  ',
			automationKey: '  CASE-1  ',
			revision: 1
		});

		expect(result).toMatchObject({
			title: 'Updated',
			priority: 'LOW',
			automationKey: 'CASE-1'
		});
	});

	it('should reject non-positive revision', () => {
		const result = updateTestCaseSchema.safeParse({ title: 'T', revision: 0 });
		expect(result.success).toBe(false);
	});

	it('should reject unknown top-level fields', () => {
		const result = updateTestCaseSchema.safeParse({ title: 'T', revision: 1, status: 'DRAFT' });
		expect(result.success).toBe(false);
	});
});
