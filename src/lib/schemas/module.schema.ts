import { z } from 'zod';

export const createModuleSchema = z.object({
	name: z.string().min(1).max(200),
	parentModuleId: z.number().int().positive().nullable().optional(),
	description: z.string().max(2000).optional()
});

export const updateModuleSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	parentModuleId: z.number().int().positive().nullable().optional(),
	description: z.string().max(2000).nullable().optional(),
	sortOrder: z.number().int().optional()
});

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
