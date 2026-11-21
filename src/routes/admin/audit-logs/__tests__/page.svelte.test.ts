import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { goto } from '$app/navigation';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import AuditLogsPage from '../+page.svelte';

const log = (over: Record<string, unknown> = {}) => ({
	id: 1,
	action: 'CHANGE_ROLE',
	entityType: 'user',
	entityId: 'u2',
	projectId: null,
	metadata: null,
	ipAddress: '127.0.0.1',
	createdAt: new Date('2026-01-02T03:04:05Z'),
	userId: 'u1',
	userName: 'Pat',
	userEmail: 'pat@example.com',
	...over
});

// Pages only read their own load data, so tests pass a minimal `data` object.
function view(over: Record<string, unknown> = {}) {
	const data = {
		logs: [log()],
		actions: ['CHANGE_ROLE', 'LOGIN'],
		filters: { userId: '', action: '', projectId: '', from: '', to: '' },
		pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
		...over
	};
	return render(AuditLogsPage, { props: { data } as never });
}

beforeEach(() => {
	overwriteGetLocale(() => 'en');
	vi.clearAllMocks();
});

describe('admin audit logs page', () => {
	it('labels every filter field visibly', () => {
		view();
		for (const label of ['User ID', 'Action', 'From', 'To'])
			expect(screen.getByLabelText(label)).toBeTruthy();
	});

	it('submits the filters with Enter, resetting to the first page', async () => {
		view();
		await userEvent.type(screen.getByLabelText('User ID'), 'u9{Enter}');
		expect(goto).toHaveBeenCalledWith('/admin/audit-logs?userId=u9');
	});

	it('keeps a project filter that has no field instead of dropping it on search', async () => {
		view({ filters: { userId: '', action: '', projectId: '5', from: '', to: '' } });
		expect(screen.getByText('Project #5')).toBeTruthy();
		await userEvent.type(screen.getByLabelText('User ID'), 'u9{Enter}');
		expect(goto).toHaveBeenCalledWith('/admin/audit-logs?userId=u9&projectId=5');
	});

	it('turns a user name into a filter link that keeps the applied filters only', async () => {
		view({ filters: { userId: '', action: 'LOGIN', projectId: '', from: '', to: '' } });
		// Unapplied typing must not leak into the link.
		await userEvent.type(screen.getByLabelText('User ID'), 'typed');
		const link = screen.getAllByRole('link', { name: 'Show logs for Pat' })[0];
		expect(link.getAttribute('href')).toBe('/admin/audit-logs?userId=u1&action=LOGIN');
	});

	it('shows system events without a user link', () => {
		view({ logs: [log({ userId: null, userName: null, userEmail: null })] });
		expect(screen.queryByRole('link', { name: /Show logs for/ })).toBeNull();
		expect(screen.getAllByText('System').length).toBeGreaterThan(0);
	});

	it('reveals metadata in a details disclosure only when there is some', () => {
		view({
			logs: [log({ metadata: { role: 'admin' } }), log({ id: 2, metadata: {} })]
		});
		const summaries = screen.getAllByText('Details');
		// One log with metadata, rendered in both the card list and the table.
		expect(summaries).toHaveLength(2);
		expect(document.body.textContent).toContain('"role": "admin"');
	});

	it('offers clearing filters only while some are applied', async () => {
		const { unmount } = view();
		expect(screen.queryByRole('button', { name: 'Clear Filters' })).toBeNull();
		unmount();

		view({ filters: { userId: '', action: 'LOGIN', projectId: '', from: '', to: '' } });
		await userEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
		expect(goto).toHaveBeenCalledWith('/admin/audit-logs');
	});

	it('keeps all filters in pagination links', () => {
		view({
			filters: {
				userId: 'u1',
				action: 'LOGIN',
				projectId: '5',
				from: '2026-01-01',
				to: '2026-01-31'
			},
			pagination: { page: 2, limit: 50, total: 120, totalPages: 3 }
		});
		const base = 'userId=u1&action=LOGIN&projectId=5&from=2026-01-01&to=2026-01-31';
		expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe(
			`/admin/audit-logs?${base}`
		);
		expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
			`/admin/audit-logs?${base}&page=3`
		);
	});
});
