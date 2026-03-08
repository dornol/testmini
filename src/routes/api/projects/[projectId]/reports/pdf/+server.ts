import { withProjectAccess } from '$lib/server/api-handler';
import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { parseDateRange, loadReportData } from '$lib/server/report-data';
import { generateReportPdf } from '$lib/server/pdf-report';

export const GET = withProjectAccess(async ({ url, projectId }) => {
	const range = parseDateRange({
		from: url.searchParams.get('from'),
		to: url.searchParams.get('to'),
		preset: url.searchParams.get('preset')
	});

	const [proj, data] = await Promise.all([
		db.query.project.findFirst({ where: eq(project.id, projectId) }),
		loadReportData(projectId, range)
	]);

	const pdf = await generateReportPdf({
		projectName: proj?.name ?? 'Project',
		dateRange: {
			from: range.from ? range.from.toISOString().slice(0, 10) : null,
			to: range.to ? range.to.toISOString().slice(0, 10) : null,
			allTime: range.allTime
		},
		envStats: data.envStats,
		priorityStats: data.priorityStats,
		topFailingCases: data.topFailingCases,
		recentRuns: data.recentRuns
	});

	return new Response(new Uint8Array(pdf), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="report_${projectId}.pdf"`
		}
	});
});
