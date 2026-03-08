import { json, error } from '@sveltejs/kit';
import { withProjectRole } from '$lib/server/api-handler';
import { db } from '$lib/server/db';
import { reportSchedule } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import cron from 'node-cron';
import { registerJob, removeJob } from '$lib/server/report-scheduler';

export const PATCH = withProjectRole(['PROJECT_ADMIN'], async ({ request, params, projectId }) => {
	const scheduleId = Number(params.scheduleId);
	if (!Number.isFinite(scheduleId)) error(400, 'Invalid schedule ID');

	const body = await request.json();
	const { name, cronExpression, recipientEmails, reportRange, enabled } = body as {
		name?: string;
		cronExpression?: string;
		recipientEmails?: string[];
		reportRange?: string;
		enabled?: boolean;
	};

	if (cronExpression && !cron.validate(cronExpression)) {
		error(400, 'Invalid cron expression');
	}

	const updates: Record<string, unknown> = {};
	if (name !== undefined) updates.name = name.trim();
	if (cronExpression !== undefined) updates.cronExpression = cronExpression.trim();
	if (recipientEmails !== undefined) updates.recipientEmails = recipientEmails;
	if (reportRange !== undefined) updates.reportRange = reportRange;
	if (enabled !== undefined) updates.enabled = enabled;

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
	const scheduleId = Number(params.scheduleId);
	if (!Number.isFinite(scheduleId)) error(400, 'Invalid schedule ID');

	const [deleted] = await db
		.delete(reportSchedule)
		.where(and(eq(reportSchedule.id, scheduleId), eq(reportSchedule.projectId, projectId)))
		.returning();

	if (!deleted) error(404, 'Schedule not found');

	removeJob(scheduleId);

	return json({ success: true });
});
