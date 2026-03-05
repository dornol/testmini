import { z } from 'zod';

export const stepSchema = z.object({
	action: z.string().min(1, 'Action is required'),
	expected: z.string().default('')
});

export const createTestCaseSchema = z.object({
	title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
	precondition: z.string().max(2000).default(''),
	steps: z.array(stepSchema).default([]),
	expectedResult: z.string().max(2000).default(''),
	priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
	automationKey: z.string().max(200).optional().default('')
});

export const updateTestCaseSchema = createTestCaseSchema.extend({
	revision: z.number().int().positive('Revision is required')
});

export type CreateTestCaseInput = z.infer<typeof createTestCaseSchema>;
export type UpdateTestCaseInput = z.infer<typeof updateTestCaseSchema>;
export type StepInput = z.infer<typeof stepSchema>;
