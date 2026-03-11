import { page } from 'vitest/browser';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NotificationBell from './NotificationBell.svelte';

function mockFetch(data: unknown = { items: [], nextCursor: null, hasMore: false }) {
	return vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		text: () => Promise.resolve(JSON.stringify(data)),
		json: () => Promise.resolve(data)
	});
}

describe('NotificationBell', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		// Default: empty notification list (for polling and load calls)
		globalThis.fetch = mockFetch();
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.useRealTimers();
	});

	it('should render the bell button', async () => {
		render(NotificationBell, { initialUnreadCount: 0 });

		const bellBtn = page.getByRole('button', { name: 'Notifications' });
		await expect.element(bellBtn).toBeInTheDocument();
	});

	it('should show badge with initialUnreadCount', async () => {
		render(NotificationBell, { initialUnreadCount: 5 });

		await expect.element(page.getByText('5')).toBeInTheDocument();
	});

	it('should NOT show badge when initialUnreadCount is 0', async () => {
		const { container } = render(NotificationBell, { initialUnreadCount: 0 });

		const badge = container.querySelector('[aria-label*="unread notifications"]');
		expect(badge).toBeNull();
	});

	it('should display 99+ when unreadCount exceeds 99', async () => {
		render(NotificationBell, { initialUnreadCount: 150 });

		await expect.element(page.getByText('99+')).toBeInTheDocument();
	});

	it('should show exactly 99 without plus sign', async () => {
		render(NotificationBell, { initialUnreadCount: 99 });

		await expect.element(page.getByText('99')).toBeInTheDocument();
		const plus = page.getByText('99+');
		await expect.element(plus).not.toBeInTheDocument();
	});

	it('should sync unreadCount when initialUnreadCount prop changes', async () => {
		const { rerender } = render(NotificationBell, { initialUnreadCount: 3 });

		await expect.element(page.getByText('3')).toBeInTheDocument();

		await rerender({ initialUnreadCount: 7 });

		await expect.element(page.getByText('7')).toBeInTheDocument();
		// Old count should be gone
		const old = page.getByText('3');
		await expect.element(old).not.toBeInTheDocument();
	});

	it('should open notification panel on bell click', async () => {
		globalThis.fetch = mockFetch({ items: [], nextCursor: null, hasMore: false });

		render(NotificationBell, { initialUnreadCount: 0 });

		const bellBtn = page.getByRole('button', { name: 'Notifications' });
		await bellBtn.click();

		const panel = page.getByRole('dialog', { name: 'Notifications panel' });
		await expect.element(panel).toBeInTheDocument();
	});

	it('should show "No notifications yet" when list is empty', async () => {
		globalThis.fetch = mockFetch({ items: [], nextCursor: null, hasMore: false });

		render(NotificationBell, { initialUnreadCount: 0 });

		const bellBtn = page.getByRole('button', { name: 'Notifications' });
		await bellBtn.click();

		await expect.element(page.getByText('No notifications yet')).toBeInTheDocument();
	});

	it('should render notification items after loading', async () => {
		const items = [
			{
				id: 1,
				userId: 'u1',
				type: 'TEST_RUN_COMPLETED',
				title: 'Test Run Passed',
				message: 'All 42 tests passed',
				link: '/projects/1/runs/10',
				projectId: 1,
				isRead: false,
				createdAt: new Date().toISOString()
			},
			{
				id: 2,
				userId: 'u1',
				type: 'COMMENT_ADDED',
				title: 'New Comment',
				message: 'Someone commented on TC-5',
				link: null,
				projectId: 1,
				isRead: true,
				createdAt: new Date().toISOString()
			}
		];

		globalThis.fetch = mockFetch({ items, nextCursor: null, hasMore: false });

		render(NotificationBell, { initialUnreadCount: 1 });

		const bellBtn = page.getByRole('button', { name: 'Notifications' });
		await bellBtn.click();

		await expect.element(page.getByText('Test Run Passed')).toBeInTheDocument();
		await expect.element(page.getByText('New Comment')).toBeInTheDocument();
	});

	it('should show "Mark all as read" button when there are unread notifications in list', async () => {
		const items = [
			{
				id: 1,
				userId: 'u1',
				type: 'TEST_FAILED',
				title: 'Test Failed',
				message: 'TC-3 failed',
				link: null,
				projectId: 1,
				isRead: false,
				createdAt: new Date().toISOString()
			}
		];

		globalThis.fetch = mockFetch({ items, nextCursor: null, hasMore: false });

		render(NotificationBell, { initialUnreadCount: 1 });

		const bellBtn = page.getByRole('button', { name: 'Notifications' });
		await bellBtn.click();

		await expect
			.element(page.getByRole('button', { name: 'Mark all as read' }))
			.toBeInTheDocument();
	});

	it('should set aria-expanded based on panel open state', async () => {
		globalThis.fetch = mockFetch();

		render(NotificationBell, { initialUnreadCount: 0 });

		const bellBtn = page.getByRole('button', { name: 'Notifications' });
		await expect.element(bellBtn).toHaveAttribute('aria-expanded', 'false');

		await bellBtn.click();
		await expect.element(bellBtn).toHaveAttribute('aria-expanded', 'true');
	});

	it('should show badge aria-label with unread count', async () => {
		const { container } = render(NotificationBell, { initialUnreadCount: 3 });

		const badge = container.querySelector('[aria-label="3 unread notifications"]');
		expect(badge).not.toBeNull();
	});
});
