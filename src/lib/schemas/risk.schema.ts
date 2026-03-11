import { z } from 'zod';

const riskLevelEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

export const updateRiskSchema = z.object({
	riskImpact: riskLevelEnum.nullable(),
	riskLikelihood: riskLevelEnum.nullable()
});

export type UpdateRiskInput = z.infer<typeof updateRiskSchema>;
