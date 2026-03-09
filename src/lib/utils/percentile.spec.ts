import { describe, it, expect } from 'vitest';
import { percentile, round2 } from './percentile';

describe('percentile', () => {
	it('should return median for p50 with odd count', () => {
		expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
	});

	it('should interpolate between values for p50 with even count', () => {
		// index = 0.5 * 3 = 1.5 → between 20 and 30 → 25
		expect(percentile([10, 20, 30, 40], 50)).toBe(25);
	});

	it('should return first element for p0', () => {
		expect(percentile([5, 10, 15, 20], 0)).toBe(5);
	});

	it('should return last element for p100', () => {
		expect(percentile([5, 10, 15, 20], 100)).toBe(20);
	});

	it('should handle single element', () => {
		expect(percentile([42], 50)).toBe(42);
		expect(percentile([42], 95)).toBe(42);
		expect(percentile([42], 0)).toBe(42);
	});

	it('should calculate p95 for 20 values', () => {
		const data = Array.from({ length: 20 }, (_, i) => i + 1);
		const result = percentile(data, 95);
		// index = 0.95 * 19 = 18.05 → between 19 and 20
		expect(result).toBeGreaterThan(19);
		expect(result).toBeLessThan(20);
		expect(result).toBeCloseTo(19.05, 1);
	});

	it('should calculate p99 for 100 values', () => {
		const data = Array.from({ length: 100 }, (_, i) => i + 1);
		const result = percentile(data, 99);
		expect(result).toBeGreaterThan(99);
		expect(result).toBeLessThanOrEqual(100);
	});

	it('should handle two elements', () => {
		expect(percentile([100, 200], 0)).toBe(100);
		expect(percentile([100, 200], 50)).toBe(150);
		expect(percentile([100, 200], 100)).toBe(200);
		expect(percentile([100, 200], 25)).toBe(125);
		expect(percentile([100, 200], 75)).toBe(175);
	});

	it('should return exact value when index is integer', () => {
		const data = [10, 20, 30, 40, 50]; // 5 elements
		// p25 → index = 0.25 * 4 = 1.0 → data[1] = 20
		expect(percentile(data, 25)).toBe(20);
		// p75 → index = 0.75 * 4 = 3.0 → data[3] = 40
		expect(percentile(data, 75)).toBe(40);
	});

	it('should handle identical values', () => {
		expect(percentile([5, 5, 5, 5, 5], 50)).toBe(5);
		expect(percentile([5, 5, 5, 5, 5], 95)).toBe(5);
	});
});

describe('round2', () => {
	it('should round to 2 decimal places', () => {
		expect(round2(1.234)).toBe(1.23);
		expect(round2(1.235)).toBe(1.24);
	});

	it('should handle integers', () => {
		expect(round2(42)).toBe(42);
	});

	it('should handle zero', () => {
		expect(round2(0)).toBe(0);
	});

	it('should handle negative numbers', () => {
		expect(round2(-1.567)).toBe(-1.57);
	});

	it('should handle very small numbers', () => {
		expect(round2(0.001)).toBe(0);
		expect(round2(0.005)).toBe(0.01);
	});

	it('should not change already rounded values', () => {
		expect(round2(1.23)).toBe(1.23);
		expect(round2(0.1)).toBe(0.1);
	});
});
