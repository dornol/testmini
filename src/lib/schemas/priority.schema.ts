import { z } from 'zod';

export const createPrioritySchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Priority name is required')
			.max(30, 'Name must be 30 characters or less'),
		color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
		isDefault: z.boolean().default(false)
	})
	.strict();

export const updatePrioritySchema = z
	.object({
		priorityId: z.number().int().positive(),
		name: z
			.string()
			.trim()
			.min(1, 'Priority name is required')
			.max(30, 'Name must be 30 characters or less'),
		color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
		isDefault: z.boolean().default(false)
	})
	.strict();

export type CreatePriorityInput = z.infer<typeof createPrioritySchema>;
export type UpdatePriorityInput = z.infer<typeof updatePrioritySchema>;
