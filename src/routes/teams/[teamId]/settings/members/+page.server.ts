import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms';
import { addTeamMemberSchema } from '$lib/schemas/team.schema';
import { emptyForm, validateForm } from '$lib/server/form-utils';
import { db } from '$lib/server/db';
import { teamMember, user } from '$lib/server/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { loadTeamMembers } from '$lib/server/queries';

async function requireTeamAdmin(authUser: NonNullable<App.Locals['user']>, teamId: number) {
	if (isGlobalAdmin(authUser)) return;
	const membership = await db.query.teamMember.findFirst({
		where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, authUser.id))
	});
	if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
		throw fail(403, { error: 'Insufficient permissions' });
	}
}

export const load: PageServerLoad = async ({ params }) => {
	const teamId = Number(params.teamId);

	const members = await loadTeamMembers(teamId);

	const addForm = await emptyForm(addTeamMemberSchema);

	return { members, addForm };
};

export const actions: Actions = {
	addMember: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const teamId = Number(params.teamId);
		await requireTeamAdmin(authUser, teamId);

		const form = await validateForm(addTeamMemberSchema, request);

		if (!form.valid) {
			return fail(400, { addForm: form });
		}

		const { userId, role } = form.data as { userId: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' };

		// Check if user is already a member
		const existing = await db.query.teamMember.findFirst({
			where: and(
				eq(teamMember.teamId, teamId),
				eq(teamMember.userId, userId)
			)
		});

		if (existing) {
			return message(form, 'User is already a member of this team', { status: 400 });
		}

		await db.insert(teamMember).values({
			teamId,
			userId,
			role
		});

		return message(form, 'Member added successfully');
	},

	updateRole: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const teamId = Number(params.teamId);
		await requireTeamAdmin(authUser, teamId);

		const formData = await request.formData();
		const memberId = Number(formData.get('memberId'));
		const role = formData.get('role') as string;

		if (!memberId || !role) {
			return fail(400, { error: 'Missing memberId or role' });
		}

		const member = await db.query.teamMember.findFirst({
			where: eq(teamMember.id, memberId)
		});

		if (!member || member.teamId !== teamId) {
			return fail(404, { error: 'Member not found' });
		}

		// Prevent demoting the last owner
		if (member.role === 'OWNER' && role !== 'OWNER') {
			const [ownerCount] = await db
				.select({ count: count() })
				.from(teamMember)
				.where(
					and(eq(teamMember.teamId, teamId), eq(teamMember.role, 'OWNER'))
				);

			if (ownerCount.count <= 1) {
				return fail(400, { error: 'Cannot demote the last team owner' });
			}
		}

		await db
			.update(teamMember)
			.set({ role: role as 'OWNER' | 'ADMIN' | 'MEMBER' })
			.where(eq(teamMember.id, memberId));

		return { success: true };
	},

	removeMember: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const teamId = Number(params.teamId);
		await requireTeamAdmin(authUser, teamId);

		const formData = await request.formData();
		const memberId = Number(formData.get('memberId'));

		if (!memberId) {
			return fail(400, { error: 'Missing memberId' });
		}

		const member = await db.query.teamMember.findFirst({
			where: eq(teamMember.id, memberId)
		});

		if (!member || member.teamId !== teamId) {
			return fail(404, { error: 'Member not found' });
		}

		// Prevent removing the last owner
		if (member.role === 'OWNER') {
			const [ownerCount] = await db
				.select({ count: count() })
				.from(teamMember)
				.where(
					and(eq(teamMember.teamId, teamId), eq(teamMember.role, 'OWNER'))
				);

			if (ownerCount.count <= 1) {
				return fail(400, { error: 'Cannot remove the last team owner' });
			}
		}

		await db.delete(teamMember).where(eq(teamMember.id, memberId));

		return { success: true };
	}
};
