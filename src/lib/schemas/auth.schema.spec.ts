import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth.schema';

describe('loginSchema', () => {
	it('should accept valid credentials', () => {
		const result = loginSchema.safeParse({ email: 'user@example.com', password: 'secret' });

		expect(result.success).toBe(true);
	});

	it('should reject unknown fields', () => {
		const result = loginSchema.safeParse({
			email: 'user@example.com',
			password: 'secret',
			redirectTo: '/admin'
		});

		expect(result.success).toBe(false);
	});
});

describe('registerSchema', () => {
	it('should accept matching passwords', () => {
		const result = registerSchema.safeParse({
			name: 'User',
			email: 'user@example.com',
			password: 'password123',
			passwordConfirm: 'password123'
		});

		expect(result.success).toBe(true);
	});

	it('should reject mismatched passwords', () => {
		const result = registerSchema.safeParse({
			name: 'User',
			email: 'user@example.com',
			password: 'password123',
			passwordConfirm: 'different123'
		});

		expect(result.success).toBe(false);
	});

	it('should reject unknown fields', () => {
		const result = registerSchema.safeParse({
			name: 'User',
			email: 'user@example.com',
			password: 'password123',
			passwordConfirm: 'password123',
			role: 'admin'
		});

		expect(result.success).toBe(false);
	});
});
