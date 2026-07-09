import { describe, it, expect } from 'vitest';
import { createModuleSchema, updateModuleSchema } from './module.schema';

describe('module.schema', () => {
	describe('createModuleSchema', () => {
		it('accepts valid input', () => {
			const result = createModuleSchema.safeParse({ name: 'Auth Module' });
			expect(result.success).toBe(true);
		});

		it('accepts optional fields', () => {
			const result = createModuleSchema.safeParse({
				name: ' Auth Module ',
				parentModuleId: 1,
				description: ' Authentication and authorization '
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe('Auth Module');
				expect(result.data.description).toBe('Authentication and authorization');
			}
		});

		it('normalizes empty description to null', () => {
			const result = createModuleSchema.safeParse({ name: 'Root Module', description: '   ' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.description).toBeNull();
			}
		});

		it('accepts null parentModuleId', () => {
			const result = createModuleSchema.safeParse({ name: 'Root Module', parentModuleId: null });
			expect(result.success).toBe(true);
		});

		it('rejects empty name', () => {
			const result = createModuleSchema.safeParse({ name: '' });
			expect(result.success).toBe(false);
		});

		it('rejects name longer than 200 chars', () => {
			const result = createModuleSchema.safeParse({ name: 'a'.repeat(201) });
			expect(result.success).toBe(false);
		});
	});

	describe('updateModuleSchema', () => {
		it('accepts partial update', () => {
			const result = updateModuleSchema.safeParse({ name: 'Updated' });
			expect(result.success).toBe(true);
		});

		it('accepts sortOrder update', () => {
			const result = updateModuleSchema.safeParse({ sortOrder: 5 });
			expect(result.success).toBe(true);
		});

		it('accepts nullable description', () => {
			const result = updateModuleSchema.safeParse({ description: null });
			expect(result.success).toBe(true);
		});

		it('rejects unsafe sortOrder', () => {
			const result = updateModuleSchema.safeParse({ sortOrder: Number.MAX_SAFE_INTEGER + 1 });
			expect(result.success).toBe(false);
		});

		it('rejects unsafe parentModuleId', () => {
			const result = updateModuleSchema.safeParse({
				parentModuleId: Number.MAX_SAFE_INTEGER + 1
			});
			expect(result.success).toBe(false);
		});
	});
});
