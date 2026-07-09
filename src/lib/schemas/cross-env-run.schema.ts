import { z } from 'zod';

const MAX_TEST_CASE_IDS = 500;
const MAX_ENVIRONMENTS = 20;
const MAX_ENVIRONMENT_LENGTH = 30;

function hasUniqueItems<T>(items: T[]): boolean {
	return new Set(items).size === items.length;
}

export const createCrossEnvRunSchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		testCaseIds: z
			.array(z.number().int().positive())
			.min(1)
			.max(MAX_TEST_CASE_IDS)
			.refine(hasUniqueItems, 'testCaseIds must not contain duplicates'),
		environments: z
			.array(z.string().trim().min(1).max(MAX_ENVIRONMENT_LENGTH))
			.min(2)
			.max(MAX_ENVIRONMENTS)
			.refine(hasUniqueItems, 'environments must not contain duplicates'),
		testPlanId: z.number().int().positive().optional(),
		releaseId: z.number().int().positive().optional(),
		testCycleId: z.number().int().positive().optional()
	})
	.strict();

export type CreateCrossEnvRunInput = z.infer<typeof createCrossEnvRunSchema>;
