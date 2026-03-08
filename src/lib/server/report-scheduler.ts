import * as cron from 'node-cron';
import { db } from '$lib/server/db';
import { reportSchedule, project } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { parseDateRange, loadReportData } from './report-data';
import { generateReportPdf } from './pdf-report';
import { sendEmail } from './email';
import { childLogger } from './logger';

const log = childLogger('report-scheduler');
const jobs = new Map<number, ReturnType<typeof cron.schedule>>();

export async function initReportScheduler() {
	const schedules = await db
		.select()
		.from(reportSchedule)
		.where(eq(reportSchedule.enabled, true));

	for (const schedule of schedules) {
		registerJob(schedule);
	}

	log.info({ count: schedules.length }, 'Report scheduler initialized');
}

export function registerJob(schedule: typeof reportSchedule.$inferSelect) {
	// Remove existing job if any
	const existing = jobs.get(schedule.id);
	if (existing) existing.stop();

	if (!cron.validate(schedule.cronExpression)) {
		log.warn({ id: schedule.id, cron: schedule.cronExpression }, 'Invalid cron expression');
		return;
	}

	const task = cron.schedule(schedule.cronExpression, () => {
		executeSchedule(schedule.id).catch((err) => {
			log.error({ err, scheduleId: schedule.id }, 'Failed to execute scheduled report');
		});
	});

	jobs.set(schedule.id, task);
}

export function removeJob(scheduleId: number) {
	const task = jobs.get(scheduleId);
	if (task) {
		task.stop();
		jobs.delete(scheduleId);
	}
}

async function executeSchedule(scheduleId: number) {
	const schedule = await db.query.reportSchedule.findFirst({
		where: eq(reportSchedule.id, scheduleId)
	});
	if (!schedule || !schedule.enabled) return;

	const proj = await db.query.project.findFirst({
		where: eq(project.id, schedule.projectId)
	});

	// Compute date range
	const now = new Date();
	let from: string | null = null;
	let to: string | null = null;
	let preset: string | null = null;

	switch (schedule.reportRange) {
		case 'last_7_days': {
			const d = new Date();
			d.setDate(d.getDate() - 7);
			from = d.toISOString().slice(0, 10);
			to = now.toISOString().slice(0, 10);
			break;
		}
		case 'last_30_days': {
			const d = new Date();
			d.setDate(d.getDate() - 30);
			from = d.toISOString().slice(0, 10);
			to = now.toISOString().slice(0, 10);
			break;
		}
		case 'all':
			preset = 'all';
			break;
	}

	const range = parseDateRange({ from, to, preset });
	const data = await loadReportData(schedule.projectId, range);

	const pdf = await generateReportPdf({
		projectName: proj?.name ?? 'Project',
		dateRange: { from, to, allTime: range.allTime },
		envStats: data.envStats,
		priorityStats: data.priorityStats,
		topFailingCases: data.topFailingCases,
		recentRuns: data.recentRuns
	});

	// Send to each recipient
	for (const email of schedule.recipientEmails) {
		await sendEmail({
			to: email,
			subject: `[${proj?.name ?? 'testmini'}] ${schedule.name}`,
			text: `Attached is the ${schedule.name} report for ${proj?.name ?? 'project'}.`,
			html: `<p>Attached is the <b>${schedule.name}</b> report for <b>${proj?.name ?? 'project'}</b>.</p>`,
			attachments: [{ filename: 'report.pdf', content: pdf }]
		});
	}

	await db
		.update(reportSchedule)
		.set({ lastSentAt: new Date() })
		.where(eq(reportSchedule.id, scheduleId));

	log.info({ scheduleId, recipients: schedule.recipientEmails.length }, 'Scheduled report sent');
}
