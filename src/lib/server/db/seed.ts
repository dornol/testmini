import { db } from '$lib/server/db';
import { user, account } from '$lib/server/db/auth.schema';
import { count } from 'drizzle-orm';
import { logger } from '$lib/server/logger';
import { env } from '$env/dynamic/private';
import { hashPassword, generateRandomString } from 'better-auth/crypto';

/**
 * Seeds the initial admin account if no users exist.
 * Credentials default to admin@admin.local / admin1234 but can be overridden via env vars.
 */
export async function seedAdminUser() {
	const [{ value }] = await db.select({ value: count() }).from(user);
	if (value > 0) return;

	const email = env.ADMIN_EMAIL ?? 'admin@admin.local';
	const password = env.ADMIN_PASSWORD ?? 'admin1234';
	const name = env.ADMIN_NAME ?? 'admin';

	const userId = generateRandomString(32);
	const accountId = generateRandomString(32);
	const hashedPassword = await hashPassword(password);
	const now = new Date();

	await db.insert(user).values({
		id: userId,
		name,
		email,
		emailVerified: true,
		role: 'admin',
		createdAt: now,
		updatedAt: now
	});

	await db.insert(account).values({
		id: accountId,
		accountId: userId,
		providerId: 'credential',
		userId,
		password: hashedPassword,
		createdAt: now,
		updatedAt: now
	});

	logger.info('='.repeat(50));
	logger.info('  Admin account created');
	logger.info(`  Email:    ${email}`);
	logger.info(`  Password: ${password}`);
	logger.info('='.repeat(50));
}
