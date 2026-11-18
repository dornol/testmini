import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSharedReportFindFirst = vi.fn();
const mockProjectFindFirst = vi.fn();
const mockParseDateRange = vi.fn();
const mockLoadReportData = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: {
		query: {
			sharedReport: { findFirst: mockSharedReportFindFirst },
			project: { findFirst: mockProjectFindFirst }
		}
	}
}));

vi.mock('$lib/server/db/schema', () => ({
	sharedReport: { token: 'token' },
	project: { id: 'project_id' }
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

vi.mock('$lib/server/report-data', () => ({
	parseDateRange: (...args: unknown[]) => mockParseDateRange(...args),
	loadReportData: (...args: unknown[]) => mockLoadReportData(...args)
}));

const { load } = await import('./+page.server');

const validToken = 'a'.repeat(64);
const report = {
	id: 1,
	projectId: 7,
	name: 'Weekly Report',
	config: { preset: 'last_7_days' },
	expiresAt: null
};
const project = { id: 7, name: 'Project Phoenix', active: true };
const reportData = {
	envStats: [],
	recentRuns: [],
	priorityStats: [],
	creatorStats: [],
	assigneeStats: [],
	dailyResults: [],
	executorStats: [],
	topFailingCases: [],
	flakyTests: [],
	staleTests: [],
	slowestTests: [],
	defectDensity: []
};

describe('/shared/[token] page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSharedReportFindFirst.mockResolvedValue(report);
		mockProjectFindFirst.mockResolvedValue(project);
		mockParseDateRange.mockReturnValue({
			from: new Date(2025, 0, 1),
			to: new Date(2025, 0, 31, 23, 59, 59, 999),
			allTime: false
		});
		mockLoadReportData.mockResolvedValue(reportData);
	});

	it('rejects malformed tokens before querying shared reports', async () => {
		await expect(load({ params: { token: 'not-a-token' } } as never)).rejects.toMatchObject({
			status: 404
		});

		expect(mockSharedReportFindFirst).not.toHaveBeenCalled();
		expect(mockLoadReportData).not.toHaveBeenCalled();
	});

	it('returns 404 when the linked project no longer exists', async () => {
		mockProjectFindFirst.mockResolvedValue(null);

		await expect(load({ params: { token: validToken } } as never)).rejects.toMatchObject({
			status: 404
		});

		expect(mockLoadReportData).not.toHaveBeenCalled();
	});

	it('returns 404 when the linked project is inactive', async () => {
		mockProjectFindFirst.mockResolvedValue({ ...project, active: false });

		await expect(load({ params: { token: validToken } } as never)).rejects.toMatchObject({
			status: 404
		});

		expect(mockLoadReportData).not.toHaveBeenCalled();
	});

	it('returns 410 for expired report links before loading project data', async () => {
		mockSharedReportFindFirst.mockResolvedValue({
			...report,
			expiresAt: new Date('2024-01-01T00:00:00.000Z')
		});

		await expect(load({ params: { token: validToken } } as never)).rejects.toMatchObject({
			status: 410
		});

		expect(mockProjectFindFirst).not.toHaveBeenCalled();
		expect(mockLoadReportData).not.toHaveBeenCalled();
	});

	it('loads report data for a valid active shared report', async () => {
		const result = await load({ params: { token: validToken } } as never);

		expect(mockSharedReportFindFirst).toHaveBeenCalled();
		expect(mockProjectFindFirst).toHaveBeenCalled();
		expect(mockParseDateRange).toHaveBeenCalledWith(report.config);
		expect(mockLoadReportData).toHaveBeenCalledWith(7, expect.objectContaining({ allTime: false }));
		expect(result).toEqual(
			expect.objectContaining({
				reportName: 'Weekly Report',
				projectName: 'Project Phoenix',
				dateRange: { from: '2025-01-01', to: '2025-01-31', allTime: false }
			})
		);
	});
});
