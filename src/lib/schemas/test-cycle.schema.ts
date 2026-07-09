import { z } from 'zod';

const testCycleNameSchema = z.string().trim().min(1).max(200);
const testCycleDateSchema = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), {
	message: 'Invalid date'
});

export const createTestCycleSchema = z
	.object({
		name: testCycleNameSchema,
		cycleNumber: z.number().int().positive(),
		releaseId: z.number().int().positive().optional(),
		status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED']).optional(),
		startDate: testCycleDateSchema.optional(),
		endDate: testCycleDateSchema.optional()
	})
	.refine(hasValidDateRange, {
		message: 'endDate must be on or after startDate',
		path: ['endDate']
	});

export const updateTestCycleSchema = z
	.object({
		name: testCycleNameSchema.optional(),
		status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED']).optional(),
		releaseId: z.number().int().positive().nullable().optional(),
		startDate: testCycleDateSchema.nullable().optional(),
		endDate: testCycleDateSchema.nullable().optional()
	})
	.refine(hasValidDateRange, {
		message: 'endDate must be on or after startDate',
		path: ['endDate']
	});

export type CreateTestCycleInput = z.infer<typeof createTestCycleSchema>;
export type UpdateTestCycleInput = z.infer<typeof updateTestCycleSchema>;

function hasValidDateRange(value: { startDate?: string | null; endDate?: string | null }): boolean {
	if (!value.startDate || !value.endDate) return true;
	return new Date(value.endDate).getTime() >= new Date(value.startDate).getTime();
}
