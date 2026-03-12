import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import CommentItem from '../CommentItem.svelte';

function makeComment(overrides: Partial<{
	id: number;
	testCaseId: number;
	userId: string;
	content: string;
	parentId: number | null;
	createdAt: string;
	updatedAt: string;
	userName: string | null;
	userEmail: string | null;
	userImage: string | null;
}> = {}) {
	return {
		id: 1,
		testCaseId: 100,
		userId: 'user-1',
		content: 'This is a test comment',
		parentId: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		userName: 'John Doe',
		userEmail: 'john@example.com',
		userImage: null,
		...overrides
	};
}

describe('CommentItem', () => {
	it('renders comment content', () => {
		render(CommentItem, {
			props: { comment: makeComment({ content: 'Hello world' }) }
		});
		expect(screen.getByText('Hello world')).toBeTruthy();
	});

	it('renders user name', () => {
		render(CommentItem, {
			props: { comment: makeComment({ userName: 'Alice' }) }
		});
		expect(screen.getByText('Alice')).toBeTruthy();
	});

	it('renders user email when name is null', () => {
		render(CommentItem, {
			props: { comment: makeComment({ userName: null, userEmail: 'alice@test.com' }) }
		});
		expect(screen.getByText('alice@test.com')).toBeTruthy();
	});

	it('renders "Unknown" when both name and email are null', () => {
		render(CommentItem, {
			props: { comment: makeComment({ userName: null, userEmail: null }) }
		});
		expect(screen.getByText('Unknown')).toBeTruthy();
	});

	it('renders user initials in avatar when no image', () => {
		const { container } = render(CommentItem, {
			props: { comment: makeComment({ userName: 'John Doe', userImage: null }) }
		});
		const avatar = container.querySelector('.rounded-full');
		expect(avatar?.textContent?.trim()).toBe('JD');
	});

	it('renders "?" for initials when name is null', () => {
		const { container } = render(CommentItem, {
			props: { comment: makeComment({ userName: null, userImage: null }) }
		});
		const avatar = container.querySelector('.rounded-full');
		expect(avatar?.textContent?.trim()).toBe('?');
	});

	it('renders user avatar image when provided', () => {
		const { container } = render(CommentItem, {
			props: {
				comment: makeComment({ userImage: 'https://example.com/avatar.jpg', userName: 'John' })
			}
		});
		const img = container.querySelector('img');
		expect(img).toBeTruthy();
		expect(img?.src).toContain('avatar.jpg');
	});

	it('shows (edited) indicator when updatedAt differs from createdAt by > 2 seconds', () => {
		const createdAt = '2024-01-01T12:00:00Z';
		const updatedAt = '2024-01-01T12:01:00Z'; // 60s later
		render(CommentItem, {
			props: { comment: makeComment({ createdAt, updatedAt }) }
		});
		expect(screen.getByText('(수정됨)')).toBeTruthy();
	});

	it('does not show (edited) when updatedAt is within 2 seconds of createdAt', () => {
		const now = new Date().toISOString();
		render(CommentItem, {
			props: { comment: makeComment({ createdAt: now, updatedAt: now }) }
		});
		expect(screen.queryByText('(수정됨)')).toBeNull();
	});

	it('shows reply button when canReply is true', () => {
		render(CommentItem, {
			props: {
				comment: makeComment(),
				canReply: true,
				onreply: vi.fn()
			}
		});
		expect(screen.getByText('답글')).toBeTruthy();
	});

	it('hides reply button when canReply is false', () => {
		render(CommentItem, {
			props: { comment: makeComment(), canReply: false }
		});
		expect(screen.queryByText('답글')).toBeNull();
	});

	it('shows edit button when canEdit is true', () => {
		render(CommentItem, {
			props: {
				comment: makeComment(),
				canEdit: true,
				onedit: vi.fn()
			}
		});
		expect(screen.getByText('수정')).toBeTruthy();
	});

	it('shows delete button when canDelete is true', () => {
		render(CommentItem, {
			props: {
				comment: makeComment(),
				canDelete: true,
				ondelete: vi.fn()
			}
		});
		expect(screen.getByText('삭제')).toBeTruthy();
	});

	it('calls onreply when reply button is clicked', async () => {
		const onreply = vi.fn();
		render(CommentItem, {
			props: {
				comment: makeComment(),
				canReply: true,
				onreply
			}
		});
		screen.getByText('답글').click();
		expect(onreply).toHaveBeenCalledOnce();
	});

	it('calls onedit when edit button is clicked', async () => {
		const onedit = vi.fn();
		render(CommentItem, {
			props: {
				comment: makeComment(),
				canEdit: true,
				onedit
			}
		});
		screen.getByText('수정').click();
		expect(onedit).toHaveBeenCalledOnce();
	});

	it('calls ondelete when delete button is clicked', async () => {
		const ondelete = vi.fn();
		render(CommentItem, {
			props: {
				comment: makeComment(),
				canDelete: true,
				ondelete
			}
		});
		screen.getByText('삭제').click();
		expect(ondelete).toHaveBeenCalledOnce();
	});

	it('shows edit form when editing is true', () => {
		const { container } = render(CommentItem, {
			props: {
				comment: makeComment(),
				editing: true,
				editContent: 'Edited content',
				onsaveedit: vi.fn(),
				oncanceledit: vi.fn()
			}
		});
		const textarea = container.querySelector('textarea');
		expect(textarea).toBeTruthy();
	});

	it('hides comment content when in edit mode', () => {
		render(CommentItem, {
			props: {
				comment: makeComment({ content: 'Original content' }),
				editing: true,
				editContent: 'Editing...',
				onsaveedit: vi.fn(),
				oncanceledit: vi.fn()
			}
		});
		// In edit mode the content text should not be rendered
		expect(screen.queryByText('Original content')).toBeNull();
	});

	it('uses smaller avatar for reply comments', () => {
		const { container } = render(CommentItem, {
			props: {
				comment: makeComment(),
				isReply: true
			}
		});
		const avatar = container.querySelector('.h-7.w-7');
		expect(avatar).toBeTruthy();
	});

	it('uses larger avatar for top-level comments', () => {
		const { container } = render(CommentItem, {
			props: {
				comment: makeComment(),
				isReply: false
			}
		});
		const avatar = container.querySelector('.h-8.w-8');
		expect(avatar).toBeTruthy();
	});

	it('shows relative time for recent comments', () => {
		const { container } = render(CommentItem, {
			props: {
				comment: makeComment({ createdAt: new Date().toISOString() })
			}
		});
		// "just now" should appear
		expect(container.textContent).toContain('just now');
	});
});
