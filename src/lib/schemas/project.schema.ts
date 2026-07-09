import { z } from 'zod';

export const createProjectSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Project name is required')
			.max(100, 'Name must be 100 characters or less'),
		description: z
			.string()
			.trim()
			.max(1000, 'Description must be 1000 characters or less')
			.default('')
	})
	.strict();

export const updateProjectSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Project name is required')
			.max(100, 'Name must be 100 characters or less')
			.optional(),
		description: z
			.string()
			.trim()
			.max(1000, 'Description must be 1000 characters or less')
			.optional()
	})
	.strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
