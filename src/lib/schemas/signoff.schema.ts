import { z } from 'zod';

export const createSignoffSchema = z.object({
	decision: z.enum(['APPROVED', 'REJECTED']),
	comment: z.string().max(2000).optional()
});

export type CreateSignoffInput = z.infer<typeof createSignoffSchema>;
