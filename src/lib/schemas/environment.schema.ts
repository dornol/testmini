import { z } from 'zod';

export const createEnvironmentSchema = z.object({
	name: z.string().min(1, 'Environment name is required').max(30, 'Name must be 30 characters or less'),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
	isDefault: z.boolean().default(false),
	baseUrl: z.string().max(500).optional().default(''),
	credentials: z.string().max(1000).optional().default(''),
	memo: z.string().max(2000).optional().default('')
});

export const updateEnvironmentSchema = z.object({
	environmentId: z.number().int().positive(),
	name: z.string().min(1, 'Environment name is required').max(30, 'Name must be 30 characters or less'),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
	isDefault: z.boolean().default(false),
	baseUrl: z.string().max(500).optional().default(''),
	credentials: z.string().max(1000).optional().default(''),
	memo: z.string().max(2000).optional().default('')
});

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;
