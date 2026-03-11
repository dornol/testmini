import { z } from 'zod';

export const createCrossEnvRunSchema = z.object({
	name: z.string().min(1).max(200),
	testCaseIds: z.array(z.number().int().positive()).min(1),
	environments: z.array(z.string().min(1)).min(2),
	testPlanId: z.number().int().positive().optional(),
	releaseId: z.number().int().positive().optional(),
	testCycleId: z.number().int().positive().optional()
});

export type CreateCrossEnvRunInput = z.infer<typeof createCrossEnvRunSchema>;
