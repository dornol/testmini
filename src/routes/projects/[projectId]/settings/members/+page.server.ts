import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms';
import { addMemberSchema, type AddMemberInput } from '$lib/schemas/member.schema';
import { emptyForm, validateForm } from '$lib/server/form-utils';
import { db } from '$lib/server/db';
import { projectMember, user } from '$lib/server/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';
import { logAudit } from '$lib/server/audit';
import { createNotification } from '$lib/server/notifications';
import { cacheDelete } from '$lib/server/cache';

export const load: PageServerLoad = async ({ params }) => {
	const projectId = Number(params.projectId);

	const members = await db
		.select({
			id: projectMember.id,
			userId: projectMember.userId,
			role: projectMember.role,
			createdAt: projectMember.createdAt,
			userName: user.name,
			userEmail: user.email
		})
		.from(projectMember)
		.innerJoin(user, eq(projectMember.userId, user.id))
		.where(eq(projectMember.projectId, projectId))
		.orderBy(projectMember.createdAt);

	const addForm = await emptyForm(addMemberSchema);

	return { members, addForm };
};

export const actions: Actions = {
	addMember: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN']);

		const form = await validateForm(addMemberSchema, request);

		if (!form.valid) {
			return fail(400, { addForm: form });
		}

		const { userId, role } = form.data as AddMemberInput;

		// Check if user is already a member
		const existing = await db.query.projectMember.findFirst({
			where: and(
				eq(projectMember.projectId, projectId),
				eq(projectMember.userId, userId)
			)
		});

		if (existing) {
			return message(form, 'User is already a member of this project', { status: 400 });
		}

		await db.insert(projectMember).values({
			projectId,
			userId,
			role
		});

		cacheDelete(`project:${projectId}:members`);

		// Fire-and-forget audit log
		logAudit({
			userId: authUser.id,
			action: 'ADD_MEMBER',
			entityType: 'MEMBER',
			entityId: userId,
			projectId,
			metadata: { role, targetUserId: userId }
		});

		// Fire-and-forget notification
		createNotification({
			userId,
			type: 'MEMBER_ADDED',
			title: 'Added to project',
			message: `You have been added as ${role}`,
			link: `/projects/${projectId}`,
			projectId
		});

		return message(form, 'Member added successfully');
	},

	updateRole: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN']);

		const formData = await request.formData();
		const memberId = Number(formData.get('memberId'));
		const role = formData.get('role') as string;

		if (!memberId || !role) {
			return fail(400, { error: 'Missing memberId or role' });
		}

		const member = await db.query.projectMember.findFirst({
			where: eq(projectMember.id, memberId)
		});

		if (!member || member.projectId !== projectId) {
			return fail(404, { error: 'Member not found' });
		}

		if (member.role === 'PROJECT_ADMIN' && role !== 'PROJECT_ADMIN') {
			const [adminCount] = await db
				.select({ count: count() })
				.from(projectMember)
				.where(
					and(eq(projectMember.projectId, projectId), eq(projectMember.role, 'PROJECT_ADMIN'))
				);

			if (adminCount.count <= 1) {
				return fail(400, { error: 'Cannot demote the last project admin' });
			}
		}

		await db
			.update(projectMember)
			.set({ role: role as 'PROJECT_ADMIN' | 'QA' | 'DEV' | 'VIEWER' })
			.where(eq(projectMember.id, memberId));

		cacheDelete(`project:${projectId}:members`);

		// Fire-and-forget audit log
		logAudit({
			userId: authUser.id,
			action: 'CHANGE_ROLE',
			entityType: 'MEMBER',
			entityId: member.userId,
			projectId,
			metadata: { memberId, oldRole: member.role, newRole: role }
		});

		return { success: true };
	},

	removeMember: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN']);

		const formData = await request.formData();
		const memberId = Number(formData.get('memberId'));

		if (!memberId) {
			return fail(400, { error: 'Missing memberId' });
		}

		const member = await db.query.projectMember.findFirst({
			where: eq(projectMember.id, memberId)
		});

		if (!member || member.projectId !== projectId) {
			return fail(404, { error: 'Member not found' });
		}

		if (member.role === 'PROJECT_ADMIN') {
			const [adminCount] = await db
				.select({ count: count() })
				.from(projectMember)
				.where(
					and(eq(projectMember.projectId, projectId), eq(projectMember.role, 'PROJECT_ADMIN'))
				);

			if (adminCount.count <= 1) {
				return fail(400, { error: 'Cannot remove the last project admin' });
			}
		}

		await db.delete(projectMember).where(eq(projectMember.id, memberId));

		cacheDelete(`project:${projectId}:members`);

		// Fire-and-forget audit log
		logAudit({
			userId: authUser.id,
			action: 'REMOVE_MEMBER',
			entityType: 'MEMBER',
			entityId: member.userId,
			projectId,
			metadata: { memberId, removedRole: member.role, targetUserId: member.userId }
		});

		return { success: true };
	}
};
