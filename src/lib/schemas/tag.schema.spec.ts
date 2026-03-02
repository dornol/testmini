import { describe, it, expect } from 'vitest';
import { createTagSchema, updateTagSchema, assignTagSchema } from './tag.schema';

describe('createTagSchema', () => {
	it('should accept valid input', () => {
		const result = createTagSchema.safeParse({ name: 'Bug', color: '#ff0000' });
		expect(result.success).toBe(true);
	});

	it('should reject missing name', () => {
		const result = createTagSchema.safeParse({ color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject empty name', () => {
		const result = createTagSchema.safeParse({ name: '', color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject name exceeding 50 characters', () => {
		const result = createTagSchema.safeParse({ name: 'a'.repeat(51), color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject missing color', () => {
		const result = createTagSchema.safeParse({ name: 'Tag' });
		expect(result.success).toBe(false);
	});

	it('should reject invalid hex color format', () => {
		const invalid = ['red', '#fff', '#gggggg', '000000', '#ff00', '#ff00000'];
		for (const color of invalid) {
			const result = createTagSchema.safeParse({ name: 'Tag', color });
			expect(result.success).toBe(false);
		}
	});

	it('should accept valid hex colors', () => {
		const valid = ['#000000', '#ffffff', '#FF0000', '#abcdef', '#123ABC'];
		for (const color of valid) {
			const result = createTagSchema.safeParse({ name: 'Tag', color });
			expect(result.success).toBe(true);
		}
	});
});

describe('updateTagSchema', () => {
	it('should accept valid input', () => {
		const result = updateTagSchema.safeParse({ tagId: 1, name: 'Updated', color: '#00ff00' });
		expect(result.success).toBe(true);
	});

	it('should reject non-positive tagId', () => {
		const result = updateTagSchema.safeParse({ tagId: 0, name: 'T', color: '#000000' });
		expect(result.success).toBe(false);
	});
});

describe('assignTagSchema', () => {
	it('should accept valid tagId', () => {
		const result = assignTagSchema.safeParse({ tagId: 5 });
		expect(result.success).toBe(true);
	});

	it('should reject non-positive tagId', () => {
		const result = assignTagSchema.safeParse({ tagId: -1 });
		expect(result.success).toBe(false);
	});

	it('should reject non-integer tagId', () => {
		const result = assignTagSchema.safeParse({ tagId: 2.5 });
		expect(result.success).toBe(false);
	});
});
