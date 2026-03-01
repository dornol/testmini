import { z } from 'zod';

export const createFailureSchema = z.object({
	failureEnvironment: z.string().max(200).default(''),
	testMethod: z.string().max(500).default(''),
	errorMessage: z.string().max(2000).default(''),
	stackTrace: z.string().max(10000).default(''),
	comment: z.string().max(2000).default('')
});

export const updateFailureSchema = createFailureSchema;

export type CreateFailureInput = z.infer<typeof createFailureSchema>;
