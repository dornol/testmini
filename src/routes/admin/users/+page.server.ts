import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq, ilike, or, and, count, desc } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { logAudit } from '$lib/server/audit';
import { parsePositiveIntegerSearchParam } from '$lib/server/search-param-validation';
import { parseOptionalFormString } from '$lib/server/form-utils';

const MAX_USER_ID_LENGTH = 255;
const MAX_BAN_REASON_LENGTH = 500;

function parseUserId(value: FormDataEntryValue | null): string | null {
	if (typeof value !== 'string') return null;
	const userId = value.trim();
	if (!userId || userId.length > MAX_USER_ID_LENGTH || /[\x00-\x1F\x7F]/.test(userId)) {
		return null;
	}
	return userId;
}

function parseBanReason(value: FormDataEntryValue | null): string | null | 'invalid' {
	if (value === null) return null;
	if (typeof value !== 'string') return 'invalid';
	const banReason = value.trim();
	if (!banReason) return null;
	if (
		banReason.length > MAX_BAN_REASON_LENGTH ||
		/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(banReason)
	) {
		return 'invalid';
	}
	return banReason;
}

export const load: PageServerLoad = async ({ url }) => {
	const page = parsePositiveIntegerSearchParam(url.searchParams.get('page'), 1);
	const limit = 20;
	const search = url.searchParams.get('search') || '';
	const pendingOnly = url.searchParams.get('pending') === 'true';

	const conditions = [];
	if (search) {
		conditions.push(or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`)));
	}
	if (pendingOnly) {
		conditions.push(eq(user.approved, false));
	}

	const where = conditions.length > 1 ? and(...conditions) : conditions[0];

	const [total] = await db.select({ count: count() }).from(user).where(where);

	const users = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			approved: user.approved,
			banned: user.banned,
			banReason: user.banReason,
			createdAt: user.createdAt
		})
		.from(user)
		.where(where)
		.orderBy(desc(user.createdAt))
		.limit(limit)
		.offset((page - 1) * limit);

	return {
		users,
		search,
		pendingOnly,
		pagination: {
			page,
			limit,
			total: total.count,
			totalPages: Math.ceil(total.count / limit)
		}
	};
};

export const actions: Actions = {
	updateRole: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const userId = parseUserId(formData.get('userId'));
		const role = parseOptionalFormString(formData.get('role'));

		if (!userId || (role !== 'admin' && role !== 'user')) {
			return fail(400, { error: 'Invalid user ID or role' });
		}

		if (userId === authUser.id) {
			return fail(400, { error: 'Cannot change your own role' });
		}

		const target = await db.query.user.findFirst({
			where: eq(user.id, userId),
			columns: { id: true }
		});
		if (!target) {
			return fail(404, { error: 'User not found' });
		}

		const [updated] = await db.update(user).set({ role }).where(eq(user.id, userId)).returning();
		if (!updated) {
			return fail(404, { error: 'User not found' });
		}

		return { success: true };
	},

	ban: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const userId = parseUserId(formData.get('userId'));
		const banReason = parseBanReason(formData.get('banReason'));

		if (!userId) {
			return fail(400, { error: 'Invalid user ID' });
		}
		if (banReason === 'invalid') {
			return fail(400, { error: `Ban reason must be ${MAX_BAN_REASON_LENGTH} characters or less` });
		}

		if (userId === authUser.id) {
			return fail(400, { error: 'Cannot ban yourself' });
		}

		const target = await db.query.user.findFirst({
			where: eq(user.id, userId),
			columns: { id: true }
		});
		if (!target) {
			return fail(404, { error: 'User not found' });
		}

		const [updated] = await db
			.update(user)
			.set({ banned: true, banReason })
			.where(eq(user.id, userId))
			.returning();
		if (!updated) {
			return fail(404, { error: 'User not found' });
		}

		return { success: true };
	},

	unban: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const userId = parseUserId(formData.get('userId'));

		if (!userId) {
			return fail(400, { error: 'Invalid user ID' });
		}

		const target = await db.query.user.findFirst({
			where: eq(user.id, userId),
			columns: { id: true }
		});
		if (!target) {
			return fail(404, { error: 'User not found' });
		}

		const [updated] = await db
			.update(user)
			.set({ banned: false, banReason: null })
			.where(eq(user.id, userId))
			.returning();
		if (!updated) {
			return fail(404, { error: 'User not found' });
		}

		return { success: true };
	},

	approve: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const userId = parseUserId(formData.get('userId'));

		if (!userId) {
			return fail(400, { error: 'Invalid user ID' });
		}

		const target = await db.query.user.findFirst({
			where: eq(user.id, userId),
			columns: { id: true, approved: true }
		});
		if (!target) {
			return fail(404, { error: 'User not found' });
		}
		if (target.approved) {
			return fail(400, { error: 'User is already approved' });
		}

		const [updated] = await db
			.update(user)
			.set({ approved: true })
			.where(eq(user.id, userId))
			.returning();
		if (!updated) {
			return fail(404, { error: 'User not found' });
		}

		logAudit({
			userId: authUser.id,
			action: 'USER_APPROVED',
			entityType: 'USER',
			entityId: userId
		});

		return { success: true };
	},

	reject: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const userId = parseUserId(formData.get('userId'));

		if (!userId) {
			return fail(400, { error: 'Invalid user ID' });
		}

		if (userId === authUser.id) {
			return fail(400, { error: 'Cannot reject yourself' });
		}

		const target = await db.query.user.findFirst({
			where: eq(user.id, userId),
			columns: { id: true, approved: true, role: true }
		});

		if (!target || target.approved || target.role === 'admin') {
			return fail(400, { error: 'Only pending users can be rejected' });
		}

		const [deleted] = await db.delete(user).where(eq(user.id, userId)).returning();

		if (!deleted) {
			return fail(404, { error: 'User not found' });
		}

		logAudit({
			userId: authUser.id,
			action: 'USER_REJECTED',
			entityType: 'USER',
			entityId: userId
		});

		return { success: true };
	}
};
