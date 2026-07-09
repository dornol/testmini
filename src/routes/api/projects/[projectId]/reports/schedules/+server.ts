import { json } from '@sveltejs/kit';
import { withProjectRole } from '$lib/server/api-handler';
import { db } from '$lib/server/db';
import { reportSchedule } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { registerJob } from '$lib/server/report-scheduler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { validateRequestBody } from '$lib/server/id-list-validation';
import {
	validateOptionalScheduleEnabled,
	validateScheduleCronExpression,
	validateScheduleName,
	validateScheduleRecipientEmails,
	validateScheduleReportRange
} from '$lib/server/report-schedule-validation';

export const GET = withProjectRole(['PROJECT_ADMIN'], async ({ projectId }) => {
	const schedules = await db
		.select()
		.from(reportSchedule)
		.where(eq(reportSchedule.projectId, projectId))
		.orderBy(reportSchedule.createdAt);

	return json(schedules);
});

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ request, projectId, user }) => {
	const raw = validateRequestBody(await parseJsonBody(request));
	if (raw instanceof Response) return raw;
	const safeName = validateScheduleName(raw.name);
	const safeCronExpression = validateScheduleCronExpression(raw.cronExpression);
	const safeRecipientEmails = validateScheduleRecipientEmails(raw.recipientEmails);
	const safeReportRange = validateScheduleReportRange(raw.reportRange);
	const safeEnabled = validateOptionalScheduleEnabled(raw.enabled);

	const [schedule] = await db
		.insert(reportSchedule)
		.values({
			projectId,
			name: safeName,
			cronExpression: safeCronExpression,
			recipientEmails: safeRecipientEmails,
			reportRange: safeReportRange,
			enabled: safeEnabled ?? true,
			createdBy: user.id
		})
		.returning();

	if (schedule.enabled) {
		registerJob(schedule);
	}

	return json(schedule, { status: 201 });
});
