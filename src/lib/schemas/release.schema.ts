import { z } from 'zod';

const releaseDateStringSchema = z
	.string()
	.refine((value) => !value || !Number.isNaN(new Date(value).getTime()), 'Invalid date');

export const createReleaseSchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		version: z.string().trim().max(100).optional(),
		description: z.string().trim().max(2000).optional(),
		status: z.enum(['PLANNING', 'IN_PROGRESS', 'READY', 'RELEASED']).optional(),
		targetDate: releaseDateStringSchema.optional(),
		releaseDate: releaseDateStringSchema.optional()
	})
	.strict();

export const updateReleaseSchema = z
	.object({
		name: z.string().trim().min(1).max(200).optional(),
		version: z.string().trim().max(100).nullable().optional(),
		description: z.string().trim().max(2000).nullable().optional(),
		status: z.enum(['PLANNING', 'IN_PROGRESS', 'READY', 'RELEASED']).optional(),
		targetDate: releaseDateStringSchema.nullable().optional(),
		releaseDate: releaseDateStringSchema.nullable().optional()
	})
	.strict();

export type CreateReleaseInput = z.infer<typeof createReleaseSchema>;
export type UpdateReleaseInput = z.infer<typeof updateReleaseSchema>;
