import { z } from 'zod';

const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const noControlCharacters = (message: string) =>
	z.string().refine((value) => !CONTROL_CHAR_PATTERN.test(value), message);

export const createTagSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Tag name is required')
			.max(50, 'Name must be 50 characters or less')
			.pipe(noControlCharacters('Name must not contain control characters')),
		color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
	})
	.strict();

export const updateTagSchema = z
	.object({
		tagId: z.number().int().positive(),
		name: z
			.string()
			.trim()
			.min(1, 'Tag name is required')
			.max(50, 'Name must be 50 characters or less')
			.pipe(noControlCharacters('Name must not contain control characters')),
		color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
	})
	.strict();

export const assignTagSchema = z
	.object({
		tagId: z.number().int().positive()
	})
	.strict();

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type AssignTagInput = z.infer<typeof assignTagSchema>;
