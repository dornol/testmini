import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, apiPost } from '$lib/api-client';
import NotificationBell from '../NotificationBell.svelte';

const mockApiFetch = vi.mocked(apiFetch);
const mockApiPost = vi.mocked(apiPost);

describe('NotificationBell', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockApiFetch.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
	});

	it('renders the bell button', () => {
		render(NotificationBell);
		const button = screen.getByRole('button', { name: 'Notifications' });
		expect(button).toBeTruthy();
	});

	it('shows unread badge when initialUnreadCount > 0', () => {
		render(NotificationBell, { props: { initialUnreadCount: 5 } });
		expect(screen.getByText('5')).toBeTruthy();
	});

	it('does not show unread badge when count is 0', () => {
		const { container } = render(NotificationBell, { props: { initialUnreadCount: 0 } });
		const badge = container.querySelector('[aria-label*="unread"]');
		expect(badge).toBeNull();
	});

	it('shows 99+ when count exceeds 99', () => {
		render(NotificationBell, { props: { initialUnreadCount: 150 } });
		expect(screen.getByText('99+')).toBeTruthy();
	});

	it('opens notification panel on click', async () => {
		render(NotificationBell, { props: { initialUnreadCount: 0 } });
		const button = screen.getByRole('button', { name: 'Notifications' });
		button.click();
		await vi.waitFor(() => {
			expect(screen.getByText('Notifications')).toBeTruthy();
		});
	});

	it('shows loading state when opening with no cached notifications', async () => {
		let resolveApiFetch: (value: unknown) => void;
		mockApiFetch.mockImplementation(() => new Promise((resolve) => { resolveApiFetch = resolve; }));

		render(NotificationBell, { props: { initialUnreadCount: 1 } });
		screen.getByRole('button', { name: 'Notifications' }).click();

		await vi.waitFor(() => {
			expect(screen.getByText('Loading…')).toBeTruthy();
		});

		// Resolve to clean up
		resolveApiFetch!({ items: [], nextCursor: null, hasMore: false });
	});

	it('shows empty state when no notifications', async () => {
		mockApiFetch.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });

		render(NotificationBell, { props: { initialUnreadCount: 0 } });
		screen.getByRole('button', { name: 'Notifications' }).click();

		await vi.waitFor(() => {
			expect(screen.getByText('No notifications yet')).toBeTruthy();
		});
	});

	it('renders notification items', async () => {
		mockApiFetch.mockResolvedValue({
			items: [
				{
					id: 1,
					userId: 'u1',
					type: 'TEST_RUN_COMPLETED',
					title: 'Test Run Finished',
					message: 'All tests passed',
					link: '/projects/1/test-runs/1',
					projectId: 1,
					isRead: false,
					createdAt: new Date().toISOString()
				}
			],
			nextCursor: null,
			hasMore: false
		});

		render(NotificationBell, { props: { initialUnreadCount: 1 } });
		screen.getByRole('button', { name: 'Notifications' }).click();

		await vi.waitFor(() => {
			expect(screen.getByText('Test Run Finished')).toBeTruthy();
			expect(screen.getByText('All tests passed')).toBeTruthy();
		});
	});

	it('renders correct type icons', async () => {
		const notifications = [
			{ id: 1, type: 'TEST_RUN_COMPLETED', title: 'Run Done', message: '', link: null, projectId: null, userId: 'u1', isRead: false, createdAt: new Date().toISOString() },
			{ id: 2, type: 'TEST_FAILED', title: 'Test Failed', message: '', link: null, projectId: null, userId: 'u1', isRead: false, createdAt: new Date().toISOString() }
		];

		mockApiFetch.mockResolvedValue({ items: notifications, nextCursor: null, hasMore: false });

		const { container } = render(NotificationBell, { props: { initialUnreadCount: 2 } });
		screen.getByRole('button', { name: 'Notifications' }).click();

		await vi.waitFor(() => {
			expect(container.textContent).toContain('✅');
			expect(container.textContent).toContain('❌');
		});
	});

	it('shows "Mark all as read" button when there are unread notifications', async () => {
		mockApiFetch.mockResolvedValue({
			items: [
				{ id: 1, type: 'COMMENT_ADDED', title: 'New Comment', message: 'Someone commented', link: null, projectId: null, userId: 'u1', isRead: false, createdAt: new Date().toISOString() }
			],
			nextCursor: null,
			hasMore: false
		});

		render(NotificationBell, { props: { initialUnreadCount: 1 } });
		screen.getByRole('button', { name: 'Notifications' }).click();

		await vi.waitFor(() => {
			expect(screen.getByText('Mark all as read')).toBeTruthy();
		});
	});

	it('marks all as read when button clicked', async () => {
		mockApiFetch.mockResolvedValue({
			items: [
				{ id: 1, type: 'ASSIGNED', title: 'Assigned', message: 'You were assigned', link: null, projectId: null, userId: 'u1', isRead: false, createdAt: new Date().toISOString() }
			],
			nextCursor: null,
			hasMore: false
		});
		mockApiPost.mockResolvedValue({});

		render(NotificationBell, { props: { initialUnreadCount: 1 } });
		screen.getByRole('button', { name: 'Notifications' }).click();

		await vi.waitFor(() => {
			screen.getByText('Mark all as read').click();
		});

		expect(mockApiPost).toHaveBeenCalledWith('/api/notifications/read', { all: true });
	});

	it('shows "Load more" button when hasMore is true', async () => {
		mockApiFetch.mockResolvedValue({
			items: [
				{ id: 1, type: 'COMMENT_ADDED', title: 'Comment', message: 'msg', link: null, projectId: null, userId: 'u1', isRead: true, createdAt: new Date().toISOString() }
			],
			nextCursor: 'abc',
			hasMore: true
		});

		render(NotificationBell, { props: { initialUnreadCount: 0 } });
		screen.getByRole('button', { name: 'Notifications' }).click();

		await vi.waitFor(() => {
			expect(screen.getByText('Load more')).toBeTruthy();
		});
	});

	it('applies opacity to read notifications', async () => {
		mockApiFetch.mockResolvedValue({
			items: [
				{ id: 1, type: 'ASSIGNED', title: 'Read notification', message: 'msg', link: null, projectId: null, userId: 'u1', isRead: true, createdAt: new Date().toISOString() }
			],
			nextCursor: null,
			hasMore: false
		});

		render(NotificationBell, { props: { initialUnreadCount: 0 } });
		screen.getByRole('button', { name: 'Notifications' }).click();

		await vi.waitFor(() => {
			const item = screen.getByRole('button', { name: /Read notification/ });
			expect(item.className).toContain('opacity-60');
		});
	});

	it('has correct aria attributes on bell button', () => {
		render(NotificationBell, { props: { initialUnreadCount: 3 } });
		const button = screen.getByRole('button', { name: 'Notifications' });
		expect(button.getAttribute('aria-haspopup')).toBe('true');
		expect(button.getAttribute('aria-expanded')).toBe('false');
	});
});
