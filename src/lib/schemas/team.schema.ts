import { z } from 'zod';

export const createTeamSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		description: z.string().trim().max(1000).optional()
	})
	.strict();

export const updateTeamSchema = z
	.object({
		name: z.string().trim().min(1).max(100).optional(),
		description: z.string().trim().max(1000).nullable().optional()
	})
	.strict();

export const addTeamMemberSchema = z
	.object({
		userId: z.string().min(1),
		role: z.enum(['OWNER', 'ADMIN', 'MEMBER'])
	})
	.strict();

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
