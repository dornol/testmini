import { describe, it, expect } from 'vitest';
import { computeRiskLevel, isValidRiskLevel, riskSortOrder, RISK_LEVELS } from './risk-matrix';

describe('risk-matrix', () => {
	describe('computeRiskLevel', () => {
		// 4×4 matrix = 16 combinations
		it('CRITICAL × CRITICAL = CRITICAL', () => expect(computeRiskLevel('CRITICAL', 'CRITICAL')).toBe('CRITICAL'));
		it('CRITICAL × HIGH = CRITICAL', () => expect(computeRiskLevel('CRITICAL', 'HIGH')).toBe('CRITICAL'));
		it('CRITICAL × MEDIUM = HIGH', () => expect(computeRiskLevel('CRITICAL', 'MEDIUM')).toBe('HIGH'));
		it('CRITICAL × LOW = HIGH', () => expect(computeRiskLevel('CRITICAL', 'LOW')).toBe('HIGH'));
		it('HIGH × CRITICAL = CRITICAL', () => expect(computeRiskLevel('HIGH', 'CRITICAL')).toBe('CRITICAL'));
		it('HIGH × HIGH = HIGH', () => expect(computeRiskLevel('HIGH', 'HIGH')).toBe('HIGH'));
		it('HIGH × MEDIUM = HIGH', () => expect(computeRiskLevel('HIGH', 'MEDIUM')).toBe('HIGH'));
		it('HIGH × LOW = MEDIUM', () => expect(computeRiskLevel('HIGH', 'LOW')).toBe('MEDIUM'));
		it('MEDIUM × CRITICAL = HIGH', () => expect(computeRiskLevel('MEDIUM', 'CRITICAL')).toBe('HIGH'));
		it('MEDIUM × HIGH = HIGH', () => expect(computeRiskLevel('MEDIUM', 'HIGH')).toBe('HIGH'));
		it('MEDIUM × MEDIUM = MEDIUM', () => expect(computeRiskLevel('MEDIUM', 'MEDIUM')).toBe('MEDIUM'));
		it('MEDIUM × LOW = LOW', () => expect(computeRiskLevel('MEDIUM', 'LOW')).toBe('LOW'));
		it('LOW × CRITICAL = HIGH', () => expect(computeRiskLevel('LOW', 'CRITICAL')).toBe('HIGH'));
		it('LOW × HIGH = MEDIUM', () => expect(computeRiskLevel('LOW', 'HIGH')).toBe('MEDIUM'));
		it('LOW × MEDIUM = LOW', () => expect(computeRiskLevel('LOW', 'MEDIUM')).toBe('LOW'));
		it('LOW × LOW = LOW', () => expect(computeRiskLevel('LOW', 'LOW')).toBe('LOW'));

		// Edge cases
		it('returns null when impact is null', () => expect(computeRiskLevel(null, 'HIGH')).toBeNull());
		it('returns null when likelihood is null', () => expect(computeRiskLevel('HIGH', null)).toBeNull());
		it('returns null when both are null', () => expect(computeRiskLevel(null, null)).toBeNull());
		it('returns null for invalid impact', () => expect(computeRiskLevel('INVALID', 'HIGH')).toBeNull());
		it('returns null for invalid likelihood', () => expect(computeRiskLevel('HIGH', 'INVALID')).toBeNull());
	});

	describe('isValidRiskLevel', () => {
		it('returns true for valid risk levels', () => {
			for (const level of RISK_LEVELS) {
				expect(isValidRiskLevel(level)).toBe(true);
			}
		});

		it('returns false for invalid values', () => {
			expect(isValidRiskLevel('INVALID')).toBe(false);
			expect(isValidRiskLevel('')).toBe(false);
			expect(isValidRiskLevel('high')).toBe(false); // case-sensitive
		});
	});

	describe('riskSortOrder', () => {
		it('returns 0 for CRITICAL', () => expect(riskSortOrder('CRITICAL')).toBe(0));
		it('returns 1 for HIGH', () => expect(riskSortOrder('HIGH')).toBe(1));
		it('returns 2 for MEDIUM', () => expect(riskSortOrder('MEDIUM')).toBe(2));
		it('returns 3 for LOW', () => expect(riskSortOrder('LOW')).toBe(3));
		it('returns 999 for null', () => expect(riskSortOrder(null)).toBe(999));
	});
});
