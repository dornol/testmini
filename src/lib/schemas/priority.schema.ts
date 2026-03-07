import { z } from 'zod';

export const createPrioritySchema = z.object({
	name: z.string().min(1, 'Priority name is required').max(30, 'Name must be 30 characters or less'),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
	isDefault: z.boolean().default(false)
});

export const updatePrioritySchema = z.object({
	priorityId: z.number().int().positive(),
	name: z.string().min(1, 'Priority name is required').max(30, 'Name must be 30 characters or less'),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
	isDefault: z.boolean().default(false)
});

export type CreatePriorityInput = z.infer<typeof createPrioritySchema>;
export type UpdatePriorityInput = z.infer<typeof updatePrioritySchema>;
