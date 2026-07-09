import { z } from 'zod';

const MAX_TEST_CASE_IDS = 500;

const testCaseIdSchema = z
	.number()
	.int()
	.positive()
	.refine(Number.isSafeInteger, 'Test case ID must be a safe integer');

const testCaseIdsSchema = z
	.array(testCaseIdSchema)
	.max(MAX_TEST_CASE_IDS, `testCaseIds must contain ${MAX_TEST_CASE_IDS} items or less`)
	.superRefine((ids, ctx) => {
		const seen = new Set<number>();
		for (const [index, id] of ids.entries()) {
			if (seen.has(id)) {
				ctx.addIssue({
					code: 'custom',
					message: 'testCaseIds must not contain duplicates',
					path: [index]
				});
			}
			seen.add(id);
		}
	});

export const createTestPlanSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2000).optional(),
	milestone: z.string().max(200).optional(),
	startDate: z.string().optional(),
	endDate: z.string().optional(),
	releaseId: z.number().int().positive().nullable().optional(),
	testCaseIds: testCaseIdsSchema.default([])
});

export const updateTestPlanSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	description: z.string().max(2000).nullable().optional(),
	status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
	milestone: z.string().max(200).nullable().optional(),
	startDate: z.string().nullable().optional(),
	endDate: z.string().nullable().optional(),
	releaseId: z.number().int().positive().nullable().optional()
});

export type CreateTestPlanInput = z.infer<typeof createTestPlanSchema>;
export type UpdateTestPlanInput = z.infer<typeof updateTestPlanSchema>;
