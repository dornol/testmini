import { json, error } from '@sveltejs/kit';
import { withProjectRole } from '$lib/server/api-handler';
import { db } from '$lib/server/db';
import { reportSchedule } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import cron from 'node-cron';
import { registerJob } from '$lib/server/report-scheduler';
import { parseJsonBody } from '$lib/server/auth-utils';

export const GET = withProjectRole(['PROJECT_ADMIN'], async ({ projectId }) => {
	const schedules = await db
		.select()
		.from(reportSchedule)
		.where(eq(reportSchedule.projectId, projectId))
		.orderBy(reportSchedule.createdAt);

	return json(schedules);
});

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ request, projectId, user }) => {
	const body = await parseJsonBody(request);
	const { name, cronExpression, recipientEmails, reportRange, enabled } = body as {
		name: string;
		cronExpression: string;
		recipientEmails: string[];
		reportRange?: string;
		enabled?: boolean;
	};

	if (!name?.trim()) error(400, 'Name is required');
	if (!cronExpression?.trim()) error(400, 'Cron expression is required');
	if (!cron.validate(cronExpression)) error(400, 'Invalid cron expression');
	if (!recipientEmails?.length) error(400, 'At least one recipient is required');

	const [schedule] = await db
		.insert(reportSchedule)
		.values({
			projectId,
			name: name.trim(),
			cronExpression: cronExpression.trim(),
			recipientEmails,
			reportRange: reportRange ?? 'last_7_days',
			enabled: enabled ?? true,
			createdBy: user.id
		})
		.returning();

	if (schedule.enabled) {
		registerJob(schedule);
	}

	return json(schedule, { status: 201 });
});
