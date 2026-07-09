import { z } from 'zod';

const moduleNameSchema = z.string().trim().min(1).max(200);
const moduleDescriptionSchema = z
	.string()
	.trim()
	.max(2000)
	.transform((value) => (value.length > 0 ? value : null));
const moduleIdSchema = z
	.number()
	.int()
	.positive()
	.refine(Number.isSafeInteger, 'Module ID must be a safe integer');
const sortOrderSchema = z
	.number()
	.int()
	.refine(Number.isSafeInteger, 'Sort order must be a safe integer');

export const createModuleSchema = z.object({
	name: moduleNameSchema,
	parentModuleId: moduleIdSchema.nullish(),
	description: moduleDescriptionSchema.nullish()
});

export const updateModuleSchema = z.object({
	name: moduleNameSchema.optional(),
	parentModuleId: moduleIdSchema.nullish(),
	description: moduleDescriptionSchema.nullish(),
	sortOrder: sortOrderSchema.optional()
});

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
