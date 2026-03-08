import { z } from 'zod';

export const createEnvironmentSchema = z.object({
	name: z.string().min(1, 'Environment name is required').max(30, 'Name must be 30 characters or less'),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
	isDefault: z.boolean().default(false)
});

export const updateEnvironmentSchema = z.object({
	environmentId: z.number().int().positive(),
	name: z.string().min(1, 'Environment name is required').max(30, 'Name must be 30 characters or less'),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
	isDefault: z.boolean().default(false)
});

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;
