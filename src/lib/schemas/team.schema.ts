import { z } from 'zod';

export const createTeamSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(1000).optional()
});

export const updateTeamSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	description: z.string().max(1000).nullable().optional()
});

export const addTeamMemberSchema = z.object({
	userId: z.string().min(1),
	role: z.enum(['OWNER', 'ADMIN', 'MEMBER'])
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
