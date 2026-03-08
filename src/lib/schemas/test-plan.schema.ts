import { z } from 'zod';

export const createTestPlanSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2000).optional(),
	milestone: z.string().max(200).optional(),
	startDate: z.string().optional(),
	endDate: z.string().optional(),
	testCaseIds: z.array(z.number().int().positive()).default([])
});

export const updateTestPlanSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	description: z.string().max(2000).nullable().optional(),
	status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
	milestone: z.string().max(200).nullable().optional(),
	startDate: z.string().nullable().optional(),
	endDate: z.string().nullable().optional()
});

export type CreateTestPlanInput = z.infer<typeof createTestPlanSchema>;
export type UpdateTestPlanInput = z.infer<typeof updateTestPlanSchema>;
