import { describe, expect, it } from 'vitest';
import { exploratoryElapsedSeconds } from '$lib/exploratory-time';
import { exploratoryTimingUpdate } from './exploratory-timing';

const paused = {
	status: 'PAUSED',
	startedAt: new Date(0),
	pausedAt: new Date(2900),
	pausedDuration: 1,
	completedAt: null
};

describe('exploratory timer transitions', () => {
	it('keeps the displayed whole second on resume and completion across a rounding boundary', () => {
		const transitionTime = new Date(3100);
		for (const status of ['ACTIVE', 'COMPLETED'] as const) {
			const updated = {
				...paused,
				status,
				...exploratoryTimingUpdate(paused, status, transitionTime, 999)
			};
			expect(updated.pausedAt).toBeNull();
			expect(updated.pausedDuration).toBe(2);
			expect(exploratoryElapsedSeconds(updated, transitionTime.getTime())).toBe(
				exploratoryElapsedSeconds(paused, transitionTime.getTime())
			);
		}
	});

	it('keeps the first pause timestamp when a tool repeats the paused status', () => {
		expect(exploratoryTimingUpdate(paused, 'PAUSED', new Date(10000))).toEqual({});
	});

	it('does not invent the pause timestamp for rows created before the migration', () => {
		const legacy = { ...paused, pausedAt: null };
		expect(exploratoryElapsedSeconds(legacy, 10000)).toBeNull();
		expect(exploratoryTimingUpdate(legacy, 'ACTIVE', new Date(10000)).pausedDuration).toBe(1);
		expect(exploratoryTimingUpdate(legacy, 'ACTIVE', new Date(10000), 5).pausedDuration).toBe(5);
	});
});
