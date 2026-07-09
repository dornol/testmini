import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sharedReport, project } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { parseDateRange, loadReportData } from '$lib/server/report-data';

const SHARE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function toDateString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export const load: PageServerLoad = async ({ params }) => {
	if (!SHARE_TOKEN_PATTERN.test(params.token)) {
		error(404, 'Report not found');
	}

	const report = await db.query.sharedReport.findFirst({
		where: eq(sharedReport.token, params.token)
	});

	if (!report) error(404, 'Report not found');
	if (report.expiresAt && report.expiresAt < new Date()) error(410, 'Report link has expired');

	const proj = await db.query.project.findFirst({
		where: eq(project.id, report.projectId)
	});

	if (!proj || !proj.active) error(404, 'Report not found');

	const config = report.config as { from?: string; to?: string; preset?: string };
	const range = parseDateRange(config);
	const data = await loadReportData(report.projectId, range);

	return {
		reportName: report.name,
		projectName: proj.name,
		...data,
		dateRange: {
			from: range.from ? toDateString(range.from) : null,
			to: range.to ? toDateString(range.to) : null,
			allTime: range.allTime
		}
	};
};
