export const MAX_REPORT_SCHEDULE_NAME_LENGTH = 120;
export const MAX_REPORT_SCHEDULE_RECIPIENTS = 20;

const MAX_REPORT_SCHEDULE_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isScheduleEmail(email: string): boolean {
	return email.length <= MAX_REPORT_SCHEDULE_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}
