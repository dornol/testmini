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
				name: 'Auth Module',
				parentModuleId: 1,
				description: 'Authentication and authorization'
			});
			expect(result.success).toBe(true);
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
	});
});
