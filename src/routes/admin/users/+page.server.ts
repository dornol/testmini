import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq, ilike, or, and, count, desc } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { logAudit } from '$lib/server/audit';

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const limit = 20;
	const search = url.searchParams.get('search') || '';
	const pendingOnly = url.searchParams.get('pending') === 'true';

	const conditions = [];
	if (search) {
		conditions.push(
			or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))
		);
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
		const userId = formData.get('userId') as string;
		const role = formData.get('role') as string;

		if (!userId || !['admin', 'user'].includes(role)) {
			return fail(400, { error: 'Invalid user ID or role' });
		}

		if (userId === authUser.id) {
			return fail(400, { error: 'Cannot change your own role' });
		}

		await db.update(user).set({ role }).where(eq(user.id, userId));

		return { success: true };
	},

	ban: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const banReason = (formData.get('banReason') as string) || null;

		if (!userId) {
			return fail(400, { error: 'Invalid user ID' });
		}

		if (userId === authUser.id) {
			return fail(400, { error: 'Cannot ban yourself' });
		}

		await db
			.update(user)
			.set({ banned: true, banReason })
			.where(eq(user.id, userId));

		return { success: true };
	},

	unban: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;

		if (!userId) {
			return fail(400, { error: 'Invalid user ID' });
		}

		await db
			.update(user)
			.set({ banned: false, banReason: null })
			.where(eq(user.id, userId));

		return { success: true };
	},

	approve: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;

		if (!userId) {
			return fail(400, { error: 'Invalid user ID' });
		}

		await db.update(user).set({ approved: true }).where(eq(user.id, userId));

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
		const userId = formData.get('userId') as string;

		if (!userId) {
			return fail(400, { error: 'Invalid user ID' });
		}

		logAudit({
			userId: authUser.id,
			action: 'USER_REJECTED',
			entityType: 'USER',
			entityId: userId
		});

		await db.delete(user).where(eq(user.id, userId));

		return { success: true };
	}
};
