import { json, error } from '@sveltejs/kit';
import { withProjectAccess } from '$lib/server/api-handler';
import { db } from '$lib/server/db';
import { sharedReport } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { parseJsonBody } from '$lib/server/auth-utils';

export const GET = withProjectAccess(async ({ projectId }) => {
	const reports = await db
		.select()
		.from(sharedReport)
		.where(eq(sharedReport.projectId, projectId))
		.orderBy(sharedReport.createdAt);

	return json(reports);
});

export const POST = withProjectAccess(async ({ request, projectId, user }) => {
	const body = await parseJsonBody(request);
	const { name, config, expiresInDays } = body as {
		name: string;
		config: { from?: string; to?: string; preset?: string };
		expiresInDays?: number;
	};

	if (!name?.trim()) error(400, 'Name is required');

	const token = crypto.randomBytes(32).toString('hex');

	let expiresAt: Date | null = null;
	if (expiresInDays && expiresInDays > 0) {
		expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + expiresInDays);
	}

	const [report] = await db
		.insert(sharedReport)
		.values({
			projectId,
			token,
			name: name.trim(),
			config: config ?? {},
			expiresAt,
			createdBy: user.id
		})
		.returning();

	return json(report, { status: 201 });
});
