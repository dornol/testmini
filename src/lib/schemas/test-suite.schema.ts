import { z } from 'zod';

const MAX_TEST_CASE_IDS = 500;

const testSuiteNameSchema = z.string().trim().min(1, 'Name is required').max(200);
const testSuiteDescriptionSchema = z
	.string()
	.trim()
	.max(1000)
	.transform((value) => (value.length > 0 ? value : null));
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

export const createTestSuiteSchema = z
	.object({
		name: testSuiteNameSchema,
		description: testSuiteDescriptionSchema.nullish(),
		testCaseIds: testCaseIdsSchema.default([])
	})
	.strict();

export const updateTestSuiteSchema = z
	.object({
		name: testSuiteNameSchema.optional(),
		description: testSuiteDescriptionSchema.nullish()
	})
	.strict();

export const suiteItemsSchema = z
	.object({
		testCaseIds: testCaseIdsSchema.min(1, 'At least one test case ID is required')
	})
	.strict();

export type CreateTestSuiteInput = z.infer<typeof createTestSuiteSchema>;
export type UpdateTestSuiteInput = z.infer<typeof updateTestSuiteSchema>;
export type SuiteItemsInput = z.infer<typeof suiteItemsSchema>;
