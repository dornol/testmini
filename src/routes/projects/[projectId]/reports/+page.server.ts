import type { PageServerLoad } from './$types';
import { parseDateRange, loadReportData } from '$lib/server/report-data';
import { parseId } from '$lib/server/auth-utils';

import { reportCalendarDate, parseReportCalendarDate } from '$lib/report-calendar';

export const load: PageServerLoad = async ({ params, parent, url }) => {
	await parent();
	const projectId = parseId(params.projectId, 'project ID');

	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	const preset = url.searchParams.get('preset');
	const requested = parseDateRange({ from, to, preset });
	const usesPreset = ['all', 'all_time', 'last_7_days', 'last_30_days', 'last_90_days'].includes(
		preset ?? ''
	);
	const invalidRange =
		!usesPreset &&
		([from, to].some((value) => value && !parseReportCalendarDate(value)) ||
			!!(requested.from && requested.to && requested.from > requested.to));
	const range = invalidRange ? parseDateRange({}) : requested;

	const data = await loadReportData(projectId, range);

	return {
		...data,
		invalidRange,
		dateRange: {
			from: range.from ? reportCalendarDate(range.from) : null,
			to: range.to ? reportCalendarDate(range.to) : null,
			allTime: range.allTime
		}
	};
};
