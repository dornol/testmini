import { z } from 'zod';

const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const noControlCharacters = (message: string) =>
	z.string().refine((value) => !CONTROL_CHAR_PATTERN.test(value), message);

const releaseDateStringSchema = z
	.string()
	.refine((value) => !value || !Number.isNaN(new Date(value).getTime()), 'Invalid date');

export const createReleaseSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.pipe(noControlCharacters('Name must not contain control characters')),
		version: z
			.string()
			.trim()
			.max(100)
			.pipe(noControlCharacters('Version must not contain control characters'))
			.optional(),
		description: z.string().trim().max(2000).optional(),
		status: z.enum(['PLANNING', 'IN_PROGRESS', 'READY', 'RELEASED']).optional(),
		targetDate: releaseDateStringSchema.optional(),
		releaseDate: releaseDateStringSchema.optional()
	})
	.strict();

export const updateReleaseSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.pipe(noControlCharacters('Name must not contain control characters'))
			.optional(),
		version: z
			.string()
			.trim()
			.max(100)
			.pipe(noControlCharacters('Version must not contain control characters'))
			.nullable()
			.optional(),
		description: z.string().trim().max(2000).nullable().optional(),
		status: z.enum(['PLANNING', 'IN_PROGRESS', 'READY', 'RELEASED']).optional(),
		targetDate: releaseDateStringSchema.nullable().optional(),
		releaseDate: releaseDateStringSchema.nullable().optional()
	})
	.strict();

export type CreateReleaseInput = z.infer<typeof createReleaseSchema>;
export type UpdateReleaseInput = z.infer<typeof updateReleaseSchema>;
