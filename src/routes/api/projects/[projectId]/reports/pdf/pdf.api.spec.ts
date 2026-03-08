import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockParseDateRange = vi.fn();
const mockLoadReportData = vi.fn();
const mockGenerateReportPdf = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: {
		id: 'id',
		name: 'name'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a),
	sql: vi.fn(),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
	count: vi.fn()
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});
vi.mock('$lib/server/report-data', () => ({
	parseDateRange: mockParseDateRange,
	loadReportData: mockLoadReportData
}));
vi.mock('$lib/server/pdf-report', () => ({
	generateReportPdf: mockGenerateReportPdf
}));

const { GET } = await import('./+server');

const PARAMS = { projectId: '1' };

const sampleReportData = {
	envStats: [{ environment: 'QA', passCount: 10, failCount: 2 }],
	priorityStats: [{ priority: 'HIGH', total: 5 }],
	topFailingCases: [{ key: 'TC-001', title: 'Login test', failCount: 3 }],
	recentRuns: [{ id: 1, name: 'Run 1', status: 'COMPLETED' }]
};

describe('/api/projects/[projectId]/reports/pdf', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.project = { findFirst: vi.fn() };
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
		await expect(GET(event)).rejects.toThrow();
	});

	it('should return PDF with correct headers', async () => {
		const dateRange = { from: new Date('2025-01-01'), to: new Date('2025-01-31'), allTime: false };
		mockParseDateRange.mockReturnValue(dateRange);
		mockDb.query.project.findFirst.mockResolvedValue({ id: 1, name: 'My Project' });
		mockLoadReportData.mockResolvedValue(sampleReportData);
		const pdfBuffer = new ArrayBuffer(8);
		mockGenerateReportPdf.mockResolvedValue(pdfBuffer);

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser,
			searchParams: { from: '2025-01-01', to: '2025-01-31' }
		});

		const response = await GET(event);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/pdf');
		expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="report_1.pdf"');
	});

	it('should call parseDateRange with query params', async () => {
		const dateRange = { from: null, to: null, allTime: true };
		mockParseDateRange.mockReturnValue(dateRange);
		mockDb.query.project.findFirst.mockResolvedValue({ id: 1, name: 'Project' });
		mockLoadReportData.mockResolvedValue(sampleReportData);
		mockGenerateReportPdf.mockResolvedValue(new ArrayBuffer(8));

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser,
			searchParams: { preset: 'all_time' }
		});

		await GET(event);

		expect(mockParseDateRange).toHaveBeenCalledWith({
			from: null,
			to: null,
			preset: 'all_time'
		});
	});

	it('should pass correct data to generateReportPdf', async () => {
		const dateRange = { from: new Date('2025-01-01'), to: new Date('2025-01-31'), allTime: false };
		mockParseDateRange.mockReturnValue(dateRange);
		mockDb.query.project.findFirst.mockResolvedValue({ id: 1, name: 'My Project' });
		mockLoadReportData.mockResolvedValue(sampleReportData);
		mockGenerateReportPdf.mockResolvedValue(new ArrayBuffer(8));

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		await GET(event);

		expect(mockGenerateReportPdf).toHaveBeenCalledWith({
			projectName: 'My Project',
			dateRange: {
				from: '2025-01-01',
				to: '2025-01-31',
				allTime: false
			},
			envStats: sampleReportData.envStats,
			priorityStats: sampleReportData.priorityStats,
			topFailingCases: sampleReportData.topFailingCases,
			recentRuns: sampleReportData.recentRuns
		});
	});

	it('should use fallback project name when project not found', async () => {
		const dateRange = { from: null, to: null, allTime: true };
		mockParseDateRange.mockReturnValue(dateRange);
		mockDb.query.project.findFirst.mockResolvedValue(null);
		mockLoadReportData.mockResolvedValue(sampleReportData);
		mockGenerateReportPdf.mockResolvedValue(new ArrayBuffer(8));

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		await GET(event);

		expect(mockGenerateReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({ projectName: 'Project' })
		);
	});
});
