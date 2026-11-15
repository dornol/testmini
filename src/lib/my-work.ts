export const WORK_TYPES = [
	'ASSIGNED',
	'APPROVAL',
	'EXECUTION',
	'MENTION',
	'FAILURE',
	'RETEST',
	'DUE_SOON'
] as const;

export type WorkType = (typeof WORK_TYPES)[number];

export type WorkItem = {
	id: string;
	type: WorkType;
	projectId: number;
	projectName: string;
	title: string;
	subtitle: string | null;
	priority: string | null;
	href: string;
	createdAt: Date;
	dueAt: Date | null;
};

const PRIORITY_RANK: Record<string, number> = {
	CRITICAL: 0,
	HIGH: 1,
	MEDIUM: 2,
	LOW: 3
};

export function parseWorkType(value: string | null): WorkType | null {
	return WORK_TYPES.includes(value as WorkType) ? (value as WorkType) : null;
}

export function parseProjectFilter(value: string | null): number | null {
	if (!value || !/^\d+$/.test(value)) return null;
	const projectId = Number(value);
	return Number.isSafeInteger(projectId) && projectId > 0 ? projectId : null;
}

export function filterAndSortWorkItems(
	items: WorkItem[],
	filters: { type: WorkType | null; projectId: number | null; priority: string | null }
): WorkItem[] {
	return items
		.filter((item) => !filters.type || item.type === filters.type)
		.filter((item) => !filters.projectId || item.projectId === filters.projectId)
		.filter(
			(item) =>
				!filters.priority || item.priority?.toUpperCase() === filters.priority.toUpperCase()
		)
		.sort((a, b) => {
			if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
			if (a.dueAt) return -1;
			if (b.dueAt) return 1;
			const priorityDifference =
				(PRIORITY_RANK[a.priority?.toUpperCase() ?? ''] ?? 4) -
				(PRIORITY_RANK[b.priority?.toUpperCase() ?? ''] ?? 4);
			return priorityDifference || b.createdAt.getTime() - a.createdAt.getTime();
		});
}
