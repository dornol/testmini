import { describe, it, expect } from 'vitest';
import { createEnvironmentSchema, updateEnvironmentSchema } from './environment.schema';

describe('createEnvironmentSchema', () => {
	it('should accept valid input', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'Production', color: '#ff0000' });
		expect(result.success).toBe(true);
	});

	it('should reject missing name', () => {
		const result = createEnvironmentSchema.safeParse({ color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject empty name', () => {
		const result = createEnvironmentSchema.safeParse({ name: '', color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject name exceeding 30 characters', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'a'.repeat(31), color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should accept name exactly 30 characters', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'a'.repeat(30), color: '#ff0000' });
		expect(result.success).toBe(true);
	});

	it('should reject missing color', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'Production' });
		expect(result.success).toBe(false);
	});

	it('should reject invalid hex color format', () => {
		const invalid = ['red', '#fff', '#gggggg', '000000', '#ff00', '#ff00000'];
		for (const color of invalid) {
			const result = createEnvironmentSchema.safeParse({ name: 'Production', color });
			expect(result.success).toBe(false);
		}
	});

	it('should accept valid hex colors', () => {
		const valid = ['#000000', '#ffffff', '#FF0000', '#abcdef', '#123ABC'];
		for (const color of valid) {
			const result = createEnvironmentSchema.safeParse({ name: 'Production', color });
			expect(result.success).toBe(true);
		}
	});

	it('should default isDefault to false when not provided', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'Production', color: '#ff0000' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isDefault).toBe(false);
		}
	});

	it('should accept explicit isDefault value', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'Production', color: '#ff0000', isDefault: true });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isDefault).toBe(true);
		}
	});

	it('should accept name with exactly 1 character', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'X', color: '#ff0000' });
		expect(result.success).toBe(true);
	});

	it('should reject 3-character hex color (#fff)', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'Test', color: '#fff' });
		expect(result.success).toBe(false);
	});

	it('should reject color without # prefix', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'Test', color: 'ff0000' });
		expect(result.success).toBe(false);
	});

	it('should accept color with uppercase letters (#FF0000)', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'Test', color: '#FF0000' });
		expect(result.success).toBe(true);
	});

	it('should accept all fields provided', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'Production', color: '#abcdef', isDefault: true });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({ name: 'Production', color: '#abcdef', isDefault: true, baseUrl: '', credentials: '', memo: '' });
		}
	});

	it('should accept baseUrl, credentials, and memo', () => {
		const result = createEnvironmentSchema.safeParse({
			name: 'QA', color: '#ff0000',
			baseUrl: 'https://qa.example.com',
			credentials: 'admin@test.com / pass123',
			memo: 'VPN required'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.baseUrl).toBe('https://qa.example.com');
			expect(result.data.credentials).toBe('admin@test.com / pass123');
			expect(result.data.memo).toBe('VPN required');
		}
	});

	it('should default detail fields to empty string when not provided', () => {
		const result = createEnvironmentSchema.safeParse({ name: 'QA', color: '#ff0000' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.baseUrl).toBe('');
			expect(result.data.credentials).toBe('');
			expect(result.data.memo).toBe('');
		}
	});

	it('should reject baseUrl exceeding 500 characters', () => {
		const result = createEnvironmentSchema.safeParse({
			name: 'QA', color: '#ff0000', baseUrl: 'https://' + 'a'.repeat(500)
		});
		expect(result.success).toBe(false);
	});

	it('should reject credentials exceeding 1000 characters', () => {
		const result = createEnvironmentSchema.safeParse({
			name: 'QA', color: '#ff0000', credentials: 'a'.repeat(1001)
		});
		expect(result.success).toBe(false);
	});

	it('should reject memo exceeding 2000 characters', () => {
		const result = createEnvironmentSchema.safeParse({
			name: 'QA', color: '#ff0000', memo: 'a'.repeat(2001)
		});
		expect(result.success).toBe(false);
	});

	it('should accept detail fields at max length', () => {
		const result = createEnvironmentSchema.safeParse({
			name: 'QA', color: '#ff0000',
			baseUrl: 'a'.repeat(500),
			credentials: 'a'.repeat(1000),
			memo: 'a'.repeat(2000)
		});
		expect(result.success).toBe(true);
	});
});

describe('updateEnvironmentSchema', () => {
	it('should accept valid input', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'Staging', color: '#00ff00' });
		expect(result.success).toBe(true);
	});

	it('should reject non-positive environmentId', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: -1, name: 'Staging', color: '#000000' });
		expect(result.success).toBe(false);
	});

	it('should reject zero environmentId', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 0, name: 'Staging', color: '#000000' });
		expect(result.success).toBe(false);
	});

	it('should reject non-integer environmentId', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 2.5, name: 'Staging', color: '#000000' });
		expect(result.success).toBe(false);
	});

	it('should reject missing name', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject empty name', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: '', color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject name exceeding 30 characters', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'a'.repeat(31), color: '#ff0000' });
		expect(result.success).toBe(false);
	});

	it('should reject missing color', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'Staging' });
		expect(result.success).toBe(false);
	});

	it('should reject invalid hex color format', () => {
		const invalid = ['red', '#fff', '#gggggg', '000000', '#ff00', '#ff00000'];
		for (const color of invalid) {
			const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'Staging', color });
			expect(result.success).toBe(false);
		}
	});

	it('should accept valid hex colors', () => {
		const valid = ['#000000', '#ffffff', '#FF0000', '#abcdef', '#123ABC'];
		for (const color of valid) {
			const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'Staging', color });
			expect(result.success).toBe(true);
		}
	});

	it('should default isDefault to false when not provided', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'Staging', color: '#ff0000' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isDefault).toBe(false);
		}
	});

	it('should accept explicit isDefault value', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'Staging', color: '#ff0000', isDefault: true });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isDefault).toBe(true);
		}
	});

	it('should accept name with exactly 30 characters', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'a'.repeat(30), color: '#ff0000' });
		expect(result.success).toBe(true);
	});

	it('should accept name with exactly 1 character', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'X', color: '#ff0000' });
		expect(result.success).toBe(true);
	});

	it('should reject environmentId as float (1.5)', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1.5, name: 'Staging', color: '#000000' });
		expect(result.success).toBe(false);
	});

	it('should reject negative environmentId', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: -5, name: 'Staging', color: '#000000' });
		expect(result.success).toBe(false);
	});

	it('should reject 3-character hex color (#fff)', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'Test', color: '#fff' });
		expect(result.success).toBe(false);
	});

	it('should reject color without # prefix', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'Test', color: 'ff0000' });
		expect(result.success).toBe(false);
	});

	it('should accept color with uppercase letters (#FF0000)', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'Test', color: '#FF0000' });
		expect(result.success).toBe(true);
	});

	it('should accept all fields provided', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 42, name: 'Prod', color: '#abcdef', isDefault: true });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({ environmentId: 42, name: 'Prod', color: '#abcdef', isDefault: true, baseUrl: '', credentials: '', memo: '' });
		}
	});

	it('should accept detail fields (baseUrl, credentials, memo)', () => {
		const result = updateEnvironmentSchema.safeParse({
			environmentId: 1, name: 'QA', color: '#ff0000',
			baseUrl: 'https://qa.example.com',
			credentials: 'admin / pass',
			memo: 'Reset daily'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.baseUrl).toBe('https://qa.example.com');
			expect(result.data.credentials).toBe('admin / pass');
			expect(result.data.memo).toBe('Reset daily');
		}
	});

	it('should default detail fields to empty string when not provided', () => {
		const result = updateEnvironmentSchema.safeParse({ environmentId: 1, name: 'QA', color: '#ff0000' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.baseUrl).toBe('');
			expect(result.data.credentials).toBe('');
			expect(result.data.memo).toBe('');
		}
	});

	it('should reject baseUrl exceeding 500 characters', () => {
		const result = updateEnvironmentSchema.safeParse({
			environmentId: 1, name: 'QA', color: '#ff0000', baseUrl: 'a'.repeat(501)
		});
		expect(result.success).toBe(false);
	});

	it('should reject credentials exceeding 1000 characters', () => {
		const result = updateEnvironmentSchema.safeParse({
			environmentId: 1, name: 'QA', color: '#ff0000', credentials: 'a'.repeat(1001)
		});
		expect(result.success).toBe(false);
	});

	it('should reject memo exceeding 2000 characters', () => {
		const result = updateEnvironmentSchema.safeParse({
			environmentId: 1, name: 'QA', color: '#ff0000', memo: 'a'.repeat(2001)
		});
		expect(result.success).toBe(false);
	});
});
