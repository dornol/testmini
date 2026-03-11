import { z } from 'zod';

export const stepSchema = z.object({
	action: z.string().min(1, 'Action is required'),
	expected: z.string().default('')
});

export const gherkinStepSchema = z.object({
	keyword: z.enum(['Given', 'When', 'Then', 'And', 'But']),
	text: z.string().min(1, 'Step text is required'),
	expected: z.string().default('')
});

export const stepFormatSchema = z.enum(['STEPS', 'GHERKIN']).default('STEPS');

export const createTestCaseSchema = z.object({
	title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
	precondition: z.string().max(2000).default(''),
	steps: z.array(stepSchema).default([]),
	stepFormat: stepFormatSchema,
	expectedResult: z.string().max(2000).default(''),
	priority: z.string().min(1).max(30).default('MEDIUM'),
	automationKey: z.string().max(200).optional().default(''),
	customFields: z.record(z.string(), z.unknown()).optional().default({})
});

export const updateTestCaseSchema = createTestCaseSchema.extend({
	revision: z.number().int().positive('Revision is required'),
	customFields: z.record(z.string(), z.unknown()).optional().default({})
});

export type CreateTestCaseInput = z.infer<typeof createTestCaseSchema>;
export type UpdateTestCaseInput = z.infer<typeof updateTestCaseSchema>;
export type StepInput = z.infer<typeof stepSchema>;
