import { describe, it, expect } from 'vitest';
import { updateRiskSchema } from './risk.schema';

describe('risk.schema', () => {
	describe('updateRiskSchema', () => {
		it('accepts valid impact and likelihood', () => {
			const result = updateRiskSchema.safeParse({ riskImpact: 'HIGH', riskLikelihood: 'MEDIUM' });
			expect(result.success).toBe(true);
		});

		it('accepts null values (to clear)', () => {
			const result = updateRiskSchema.safeParse({ riskImpact: null, riskLikelihood: null });
			expect(result.success).toBe(true);
		});

		it('rejects invalid risk level', () => {
			const result = updateRiskSchema.safeParse({ riskImpact: 'INVALID', riskLikelihood: 'HIGH' });
			expect(result.success).toBe(false);
		});

		it('accepts all valid enum values', () => {
			for (const level of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
				const result = updateRiskSchema.safeParse({ riskImpact: level, riskLikelihood: level });
				expect(result.success).toBe(true);
			}
		});
	});
});
