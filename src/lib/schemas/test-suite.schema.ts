import { z } from 'zod';

export const createTestSuiteSchema = z.object({
	name: z.string().min(1, 'Name is required').max(200),
	description: z.string().max(1000).optional(),
	testCaseIds: z.array(z.number().int().positive()).default([])
});

export const updateTestSuiteSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	description: z.string().max(1000).optional().nullable()
});

export const suiteItemsSchema = z.object({
	testCaseIds: z.array(z.number().int().positive()).min(1, 'At least one test case ID is required')
});

export type CreateTestSuiteInput = z.infer<typeof createTestSuiteSchema>;
export type UpdateTestSuiteInput = z.infer<typeof updateTestSuiteSchema>;
export type SuiteItemsInput = z.infer<typeof suiteItemsSchema>;
