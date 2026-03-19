import type { PageServerLoad } from './$types';
import { parseDateRange, loadReportData } from '$lib/server/report-data';
import { parseId } from '$lib/server/auth-utils';

function toDateString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export const load: PageServerLoad = async ({ params, parent, url }) => {
	await parent();
	const projectId = parseId(params.projectId, 'project ID');

	const range = parseDateRange({
		from: url.searchParams.get('from'),
		to: url.searchParams.get('to'),
		preset: url.searchParams.get('preset')
	});

	const data = await loadReportData(projectId, range);

	return {
		...data,
		dateRange: {
			from: range.from ? toDateString(range.from) : null,
			to: range.to ? toDateString(range.to) : null,
			allTime: range.allTime
		}
	};
};
