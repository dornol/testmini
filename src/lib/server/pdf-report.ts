import PDFDocument from 'pdfkit';

export async function generateReportPdf(params: {
	projectName: string;
	dateRange: { from: string | null; to: string | null; allTime: boolean };
	envStats: Array<{
		environment: string;
		totalRuns: number;
		totalExecs: number;
		passCount: number;
		failCount: number;
	}>;
	priorityStats: Array<{
		priority: string;
		total: number;
		passCount: number;
		failCount: number;
	}>;
	topFailingCases: Array<{
		testCaseKey: string;
		title: string;
		failCount: number;
		totalExecs: number;
	}>;
	recentRuns: Array<{
		name: string;
		environment: string;
		totalCount: number;
		passCount: number;
		failCount: number;
	}>;
}): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({ margin: 50, size: 'A4' });
		const chunks: Buffer[] = [];
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		// Title
		doc.fontSize(20).text(params.projectName + ' - Test Report', { align: 'center' });
		doc.moveDown(0.5);

		// Date range
		const rangeText = params.dateRange.allTime
			? 'All Time'
			: `${params.dateRange.from ?? ''} to ${params.dateRange.to ?? ''}`;
		doc.fontSize(10).fillColor('#666666').text(`Date range: ${rangeText}`, { align: 'center' });
		doc.fillColor('#000000');
		doc.moveDown(1);

		// Environment Summary
		if (params.envStats.length > 0) {
			doc.fontSize(14).text('Environment Summary');
			doc.moveDown(0.5);

			const envHeaders = ['Environment', 'Runs', 'Executions', 'Pass', 'Fail', 'Pass Rate'];
			drawTable(
				doc,
				envHeaders,
				params.envStats.map((e) => [
					e.environment,
					String(e.totalRuns),
					String(e.totalExecs),
					String(e.passCount),
					String(e.failCount),
					e.totalExecs > 0
						? `${Math.round((e.passCount / e.totalExecs) * 100)}%`
						: 'N/A'
				])
			);
			doc.moveDown(1);
		}

		// Priority Breakdown
		if (params.priorityStats.length > 0) {
			doc.fontSize(14).text('Priority Breakdown');
			doc.moveDown(0.5);
			drawTable(
				doc,
				['Priority', 'Total', 'Pass', 'Fail'],
				params.priorityStats.map((p) => [
					p.priority,
					String(p.total),
					String(p.passCount),
					String(p.failCount)
				])
			);
			doc.moveDown(1);
		}

		// Top Failing Tests
		if (params.topFailingCases.length > 0) {
			doc.fontSize(14).text('Top Failing Test Cases');
			doc.moveDown(0.5);
			drawTable(
				doc,
				['Key', 'Title', 'Failures', 'Total'],
				params.topFailingCases.map((t) => [
					t.testCaseKey,
					t.title.substring(0, 40),
					String(t.failCount),
					String(t.totalExecs)
				])
			);
			doc.moveDown(1);
		}

		// Recent Runs
		if (params.recentRuns.length > 0) {
			doc.addPage();
			doc.fontSize(14).text('Recent Test Runs');
			doc.moveDown(0.5);
			drawTable(
				doc,
				['Run Name', 'Environment', 'Total', 'Pass', 'Fail'],
				params.recentRuns.slice(0, 20).map((r) => [
					r.name.substring(0, 30),
					r.environment,
					String(r.totalCount),
					String(r.passCount),
					String(r.failCount)
				])
			);
		}

		// Generated timestamp
		doc.moveDown(2);
		doc
			.fontSize(8)
			.fillColor('#999999')
			.text(`Generated: ${new Date().toISOString()}`, { align: 'right' });

		doc.end();
	});
}

function drawTable(doc: PDFKit.PDFDocument, headers: string[], rows: string[][]) {
	const startX = 50;
	const colWidth = (doc.page.width - 100) / headers.length;
	let y = doc.y;

	// Headers
	doc.fontSize(9).font('Helvetica-Bold');
	headers.forEach((h, i) => {
		doc.text(h, startX + i * colWidth, y, { width: colWidth, continued: false });
	});
	y = doc.y + 5;
	doc.moveTo(startX, y).lineTo(doc.page.width - 50, y).stroke('#cccccc');
	y += 5;

	// Rows
	doc.font('Helvetica').fontSize(8);
	for (const row of rows) {
		if (y > doc.page.height - 80) {
			doc.addPage();
			y = 50;
		}
		const rowY = y;
		let maxH = 0;
		row.forEach((cell, i) => {
			doc.text(cell ?? '', startX + i * colWidth, rowY, { width: colWidth - 5 });
			maxH = Math.max(maxH, doc.y - rowY);
		});
		y = rowY + maxH + 3;
	}
	doc.y = y;
}
