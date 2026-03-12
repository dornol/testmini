import { describe, it, expect } from 'vitest';
import { formatDuration, formatDurationFromDates } from './format-utils';

describe('formatDuration', () => {
	it('formats sub-second as ms', () => {
		expect(formatDuration(0)).toBe('0ms');
		expect(formatDuration(500)).toBe('500ms');
		expect(formatDuration(999)).toBe('999ms');
	});

	it('formats seconds with one decimal', () => {
		expect(formatDuration(1000)).toBe('1.0s');
		expect(formatDuration(1500)).toBe('1.5s');
		expect(formatDuration(59900)).toBe('59.9s');
	});

	it('formats minutes and seconds', () => {
		expect(formatDuration(60000)).toBe('1m 0s');
		expect(formatDuration(90000)).toBe('1m 30s');
		expect(formatDuration(3599000)).toBe('59m 59s');
	});

	it('formats hours and minutes', () => {
		expect(formatDuration(3600000)).toBe('1h 0m');
		expect(formatDuration(5400000)).toBe('1h 30m');
		expect(formatDuration(7200000)).toBe('2h 0m');
	});

	it('handles exact boundaries', () => {
		expect(formatDuration(1000)).toBe('1.0s');
		expect(formatDuration(60000)).toBe('1m 0s');
		expect(formatDuration(3600000)).toBe('1h 0m');
	});
});

describe('formatDurationFromDates', () => {
	it('returns null if startedAt is null', () => {
		expect(formatDurationFromDates(null, '2024-01-01T00:01:00Z')).toBeNull();
	});

	it('returns null if completedAt is null', () => {
		expect(formatDurationFromDates('2024-01-01T00:00:00Z', null)).toBeNull();
	});

	it('returns null if both are null', () => {
		expect(formatDurationFromDates(null, null)).toBeNull();
	});

	it('returns null for negative duration', () => {
		expect(formatDurationFromDates('2024-01-01T00:01:00Z', '2024-01-01T00:00:00Z')).toBeNull();
	});

	it('formats duration from string dates', () => {
		expect(formatDurationFromDates('2024-01-01T00:00:00Z', '2024-01-01T00:01:30Z')).toBe('1m 30s');
	});

	it('formats duration from Date objects', () => {
		const start = new Date('2024-01-01T00:00:00Z');
		const end = new Date('2024-01-01T01:00:00Z');
		expect(formatDurationFromDates(start, end)).toBe('1h 0m');
	});

	it('formats zero duration', () => {
		const date = '2024-01-01T00:00:00Z';
		expect(formatDurationFromDates(date, date)).toBe('0ms');
	});

	it('formats sub-second duration', () => {
		expect(formatDurationFromDates('2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.500Z')).toBe('500ms');
	});
});
