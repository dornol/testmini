import { describe, it, expect } from 'vitest';
import { addMemberSchema, updateMemberRoleSchema } from './member.schema';

describe('addMemberSchema', () => {
	it('should accept valid input', () => {
		const result = addMemberSchema.safeParse({ userId: 'user-123', role: 'QA' });
		expect(result.success).toBe(true);
	});

	it('should reject missing userId', () => {
		const result = addMemberSchema.safeParse({ role: 'QA' });
		expect(result.success).toBe(false);
	});

	it('should reject empty userId', () => {
		const result = addMemberSchema.safeParse({ userId: '', role: 'QA' });
		expect(result.success).toBe(false);
	});

	it('should reject missing role', () => {
		const result = addMemberSchema.safeParse({ userId: 'user-123' });
		expect(result.success).toBe(false);
	});

	it('should reject invalid role', () => {
		const result = addMemberSchema.safeParse({ userId: 'user-123', role: 'SUPERADMIN' });
		expect(result.success).toBe(false);
	});

	it('should accept all valid roles', () => {
		for (const role of ['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER']) {
			const result = addMemberSchema.safeParse({ userId: 'u1', role });
			expect(result.success).toBe(true);
		}
	});
});

describe('updateMemberRoleSchema', () => {
	it('should accept valid input', () => {
		const result = updateMemberRoleSchema.safeParse({ memberId: 1, role: 'DEV' });
		expect(result.success).toBe(true);
	});

	it('should reject non-positive memberId', () => {
		const result = updateMemberRoleSchema.safeParse({ memberId: 0, role: 'QA' });
		expect(result.success).toBe(false);
	});

	it('should reject non-integer memberId', () => {
		const result = updateMemberRoleSchema.safeParse({ memberId: 1.5, role: 'QA' });
		expect(result.success).toBe(false);
	});

	it('should reject invalid role', () => {
		const result = updateMemberRoleSchema.safeParse({ memberId: 1, role: 'ADMIN' });
		expect(result.success).toBe(false);
	});
});
