import { describe, it, expect } from 'vitest';
import { createPrioritySchema, updatePrioritySchema } from './priority.schema';

describe('createPrioritySchema', () => {
	it('should accept valid input', () => {
		const result = createPrioritySchema.safeParse({ name: 'High', color: '#ff0000' });
		expect(result.success).toBe(true);
	});

	it('should reject missing name', () => {
		const result = createPrioritySchema.safeParse({ color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject empty name', () => {
		const result = createPrioritySchema.safeParse({ name: '', color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject name exceeding 30 characters', () => {
		const result = createPrioritySchema.safeParse({ name: 'a'.repeat(31), color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should accept name exactly 30 characters', () => {
		const result = createPrioritySchema.safeParse({ name: 'a'.repeat(30), color: '#ff0000' });
		expect(result.success).toBe(true);
	});

	it('should reject missing color', () => {
		const result = createPrioritySchema.safeParse({ name: 'High' });
		expect(result.success).toBe(false);
	});

	it('should reject invalid hex color format', () => {
		const invalid = ['red', '#fff', '#gggggg', '000000', '#ff00', '#ff00000'];
		for (const color of invalid) {
			const result = createPrioritySchema.safeParse({ name: 'High', color });
			expect(result.success).toBe(false);
		}
	});

	it('should accept valid hex colors', () => {
		const valid = ['#000000', '#ffffff', '#FF0000', '#abcdef', '#123ABC'];
		for (const color of valid) {
			const result = createPrioritySchema.safeParse({ name: 'High', color });
			expect(result.success).toBe(true);
		}
	});

	it('should default isDefault to false when not provided', () => {
		const result = createPrioritySchema.safeParse({ name: 'High', color: '#ff0000' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isDefault).toBe(false);
		}
	});

	it('should accept explicit isDefault value', () => {
		const result = createPrioritySchema.safeParse({ name: 'High', color: '#ff0000', isDefault: true });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isDefault).toBe(true);
		}
	});
});

describe('updatePrioritySchema', () => {
	it('should accept valid input', () => {
		const result = updatePrioritySchema.safeParse({ priorityId: 1, name: 'Updated', color: '#00ff00' });
		expect(result.success).toBe(true);
	});

	it('should reject non-positive priorityId', () => {
		const result = updatePrioritySchema.safeParse({ priorityId: -1, name: 'High', color: '#000000' });
		expect(result.success).toBe(false);
	});

	it('should reject zero priorityId', () => {
		const result = updatePrioritySchema.safeParse({ priorityId: 0, name: 'High', color: '#000000' });
		expect(result.success).toBe(false);
	});

	it('should reject non-integer priorityId', () => {
		const result = updatePrioritySchema.safeParse({ priorityId: 2.5, name: 'High', color: '#000000' });
		expect(result.success).toBe(false);
	});

	it('should reject missing name', () => {
		const result = updatePrioritySchema.safeParse({ priorityId: 1, color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject empty name', () => {
		const result = updatePrioritySchema.safeParse({ priorityId: 1, name: '', color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject name exceeding 30 characters', () => {
		const result = updatePrioritySchema.safeParse({ priorityId: 1, name: 'a'.repeat(31), color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject missing color', () => {
		const result = updatePrioritySchema.safeParse({ priorityId: 1, name: 'High' });
		expect(result.success).toBe(false);
	});

	it('should reject invalid hex color format', () => {
		const invalid = ['red', '#fff', '#gggggg', '000000', '#ff00', '#ff00000'];
		for (const color of invalid) {
			const result = updatePrioritySchema.safeParse({ priorityId: 1, name: 'High', color });
			expect(result.success).toBe(false);
		}
	});

	it('should accept valid hex colors', () => {
		const valid = ['#000000', '#ffffff', '#FF0000', '#abcdef', '#123ABC'];
		for (const color of valid) {
			const result = updatePrioritySchema.safeParse({ priorityId: 1, name: 'High', color });
			expect(result.success).toBe(true);
		}
	});

	it('should default isDefault to false when not provided', () => {
		const result = updatePrioritySchema.safeParse({ priorityId: 1, name: 'High', color: '#ff0000' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isDefault).toBe(false);
		}
	});

	it('should accept explicit isDefault value', () => {
		const result = updatePrioritySchema.safeParse({ priorityId: 1, name: 'High', color: '#ff0000', isDefault: true });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isDefault).toBe(true);
		}
	});
});
