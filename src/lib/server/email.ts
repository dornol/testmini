import nodemailer from 'nodemailer';
import { childLogger } from './logger';
import { env } from '$env/dynamic/private';

const log = childLogger('email');
const DEFAULT_SMTP_PORT = 587;

function resolveSmtpPort(value: string | undefined): number | null {
	if (value === undefined || value.trim() === '') return DEFAULT_SMTP_PORT;

	const port = Number(value);
	if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
		log.error({ port: value }, 'Invalid SMTP_PORT — email will be DISABLED');
		return null;
	}
	return port;
}

// Warn at startup if SMTP is partially configured
{
	const smtpVars = { SMTP_HOST: env.SMTP_HOST, SMTP_USER: env.SMTP_USER, SMTP_PASS: env.SMTP_PASS };
	const set = Object.entries(smtpVars)
		.filter(([, v]) => !!v)
		.map(([k]) => k);
	const missing = Object.entries(smtpVars)
		.filter(([, v]) => !v)
		.map(([k]) => k);
	if (set.length > 0 && missing.length > 0) {
		log.error(
			{ set, missing },
			'SMTP partially configured — email will be DISABLED. Set all of: SMTP_HOST, SMTP_USER, SMTP_PASS'
		);
	}
}

function createTransport() {
	const host = env.SMTP_HOST;
	const port = resolveSmtpPort(env.SMTP_PORT);
	const user = env.SMTP_USER;
	const pass = env.SMTP_PASS;

	if (!host || !user || !pass || port === null) {
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
