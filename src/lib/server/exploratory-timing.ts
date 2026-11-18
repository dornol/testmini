type SessionClock = {
	status: string;
	startedAt: Date;
	pausedAt: Date | null;
	pausedDuration: number;
};

// Count elapsed seconds on the same clock as the visible timer so leaving a
// pause does not introduce a one-second jump at a rounding boundary.
export function exploratoryTimingUpdate(
	session: SessionClock,
	status: 'ACTIVE' | 'PAUSED' | 'COMPLETED',
	now: Date,
	legacyPausedDuration?: number
) {
	if (status === 'PAUSED') {
		if (session.status === 'PAUSED') return {};
		return {
			pausedAt: now,
			completedAt: null,
			pausedDuration: legacyPausedDuration ?? session.pausedDuration
		};
	}

	const start = session.startedAt.getTime();
	const pausedAt = session.status === 'PAUSED' ? session.pausedAt : null;
	const pausedDuration = pausedAt
		? session.pausedDuration +
			Math.max(
				0,
				Math.floor((now.getTime() - start) / 1000) - Math.floor((pausedAt.getTime() - start) / 1000)
			)
		: (legacyPausedDuration ?? session.pausedDuration);
	return { pausedAt: null, pausedDuration, completedAt: status === 'COMPLETED' ? now : null };
}
