/**
 * Risk-based testing: compute risk level from impact × likelihood matrix.
 */

export const RISK_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

const RISK_ORDER: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/**
 * 4×4 risk matrix: [impact][likelihood] → risk level
 *
 *                  Likelihood
 *                  CRITICAL  HIGH    MEDIUM  LOW
 * Impact CRITICAL  CRITICAL  CRITICAL HIGH   HIGH
 *        HIGH      CRITICAL  HIGH    HIGH    MEDIUM
 *        MEDIUM    HIGH      HIGH    MEDIUM  LOW
 *        LOW       HIGH      MEDIUM  LOW     LOW
 */
const MATRIX: Record<RiskLevel, Record<RiskLevel, RiskLevel>> = {
	CRITICAL: { CRITICAL: 'CRITICAL', HIGH: 'CRITICAL', MEDIUM: 'HIGH', LOW: 'HIGH' },
	HIGH: { CRITICAL: 'CRITICAL', HIGH: 'HIGH', MEDIUM: 'HIGH', LOW: 'MEDIUM' },
	MEDIUM: { CRITICAL: 'HIGH', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' },
	LOW: { CRITICAL: 'HIGH', HIGH: 'MEDIUM', MEDIUM: 'LOW', LOW: 'LOW' }
};

export function computeRiskLevel(impact: string | null, likelihood: string | null): RiskLevel | null {
	if (!impact || !likelihood) return null;
	const i = impact as RiskLevel;
	const l = likelihood as RiskLevel;
	if (!MATRIX[i] || !MATRIX[i][l]) return null;
	return MATRIX[i][l];
}

export function isValidRiskLevel(value: string): value is RiskLevel {
	return RISK_LEVELS.includes(value as RiskLevel);
}

export function riskSortOrder(level: RiskLevel | null): number {
	if (!level) return 999;
	return RISK_ORDER[level] ?? 999;
}
