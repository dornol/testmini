import { z } from 'zod';

export const createReleaseSchema = z.object({
	name: z.string().min(1).max(200),
	version: z.string().max(100).optional(),
	description: z.string().max(2000).optional(),
	status: z.enum(['PLANNING', 'IN_PROGRESS', 'READY', 'RELEASED']).optional(),
	targetDate: z.string().optional(),
	releaseDate: z.string().optional()
});

export const updateReleaseSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	version: z.string().max(100).nullable().optional(),
	description: z.string().max(2000).nullable().optional(),
	status: z.enum(['PLANNING', 'IN_PROGRESS', 'READY', 'RELEASED']).optional(),
	targetDate: z.string().nullable().optional(),
	releaseDate: z.string().nullable().optional()
});

export type CreateReleaseInput = z.infer<typeof createReleaseSchema>;
export type UpdateReleaseInput = z.infer<typeof updateReleaseSchema>;
