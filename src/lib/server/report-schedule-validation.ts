import { error } from '@sveltejs/kit';
import cron from 'node-cron';

import {
	MAX_REPORT_SCHEDULE_NAME_LENGTH,
	MAX_REPORT_SCHEDULE_RECIPIENTS,
	isScheduleEmail
} from '$lib/report-schedule-limits';

export const ALLOWED_REPORT_SCHEDULE_RANGES = new Set(['last_7_days', 'last_30_days', 'all']);
export const REPORT_SCHEDULE_FIELDS = new Set([
	'name',
	'cronExpression',
	'recipientEmails',
	'reportRange',
	'enabled'
]);

export function isAllowedReportScheduleRange(value: unknown): value is string {
	return typeof value === 'string' && ALLOWED_REPORT_SCHEDULE_RANGES.has(value);
}

export function validateReportScheduleFields(
	body: Record<string, unknown>,
	allowedFields: Set<string>
): void {
	if (Object.keys(body).some((key) => !allowedFields.has(key))) {
		error(400, 'Invalid report schedule field');
	}
}

export function validateScheduleName(value: unknown): string {
	const name = typeof value === 'string' ? value.trim() : '';
	if (!name) error(400, 'Name is required');
	if (name.length > MAX_REPORT_SCHEDULE_NAME_LENGTH) {
		error(400, `Name must be ${MAX_REPORT_SCHEDULE_NAME_LENGTH} characters or less`);
	}
	return name;
}

export function validateScheduleCronExpression(value: unknown): string {
	const cronExpression = typeof value === 'string' ? value.trim() : '';
	if (!cronExpression) error(400, 'Cron expression is required');
	if (!cron.validate(cronExpression)) error(400, 'Invalid cron expression');
	return cronExpression;
}

export function validateScheduleRecipientEmails(value: unknown): string[] {
	if (!Array.isArray(value) || value.length === 0) {
		error(400, 'At least one recipient is required');
	}
	if (value.length > MAX_REPORT_SCHEDULE_RECIPIENTS) {
		error(400, `At most ${MAX_REPORT_SCHEDULE_RECIPIENTS} recipients are allowed`);
	}

	const emails = value.map((email) =>
		typeof email === 'string' ? email.trim().toLowerCase() : ''
	);
	const uniqueEmails = Array.from(new Set(emails));
	if (uniqueEmails.length !== emails.length) {
		error(400, 'Duplicate recipients are not allowed');
	}

	for (const email of uniqueEmails) {
		if (!isScheduleEmail(email)) {
			error(400, 'Invalid recipient email');
		}
	}

	return uniqueEmails;
}

export function validateScheduleReportRange(value: unknown): string {
	if (value === undefined || value === null) return 'last_7_days';
	if (!isAllowedReportScheduleRange(value)) error(400, 'Invalid report range');
	return value;
}

export function validateOptionalScheduleEnabled(value: unknown): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'boolean') error(400, 'enabled must be a boolean');
	return value;
}
