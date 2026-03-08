import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sharedReport, project } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { parseDateRange, loadReportData } from '$lib/server/report-data';

export const load: PageServerLoad = async ({ params }) => {
	const report = await db.query.sharedReport.findFirst({
		where: eq(sharedReport.token, params.token)
	});

	if (!report) error(404, 'Report not found');
	if (report.expiresAt && report.expiresAt < new Date()) error(410, 'Report link has expired');

	const proj = await db.query.project.findFirst({
		where: eq(project.id, report.projectId)
	});

	const config = report.config as { from?: string; to?: string; preset?: string };
	const range = parseDateRange(config);
	const data = await loadReportData(report.projectId, range);

	return {
		reportName: report.name,
		projectName: proj?.name ?? 'Project',
		...data,
		dateRange: {
			from: range.from ? range.from.toISOString().slice(0, 10) : null,
			to: range.to ? range.to.toISOString().slice(0, 10) : null,
			allTime: range.allTime
		}
	};
};
