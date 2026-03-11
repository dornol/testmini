import { z } from 'zod';

export const createTestCycleSchema = z.object({
	name: z.string().min(1).max(200),
	cycleNumber: z.number().int().positive(),
	releaseId: z.number().int().positive().optional(),
	status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED']).optional(),
	startDate: z.string().optional(),
	endDate: z.string().optional()
});

export const updateTestCycleSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED']).optional(),
	releaseId: z.number().int().positive().nullable().optional(),
	startDate: z.string().nullable().optional(),
	endDate: z.string().nullable().optional()
});

export type CreateTestCycleInput = z.infer<typeof createTestCycleSchema>;
export type UpdateTestCycleInput = z.infer<typeof updateTestCycleSchema>;
