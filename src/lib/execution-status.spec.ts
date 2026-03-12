import { describe, it, expect } from 'vitest';
import { statusColorText, statusColorBg, statusColorBadge } from './execution-status';

const STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'PENDING'] as const;

describe('statusColorText', () => {
	it('returns green classes for PASS', () => {
		expect(statusColorText('PASS')).toContain('green');
	});

	it('returns red classes for FAIL', () => {
		expect(statusColorText('FAIL')).toContain('red');
	});

	it('returns orange classes for BLOCKED (not yellow)', () => {
		const result = statusColorText('BLOCKED');
		expect(result).toContain('orange');
		expect(result).not.toContain('yellow');
	});

	it('returns gray for SKIPPED', () => {
		expect(statusColorText('SKIPPED')).toContain('gray');
	});

	it('returns muted for PENDING', () => {
		expect(statusColorText('PENDING')).toContain('muted');
	});

	it('returns muted for unknown status', () => {
		expect(statusColorText('UNKNOWN')).toContain('muted');
	});

	it('handles null', () => {
		expect(statusColorText(null)).toContain('muted');
	});

	it('returns text-only classes (no bg-)', () => {
		for (const s of STATUSES) {
			expect(statusColorText(s)).not.toMatch(/\bbg-/);
		}
	});
});

describe('statusColorBg', () => {
	it('returns green bg + text for PASS', () => {
		const result = statusColorBg('PASS');
		expect(result).toContain('bg-green');
		expect(result).toContain('text-green');
	});

	it('returns red bg + text for FAIL', () => {
		const result = statusColorBg('FAIL');
		expect(result).toContain('bg-red');
		expect(result).toContain('text-red');
	});

	it('returns orange bg + text for BLOCKED', () => {
		const result = statusColorBg('BLOCKED');
		expect(result).toContain('bg-orange');
		expect(result).toContain('text-orange');
	});

	it('returns gray bg + text for SKIPPED', () => {
		const result = statusColorBg('SKIPPED');
		expect(result).toContain('bg-gray');
		expect(result).toContain('text-gray');
	});

	it('includes dark mode variants', () => {
		for (const s of ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED']) {
			expect(statusColorBg(s)).toContain('dark:');
		}
	});

	it('returns muted for unknown status', () => {
		expect(statusColorBg('UNKNOWN')).toContain('muted');
	});
});

describe('statusColorBadge', () => {
	it('returns badge-style classes with bg- and text- for each status', () => {
		const result = statusColorBadge('PASS');
		expect(result).toContain('bg-green-100');
		expect(result).toContain('text-green-800');
	});

	it('returns orange for BLOCKED', () => {
		expect(statusColorBadge('BLOCKED')).toContain('orange');
	});

	it('returns yellow for PENDING', () => {
		expect(statusColorBadge('PENDING')).toContain('yellow');
	});

	it('includes dark mode variants', () => {
		for (const s of STATUSES) {
			expect(statusColorBadge(s)).toContain('dark:');
		}
	});

	it('handles null', () => {
		expect(statusColorBadge(null)).toContain('muted');
	});

	it('returns muted for unknown', () => {
		expect(statusColorBadge('WHATEVER')).toContain('muted');
	});
});
