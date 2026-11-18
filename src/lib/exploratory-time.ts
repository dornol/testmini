type SessionTime = {
	startedAt: Date | string;
	status: string;
	pausedAt: Date | string | null;
	pausedDuration: number;
	completedAt: Date | string | null;
};

export function exploratoryElapsedSeconds(session: SessionTime, now = Date.now()): number | null {
	if (session.status === 'PAUSED' && !session.pausedAt) return null;
	const end = session.status === 'PAUSED' ? session.pausedAt : session.completedAt;
	return Math.max(
		0,
		Math.floor(
			((end ? new Date(end).getTime() : now) - new Date(session.startedAt).getTime()) / 1000
		) - session.pausedDuration
	);
}
