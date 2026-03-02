import { describe, it, expect } from 'vitest';
import { createProjectSchema, updateProjectSchema } from './project.schema';

describe('createProjectSchema', () => {
	it('should accept valid input', () => {
		const result = createProjectSchema.safeParse({ name: 'My Project', description: 'A desc' });
		expect(result.success).toBe(true);
	});

	it('should accept name only (description defaults to empty string)', () => {
		const result = createProjectSchema.safeParse({ name: 'Test' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.description).toBe('');
		}
	});

	it('should reject missing name', () => {
		const result = createProjectSchema.safeParse({ description: 'no name' });
		expect(result.success).toBe(false);
	});

	it('should reject empty name', () => {
		const result = createProjectSchema.safeParse({ name: '' });
		expect(result.success).toBe(false);
	});

	it('should reject name exceeding 100 characters', () => {
		const result = createProjectSchema.safeParse({ name: 'a'.repeat(101) });
		expect(result.success).toBe(false);
	});

	it('should accept name at exactly 100 characters', () => {
		const result = createProjectSchema.safeParse({ name: 'a'.repeat(100) });
		expect(result.success).toBe(true);
	});

	it('should reject description exceeding 1000 characters', () => {
		const result = createProjectSchema.safeParse({ name: 'P', description: 'x'.repeat(1001) });
		expect(result.success).toBe(false);
	});
});

describe('updateProjectSchema', () => {
	it('should accept valid input', () => {
		const result = updateProjectSchema.safeParse({ name: 'Updated', description: 'new desc' });
		expect(result.success).toBe(true);
	});

	it('should reject missing name', () => {
		const result = updateProjectSchema.safeParse({ description: 'no name' });
		expect(result.success).toBe(false);
	});
});
