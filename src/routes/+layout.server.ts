import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { project, projectMember, testCaseGroup, userPreference, notification } from '$lib/server/db/schema';
import { and, eq, count } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals }) => {
	let preferences: { locale: string | null; theme: string | null } | null = null;
	let sidebarProjects: { id: number; name: string; groups: { id: number; name: string; color: string | null }[] }[] = [];
	let unreadNotificationCount = 0;

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
			// Single JOIN query: projectMember -> project -> testCaseGroup (left join)
			const rows = await db
				.select({
					projectId: project.id,
					projectName: project.name,
					groupId: testCaseGroup.id,
					groupName: testCaseGroup.name,
					groupColor: testCaseGroup.color
				})
				.from(projectMember)
				.innerJoin(project, and(eq(project.id, projectMember.projectId), eq(project.active, true)))
				.leftJoin(testCaseGroup, eq(testCaseGroup.projectId, project.id))
				.where(eq(projectMember.userId, locals.user.id));

			// Assemble into the expected nested structure
			const projectMap = new Map<number, { id: number; name: string; groups: { id: number; name: string; color: string | null }[] }>();

			for (const row of rows) {
				let entry = projectMap.get(row.projectId);
				if (!entry) {
					entry = { id: row.projectId, name: row.projectName, groups: [] };
					projectMap.set(row.projectId, entry);
				}
				if (row.groupId != null) {
					entry.groups.push({ id: row.groupId, name: row.groupName!, color: row.groupColor });
				}
			}

			sidebarProjects = Array.from(projectMap.values());
		} catch {
			// tables may not exist yet
		}

		try {
			const [row] = await db
				.select({ value: count() })
				.from(notification)
				.where(and(eq(notification.userId, locals.user.id), eq(notification.isRead, false)));
			unreadNotificationCount = row?.value ?? 0;
		} catch {
			// notification table may not exist yet
		}
	}

	return {
		user: locals.user ?? null,
		session: locals.session ?? null,
		preferences,
		sidebarProjects,
		unreadNotificationCount
	};
};
