import { z } from 'zod';

export const createTagSchema = z.object({
	name: z.string().min(1, 'Tag name is required').max(50, 'Name must be 50 characters or less'),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
});

export const updateTagSchema = z.object({
	tagId: z.number().int().positive(),
	name: z.string().min(1, 'Tag name is required').max(50, 'Name must be 50 characters or less'),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
});

export const assignTagSchema = z.object({
	tagId: z.number().int().positive()
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type AssignTagInput = z.infer<typeof assignTagSchema>;
