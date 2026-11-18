import { z } from 'zod';

const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const noControlCharacters = (message: string) =>
	z.string().refine((value) => !CONTROL_CHAR_PATTERN.test(value), message);
const environmentMemo = z
	.string()
	.transform((value) => value.replace(/\r\n?/g, '\n'))
	.pipe(z.string().max(2000))
	.refine(
		(value) => !CONTROL_CHAR_PATTERN.test(value.replace(/\n/g, '')),
		'Memo must not contain control characters'
	)
	.optional()
	.default('');

export const createEnvironmentSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Environment name is required')
			.max(30, 'Name must be 30 characters or less')
			.pipe(noControlCharacters('Name must not contain control characters')),
		color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
		isDefault: z.boolean().default(false),
		baseUrl: z
			.string()
			.trim()
			.max(500)
			.pipe(noControlCharacters('Base URL must not contain control characters'))
			.optional()
			.default(''),
		credentials: z
			.string()
			.max(1000)
			.pipe(noControlCharacters('Credentials must not contain control characters'))
			.optional()
			.default(''),
		memo: environmentMemo
	})
	.strict();

export const updateEnvironmentSchema = z
	.object({
		environmentId: z.number().int().positive(),
		name: z
			.string()
			.trim()
			.min(1, 'Environment name is required')
			.max(30, 'Name must be 30 characters or less')
			.pipe(noControlCharacters('Name must not contain control characters')),
		color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
		isDefault: z.boolean().default(false),
		baseUrl: z
			.string()
			.trim()
			.max(500)
			.pipe(noControlCharacters('Base URL must not contain control characters'))
			.optional()
			.default(''),
		credentials: z
			.string()
			.max(1000)
			.pipe(noControlCharacters('Credentials must not contain control characters'))
			.optional()
			.default(''),
		memo: environmentMemo
	})
	.strict();

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;
