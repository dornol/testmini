import { json, error } from '@sveltejs/kit';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { db } from '$lib/server/db';
import { sharedReport } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { parseJsonBody } from '$lib/server/auth-utils';
import { isPlainRecord } from '$lib/server/object-validation';

const MAX_NAME_LENGTH = 120;
const MAX_EXPIRES_IN_DAYS = 365;
const ALLOWED_PRESETS = new Set(['last_7_days', 'last_30_days', 'last_90_days', 'all_time']);

function validateConfig(config: unknown): { from?: string; to?: string; preset?: string } {
	if (config == null) return {};
	if (!isPlainRecord(config)) {
		error(400, 'config must be an object');
	}

	const raw = config;
	const parsed: { from?: string; to?: string; preset?: string } = {};

	if (raw.preset !== undefined) {
		if (typeof raw.preset !== 'string' || !ALLOWED_PRESETS.has(raw.preset)) {
			error(400, 'Invalid report preset');
		}
		parsed.preset = raw.preset;
	}

	for (const key of ['from', 'to'] as const) {
		const value = raw[key];
		if (value === undefined) continue;
		if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			error(400, `${key} must use YYYY-MM-DD format`);
		}
		const date = new Date(`${value}T00:00:00.000Z`);
		if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
			error(400, `${key} is not a valid date`);
		}
		parsed[key] = value;
	}

	return parsed;
}

export const GET = withProjectAccess(async ({ projectId }) => {
	const reports = await db
		.select({
			id: sharedReport.id,
			projectId: sharedReport.projectId,
			name: sharedReport.name,
			config: sharedReport.config,
			expiresAt: sharedReport.expiresAt,
			createdBy: sharedReport.createdBy,
			createdAt: sharedReport.createdAt
		})
		.from(sharedReport)
		.where(eq(sharedReport.projectId, projectId))
		.orderBy(sharedReport.createdAt);

	return json(reports);
});

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA'],
	async ({ request, projectId, user }) => {
		const body = await parseJsonBody(request);
		if (!isPlainRecord(body)) error(400, 'Invalid request body');

		const { name, config } = body;

		const trimmedName = typeof name === 'string' ? name.trim() : '';
		if (!trimmedName) error(400, 'Name is required');
		if (trimmedName.length > MAX_NAME_LENGTH) {
			error(400, `Name must be ${MAX_NAME_LENGTH} characters or less`);
		}

		const safeConfig = validateConfig(config);

		let expiresInDays: number | undefined;
		if (body.expiresInDays !== undefined) {
			if (
				typeof body.expiresInDays !== 'number' ||
				!Number.isInteger(body.expiresInDays) ||
				body.expiresInDays < 1 ||
				body.expiresInDays > MAX_EXPIRES_IN_DAYS
			) {
				error(400, `expiresInDays must be an integer between 1 and ${MAX_EXPIRES_IN_DAYS}`);
			}
			expiresInDays = body.expiresInDays;
		}

		const token = crypto.randomBytes(32).toString('hex');

		let expiresAt: Date | null = null;
		if (expiresInDays !== undefined) {
			expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + expiresInDays);
		}

		const [report] = await db
			.insert(sharedReport)
			.values({
				projectId,
				token,
				name: trimmedName,
				config: safeConfig,
				expiresAt,
				createdBy: user.id
			})
			.returning();

		return json(report, { status: 201 });
	}
);
