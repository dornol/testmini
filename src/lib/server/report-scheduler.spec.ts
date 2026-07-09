import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();
const mockValidate = vi.fn();
const mockCronSchedule = vi.fn();
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	reportSchedule: { id: 'id', enabled: 'enabled', projectId: 'project_id' },
	project: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a, b) => [a, b])
}));
vi.mock('node-cron', () => ({
	validate: (...args: unknown[]) => mockValidate(...args),
	schedule: (...args: unknown[]) => mockCronSchedule(...args)
}));
vi.mock('./report-data', () => ({
	parseDateRange: vi.fn(() => ({ from: null, to: null, allTime: true })),
	loadReportData: vi.fn(() =>
		Promise.resolve({ envStats: [], recentRuns: [], priorityStats: [], topFailingCases: [] })
	)
}));
vi.mock('./pdf-report', () => ({
	generateReportPdf: vi.fn(() => Promise.resolve(Buffer.from('pdf')))
}));
vi.mock('./email', () => ({
	sendEmail: vi.fn(() => Promise.resolve())
}));
vi.mock('./logger', () => ({
	childLogger: () => mockLog
}));

const { initReportScheduler, registerJob, removeJob } = await import('./report-scheduler');

const baseSchedule = {
	id: 1,
	projectId: 1,
	name: 'Daily Report',
	cronExpression: '0 9 * * *',
	recipientEmails: ['test@example.com'],
	reportRange: 'last_7_days',
	enabled: true,
	lastSentAt: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('registerJob', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('validates cron expression', () => {
		mockValidate.mockReturnValue(true);
		mockCronSchedule.mockReturnValue({ stop: vi.fn() });

		registerJob(baseSchedule as never);

		expect(mockValidate).toHaveBeenCalledWith('0 9 * * *');
	});

	it('creates scheduled task with valid cron', () => {
		mockValidate.mockReturnValue(true);
		mockCronSchedule.mockReturnValue({ stop: vi.fn() });

		registerJob(baseSchedule as never);

		expect(mockCronSchedule).toHaveBeenCalledWith('0 9 * * *', expect.any(Function));
	});

	it('stops existing job before registering new one', () => {
		const mockStop = vi.fn();
		mockValidate.mockReturnValue(true);
		mockCronSchedule.mockReturnValue({ stop: mockStop });

		registerJob(baseSchedule as never);

		const mockStop2 = vi.fn();
		mockCronSchedule.mockReturnValue({ stop: mockStop2 });

		registerJob({ ...baseSchedule, cronExpression: '0 10 * * *' } as never);

		expect(mockStop).toHaveBeenCalled();
	});

	it('does not create task for invalid cron expression', () => {
		mockValidate.mockReturnValue(false);

		registerJob({ ...baseSchedule, cronExpression: 'invalid' } as never);

		expect(mockCronSchedule).not.toHaveBeenCalled();
	});

	it('logs warning for invalid cron', () => {
		mockValidate.mockReturnValue(false);

		registerJob({ ...baseSchedule, cronExpression: 'invalid' } as never);

		expect(mockLog.warn).toHaveBeenCalledWith(
			{ id: 1, cron: 'invalid' },
			'Invalid cron expression'
		);
	});

	it('stores task in internal map (verify by calling removeJob)', () => {
		const mockStop = vi.fn();
		mockValidate.mockReturnValue(true);
		mockCronSchedule.mockReturnValue({ stop: mockStop });

		registerJob({ ...baseSchedule, id: 42 } as never);

		removeJob(42);

		expect(mockStop).toHaveBeenCalled();
	});

	it('replaces previous task in map with new one', () => {
		const mockStop1 = vi.fn();
		const mockStop2 = vi.fn();
		mockValidate.mockReturnValue(true);

		mockCronSchedule.mockReturnValue({ stop: mockStop1 });
		registerJob(baseSchedule as never);

		mockCronSchedule.mockReturnValue({ stop: mockStop2 });
		registerJob({ ...baseSchedule, cronExpression: '0 10 * * *' } as never);

		removeJob(1);

		expect(mockStop2).toHaveBeenCalled();
	});

	it('does not store task when cron is invalid', () => {
		mockValidate.mockReturnValue(false);

		registerJob({ ...baseSchedule, id: 99, cronExpression: 'bad' } as never);

		// removeJob should not call stop since nothing was stored
		removeJob(99);

		expect(mockCronSchedule).not.toHaveBeenCalled();
	});

	it('does not create task for invalid report range', () => {
		mockValidate.mockReturnValue(true);

		registerJob({ ...baseSchedule, reportRange: 'last_90_days' } as never);

		expect(mockCronSchedule).not.toHaveBeenCalled();
		expect(mockLog.warn).toHaveBeenCalledWith(
			{ id: 1, reportRange: 'last_90_days' },
			'Invalid report range'
		);
	});

	it('does not create task for invalid recipients', () => {
		mockValidate.mockReturnValue(true);

		registerJob({ ...baseSchedule, recipientEmails: ['not-email'] } as never);

		expect(mockCronSchedule).not.toHaveBeenCalled();
		expect(mockLog.warn).toHaveBeenCalledWith({ id: 1 }, 'Invalid report recipients');
	});
});

describe('removeJob', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('stops and removes existing job', () => {
		const mockStop = vi.fn();
		mockValidate.mockReturnValue(true);
		mockCronSchedule.mockReturnValue({ stop: mockStop });

		registerJob({ ...baseSchedule, id: 10 } as never);
		removeJob(10);

		expect(mockStop).toHaveBeenCalled();

		// Calling removeJob again should not call stop again
		mockStop.mockClear();
		removeJob(10);
		expect(mockStop).not.toHaveBeenCalled();
	});

	it('does nothing for non-existent job (no error)', () => {
		expect(() => removeJob(999)).not.toThrow();
	});
});

describe('initReportScheduler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loads enabled schedules from database', async () => {
		mockValidate.mockReturnValue(true);
		mockCronSchedule.mockReturnValue({ stop: vi.fn() });
		mockSelectResult(mockDb, [
			baseSchedule,
			{ ...baseSchedule, id: 2, cronExpression: '0 18 * * *' }
		]);

		await initReportScheduler();

		expect(mockDb.select).toHaveBeenCalled();
	});

	it('registers a job for each schedule', async () => {
		mockValidate.mockReturnValue(true);
		mockCronSchedule.mockReturnValue({ stop: vi.fn() });
		mockSelectResult(mockDb, [
			baseSchedule,
			{ ...baseSchedule, id: 2, cronExpression: '0 18 * * *' }
		]);

		await initReportScheduler();

		expect(mockCronSchedule).toHaveBeenCalledTimes(2);
	});

	it('logs initialization with count', async () => {
		mockValidate.mockReturnValue(true);
		mockCronSchedule.mockReturnValue({ stop: vi.fn() });
		mockSelectResult(mockDb, [baseSchedule]);

		await initReportScheduler();

		expect(mockLog.info).toHaveBeenCalledWith({ count: 1 }, 'Report scheduler initialized');
	});
});
