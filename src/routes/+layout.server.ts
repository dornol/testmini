import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { project, projectMember, testCaseGroup, userPreference } from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals }) => {
	let preferences: { locale: string | null; theme: string | null } | null = null;
	let sidebarProjects: { id: number; name: string; groups: { id: number; name: string; color: string | null }[] }[] = [];

	if (locals.user) {
		try {
			const pref = await db.query.userPreference.findFirst({
				where: eq(userPreference.userId, locals.user.id)
			});
			if (pref) {
				preferences = { locale: pref.locale, theme: pref.theme };
			}
		} catch {
			// table may not exist yet if migration hasn't been run
		}

		try {
			const memberships = await db
				.select({ projectId: projectMember.projectId })
				.from(projectMember)
				.where(eq(projectMember.userId, locals.user.id));

			const projectIds = memberships.map((m) => m.projectId);

			if (projectIds.length > 0) {
				const projects = await db
					.select({ id: project.id, name: project.name })
					.from(project)
					.where(and(inArray(project.id, projectIds), eq(project.active, true)));

				const groups =
					projectIds.length > 0
						? await db
								.select({
									id: testCaseGroup.id,
									name: testCaseGroup.name,
									color: testCaseGroup.color,
									projectId: testCaseGroup.projectId
								})
								.from(testCaseGroup)
								.where(inArray(testCaseGroup.projectId, projectIds))
						: [];

				const groupsByProject = new Map<number, { id: number; name: string; color: string | null }[]>();
				for (const g of groups) {
					const list = groupsByProject.get(g.projectId) ?? [];
					list.push({ id: g.id, name: g.name, color: g.color });
					groupsByProject.set(g.projectId, list);
				}

				sidebarProjects = projects.map((p) => ({
					id: p.id,
					name: p.name,
					groups: groupsByProject.get(p.id) ?? []
				}));
			}
		} catch {
			// tables may not exist yet
		}
	}

	return {
		user: locals.user ?? null,
		session: locals.session ?? null,
		preferences,
		sidebarProjects
	};
};
