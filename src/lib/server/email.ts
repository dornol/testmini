import nodemailer from 'nodemailer';
import { childLogger } from './logger';
import { env } from '$env/dynamic/private';

const log = childLogger('email');

function createTransport() {
	const host = env.SMTP_HOST;
	const port = Number(env.SMTP_PORT ?? '587');
	const user = env.SMTP_USER;
	const pass = env.SMTP_PASS;

	if (!host || !user || !pass) {
		return null;
	}

	return nodemailer.createTransport({
		host,
		port,
		secure: port === 465,
		auth: { user, pass }
	});
}

/**
 * Returns true if SMTP is configured and email sending is available.
 */
export function isEmailConfigured(): boolean {
	return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

/**
 * Sends an email notification. Fire-and-forget — never throws.
 */
export async function sendEmail(params: {
	to: string;
	subject: string;
	text: string;
	html?: string;
	attachments?: Array<{ filename: string; content: Buffer }>;
}): Promise<void> {
	const t = createTransport();
	if (!t) {
		log.warn('SMTP not configured, skipping email');
		return;
	}

	const from = env.SMTP_FROM ?? env.SMTP_USER ?? 'noreply@testmini.local';

	try {
		await t.sendMail({
			from,
			to: params.to,
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: params.attachments
		});
	} catch (err) {
		log.error({ err, to: params.to, subject: params.subject }, 'Failed to send email');
	}
}
