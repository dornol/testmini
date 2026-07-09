import { z } from 'zod';

const MAX_TEST_CASE_IDS = 500;

function hasUniqueItems<T>(items: T[]): boolean {
	return new Set(items).size === items.length;
}

export const createTestRunSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(200),
	environment: z.string().trim().min(1, 'Environment is required').max(30),
	testCaseIds: z
		.array(z.number().int().positive())
		.min(1, 'Select at least one test case')
		.max(MAX_TEST_CASE_IDS)
		.refine(hasUniqueItems, 'testCaseIds must not contain duplicates')
});

export const updateExecutionSchema = z.object({
	status: z.enum(['PASS', 'FAIL', 'BLOCKED', 'SKIPPED']),
	comment: z.string().max(2000).optional()
});

export const updateTestRunSchema = z.object({
	name: z.string().trim().min(1).max(200).optional(),
	environment: z.string().trim().min(1).max(30).optional(),
	releaseId: z.number().int().positive().nullable().optional()
});

export type CreateTestRunInput = z.infer<typeof createTestRunSchema>;
export type UpdateExecutionInput = z.infer<typeof updateExecutionSchema>;
export type UpdateTestRunInput = z.infer<typeof updateTestRunSchema>;
