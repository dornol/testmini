import { describe, expect, it } from 'vitest';
import {
	filterAndSortWorkItems,
	parseProjectFilter,
	parseWorkType,
	type WorkItem
} from './my-work';

const baseItem: WorkItem = {
	id: 'case-1',
	type: 'ASSIGNED',
	projectId: 1,
	projectName: 'Alpha',
	title: 'TC-1 · Login',
	subtitle: null,
	priority: 'MEDIUM',
	href: '/projects/1/test-cases/1',
	createdAt: new Date('2026-07-10T00:00:00Z'),
	dueAt: null
};

describe('my-work filters', () => {
	it('accepts only known work types', () => {
		expect(parseWorkType('APPROVAL')).toBe('APPROVAL');
		expect(parseWorkType('unknown')).toBeNull();
		expect(parseWorkType(null)).toBeNull();
	});

	it('accepts only safe positive project IDs', () => {
		expect(parseProjectFilter('42')).toBe(42);
		expect(parseProjectFilter('0')).toBeNull();
		expect(parseProjectFilter('1.5')).toBeNull();
		expect(parseProjectFilter('9007199254740992')).toBeNull();
	});

	it('filters by type, project, and priority', () => {
		const items = [
			baseItem,
			{ ...baseItem, id: 'approval-2', type: 'APPROVAL' as const, projectId: 2, priority: 'HIGH' }
		];
		expect(
			filterAndSortWorkItems(items, { type: 'APPROVAL', projectId: 2, priority: 'high' }).map(
				(item) => item.id
			)
		).toEqual(['approval-2']);
	});

	it('sorts deadlines first, then priority and recency', () => {
		const items: WorkItem[] = [
			baseItem,
			{
				...baseItem,
				id: 'critical',
				priority: 'CRITICAL',
				createdAt: new Date('2026-07-09T00:00:00Z')
			},
			{
				...baseItem,
				id: 'deadline-later',
				type: 'DUE_SOON',
				dueAt: new Date('2026-07-15T00:00:00Z')
			},
			{
				...baseItem,
				id: 'deadline-sooner',
				type: 'DUE_SOON',
				dueAt: new Date('2026-07-14T00:00:00Z')
			}
		];
		expect(
			filterAndSortWorkItems(items, { type: null, projectId: null, priority: null }).map(
				(item) => item.id
			)
		).toEqual(['deadline-sooner', 'deadline-later', 'critical', 'case-1']);
	});
});
