import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PDFKit with an event-emitting fake.
// Each call to `new PDFDocument()` creates a fresh mockDoc, stored in `lastMockDoc`.
let lastMockDoc: Record<string, ReturnType<typeof vi.fn> | unknown>;

function createMockDoc() {
	const handlers: Record<string, Function> = {};
	const doc: Record<string, unknown> = {
		fontSize: vi.fn().mockImplementation(() => doc),
		text: vi.fn().mockImplementation(() => doc),
		moveDown: vi.fn().mockImplementation(() => doc),
		fillColor: vi.fn().mockImplementation(() => doc),
		font: vi.fn().mockImplementation(() => doc),
		moveTo: vi.fn().mockImplementation(() => doc),
		lineTo: vi.fn().mockImplementation(() => doc),
		stroke: vi.fn().mockImplementation(() => doc),
		addPage: vi.fn().mockImplementation(() => doc),
		on: vi.fn().mockImplementation((event: string, handler: Function) => {
			handlers[event] = handler;
			return doc;
		}),
		end: vi.fn().mockImplementation(() => {
			if (handlers['data']) handlers['data'](Buffer.from('PDF-content'));
			if (handlers['end']) handlers['end']();
		}),
		y: 100,
		page: { width: 595, height: 842 }
	};
	lastMockDoc = doc;
	return doc;
}

vi.mock('pdfkit', () => {
	function PDFDocument() {
		return createMockDoc();
	}
	return { default: PDFDocument };
});

const { generateReportPdf } = await import('./pdf-report');

describe('generateReportPdf', () => {
	const baseParams = {
		projectName: 'Test Project',
		dateRange: { from: '2025-01-01', to: '2025-01-31', allTime: false },
		envStats: [] as Array<{ environment: string; totalRuns: number; totalExecs: number; passCount: number; failCount: number }>,
		priorityStats: [] as Array<{ priority: string; total: number; passCount: number; failCount: number }>,
		topFailingCases: [] as Array<{ testCaseKey: string; title: string; failCount: number; totalExecs: number }>,
		recentRuns: [] as Array<{ name: string; environment: string; totalCount: number; passCount: number; failCount: number }>
	};

	it('should return a Buffer', async () => {
		const result = await generateReportPdf(baseParams);

		expect(result).toBeInstanceOf(Buffer);
		expect(result.length).toBeGreaterThan(0);
	});

	it('should render project name as title', async () => {
		await generateReportPdf(baseParams);

		expect(lastMockDoc.fontSize).toHaveBeenCalledWith(20);
		expect(lastMockDoc.text).toHaveBeenCalledWith(
			'Test Project - Test Report',
			expect.objectContaining({ align: 'center' })
		);
	});

	it('should render date range', async () => {
		await generateReportPdf(baseParams);

		expect(lastMockDoc.text).toHaveBeenCalledWith(
			expect.stringContaining('2025-01-01 to 2025-01-31'),
			expect.anything()
		);
	});

	it('should render "All Time" when allTime is true', async () => {
		await generateReportPdf({
			...baseParams,
			dateRange: { from: null, to: null, allTime: true }
		});

		expect(lastMockDoc.text).toHaveBeenCalledWith(
			expect.stringContaining('All Time'),
			expect.anything()
		);
	});

	it('should render environment summary table when data exists', async () => {
		await generateReportPdf({
			...baseParams,
			envStats: [
				{ environment: 'QA', totalRuns: 5, totalExecs: 50, passCount: 40, failCount: 10 }
			]
		});

		expect(lastMockDoc.text).toHaveBeenCalledWith('Environment Summary');
	});

	it('should skip environment summary when empty', async () => {
		await generateReportPdf(baseParams);

		const textCalls = (lastMockDoc.text as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
		expect(textCalls).not.toContain('Environment Summary');
	});

	it('should render priority breakdown when data exists', async () => {
		await generateReportPdf({
			...baseParams,
			priorityStats: [
				{ priority: 'HIGH', total: 20, passCount: 15, failCount: 5 }
			]
		});

		expect(lastMockDoc.text).toHaveBeenCalledWith('Priority Breakdown');
	});

	it('should render top failing test cases section', async () => {
		await generateReportPdf({
			...baseParams,
			topFailingCases: [
				{ testCaseKey: 'TC-0001', title: 'Login flow', failCount: 5, totalExecs: 10 }
			]
		});

		expect(lastMockDoc.text).toHaveBeenCalledWith('Top Failing Test Cases');
	});

	it('should add new page for recent runs', async () => {
		await generateReportPdf({
			...baseParams,
			recentRuns: [
				{ name: 'Sprint 1', environment: 'QA', totalCount: 50, passCount: 40, failCount: 10 }
			]
		});

		expect(lastMockDoc.addPage).toHaveBeenCalled();
		expect(lastMockDoc.text).toHaveBeenCalledWith('Recent Test Runs');
	});

	it('should call doc.end()', async () => {
		await generateReportPdf(baseParams);

		expect(lastMockDoc.end).toHaveBeenCalled();
	});

	it('should calculate pass rate correctly in env stats', async () => {
		await generateReportPdf({
			...baseParams,
			envStats: [
				{ environment: 'QA', totalRuns: 1, totalExecs: 100, passCount: 75, failCount: 25 }
			]
		});

		// The pass rate "75%" should appear in the table data
		expect(lastMockDoc.text).toHaveBeenCalledWith(
			'75%',
			expect.any(Number),
			expect.any(Number),
			expect.anything()
		);
	});
});
