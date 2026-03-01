import { z } from 'zod';

export const addMemberSchema = z.object({
	userId: z.string().min(1, 'User is required'),
	role: z.enum(['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'], {
		required_error: 'Role is required'
	})
});

export const updateMemberRoleSchema = z.object({
	memberId: z.number().int().positive(),
	role: z.enum(['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'], {
		required_error: 'Role is required'
	})
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
