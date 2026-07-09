import { json, error } from '@sveltejs/kit';
import { withProjectRole } from '$lib/server/api-handler';
import { db } from '$lib/server/db';
import { reportSchedule } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { registerJob, removeJob } from '$lib/server/report-scheduler';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { validateRequestBody } from '$lib/server/id-list-validation';
import {
	REPORT_SCHEDULE_FIELDS,
	validateOptionalScheduleEnabled,
	validateReportScheduleFields,
	validateScheduleCronExpression,
	validateScheduleName,
	validateScheduleRecipientEmails,
	validateScheduleReportRange
} from '$lib/server/report-schedule-validation';

export const PATCH = withProjectRole(['PROJECT_ADMIN'], async ({ request, params, projectId }) => {
	const scheduleId = parseId(params.scheduleId, 'schedule ID');

	const raw = validateRequestBody(await parseJsonBody(request));
	if (raw instanceof Response) return raw;
	validateReportScheduleFields(raw, REPORT_SCHEDULE_FIELDS);

	const updates: Record<string, unknown> = {};
	if (raw.name !== undefined) updates.name = validateScheduleName(raw.name);
	if (raw.cronExpression !== undefined) {
		updates.cronExpression = validateScheduleCronExpression(raw.cronExpression);
	}
	if (raw.recipientEmails !== undefined) {
		updates.recipientEmails = validateScheduleRecipientEmails(raw.recipientEmails);
	}
	if (raw.reportRange !== undefined)
		updates.reportRange = validateScheduleReportRange(raw.reportRange);
	if (raw.enabled !== undefined) updates.enabled = validateOptionalScheduleEnabled(raw.enabled);

	if (Object.keys(updates).length === 0) error(400, 'No updates provided');

	const [updated] = await db
		.update(reportSchedule)
		.set(updates)
		.where(and(eq(reportSchedule.id, scheduleId), eq(reportSchedule.projectId, projectId)))
		.returning();

	if (!updated) error(404, 'Schedule not found');

	// Re-register or remove job
	if (updated.enabled) {
		registerJob(updated);
	} else {
		removeJob(updated.id);
	}

	return json(updated);
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const scheduleId = parseId(params.scheduleId, 'schedule ID');

	const [deleted] = await db
		.delete(reportSchedule)
		.where(and(eq(reportSchedule.id, scheduleId), eq(reportSchedule.projectId, projectId)))
		.returning();

	if (!deleted) error(404, 'Schedule not found');

	removeJob(scheduleId);

	return json({ success: true });
});
