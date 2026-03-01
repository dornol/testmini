import { z } from 'zod';

export const createTestRunSchema = z.object({
	name: z.string().min(1, 'Name is required').max(200),
	environment: z.enum(['DEV', 'QA', 'STAGE', 'PROD'], {
		required_error: 'Environment is required'
	}),
	testCaseIds: z.array(z.number().int().positive()).min(1, 'Select at least one test case')
});

export const updateExecutionSchema = z.object({
	status: z.enum(['PASS', 'FAIL', 'BLOCKED', 'SKIPPED']),
	comment: z.string().max(2000).optional()
});

export type CreateTestRunInput = z.infer<typeof createTestRunSchema>;
export type UpdateExecutionInput = z.infer<typeof updateExecutionSchema>;
