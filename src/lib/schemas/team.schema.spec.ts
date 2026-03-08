import { describe, it, expect } from 'vitest';
import { createTeamSchema, updateTeamSchema, addTeamMemberSchema } from './team.schema';

describe('team schemas', () => {
	// ── createTeamSchema ─────────────────────────────────

	describe('createTeamSchema', () => {
		it('should accept valid name only', () => {
			const result = createTeamSchema.safeParse({ name: 'My Team' });
			expect(result.success).toBe(true);
		});

		it('should accept valid name with description', () => {
			const result = createTeamSchema.safeParse({ name: 'My Team', description: 'A great team' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.description).toBe('A great team');
			}
		});

		it('should reject missing name', () => {
			const result = createTeamSchema.safeParse({});
			expect(result.success).toBe(false);
		});

		it('should reject empty name', () => {
			const result = createTeamSchema.safeParse({ name: '' });
			expect(result.success).toBe(false);
		});

		it('should reject name longer than 100 characters', () => {
			const result = createTeamSchema.safeParse({ name: 'a'.repeat(101) });
			expect(result.success).toBe(false);
		});

		it('should accept name exactly 100 characters', () => {
			const result = createTeamSchema.safeParse({ name: 'a'.repeat(100) });
			expect(result.success).toBe(true);
		});

		it('should reject description longer than 1000 characters', () => {
			const result = createTeamSchema.safeParse({ name: 'Valid', description: 'x'.repeat(1001) });
			expect(result.success).toBe(false);
		});

		it('should accept description exactly 1000 characters', () => {
			const result = createTeamSchema.safeParse({ name: 'Valid', description: 'x'.repeat(1000) });
			expect(result.success).toBe(true);
		});
	});

	// ── updateTeamSchema ─────────────────────────────────

	describe('updateTeamSchema', () => {
		it('should accept valid partial update with name', () => {
			const result = updateTeamSchema.safeParse({ name: 'Updated Name' });
			expect(result.success).toBe(true);
		});

		it('should accept empty object (all fields optional)', () => {
			const result = updateTeamSchema.safeParse({});
			expect(result.success).toBe(true);
		});

		it('should reject name longer than 100 characters', () => {
			const result = updateTeamSchema.safeParse({ name: 'a'.repeat(101) });
			expect(result.success).toBe(false);
		});

		it('should accept nullable description', () => {
			const result = updateTeamSchema.safeParse({ description: null });
			expect(result.success).toBe(true);
		});

		it('should reject description longer than 1000 characters', () => {
			const result = updateTeamSchema.safeParse({ description: 'x'.repeat(1001) });
			expect(result.success).toBe(false);
		});
	});

	// ── addTeamMemberSchema ──────────────────────────────

	describe('addTeamMemberSchema', () => {
		it('should accept valid userId and role', () => {
			const result = addTeamMemberSchema.safeParse({ userId: 'user-1', role: 'MEMBER' });
			expect(result.success).toBe(true);
		});

		it('should accept all valid roles', () => {
			for (const role of ['OWNER', 'ADMIN', 'MEMBER']) {
				const result = addTeamMemberSchema.safeParse({ userId: 'user-1', role });
				expect(result.success).toBe(true);
			}
		});

		it('should reject missing userId', () => {
			const result = addTeamMemberSchema.safeParse({ role: 'MEMBER' });
			expect(result.success).toBe(false);
		});

		it('should reject empty userId', () => {
			const result = addTeamMemberSchema.safeParse({ userId: '', role: 'MEMBER' });
			expect(result.success).toBe(false);
		});

		it('should reject missing role', () => {
			const result = addTeamMemberSchema.safeParse({ userId: 'user-1' });
			expect(result.success).toBe(false);
		});

		it('should reject invalid role', () => {
			const result = addTeamMemberSchema.safeParse({ userId: 'user-1', role: 'SUPERADMIN' });
			expect(result.success).toBe(false);
		});
	});
});
