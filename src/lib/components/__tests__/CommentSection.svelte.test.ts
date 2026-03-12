import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, apiPost } from '$lib/api-client';
import CommentSection from '../CommentSection.svelte';

const mockApiFetch = vi.mocked(apiFetch);
const mockApiPost = vi.mocked(apiPost);

interface Comment {
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
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
	return {
		id: 1,
		testCaseId: 100,
		userId: 'user-1',
		content: 'Test comment content',
		parentId: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		userName: 'John Doe',
		userEmail: 'john@example.com',
		userImage: null,
		...overrides
	};
}

const defaultProps = {
	testCaseId: 100,
	projectId: 1,
	currentUserId: 'user-1',
	userRole: 'TESTER'
};

describe('CommentSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockApiFetch.mockResolvedValue([]);
	});

	// 1. Renders card with comment title
	it('renders card with comment title', async () => {
		render(CommentSection, { props: defaultProps });
		await waitFor(() => {
			expect(screen.getByText('댓글')).toBeTruthy();
		});
	});

	// 2. Shows loading state
	it('shows loading state while fetching comments', async () => {
		let resolveApiFetch: (value: unknown) => void;
		mockApiFetch.mockImplementation(
			() => new Promise((resolve) => { resolveApiFetch = resolve; })
		);

		render(CommentSection, { props: defaultProps });

		await waitFor(() => {
			expect(screen.getByText('불러오는 중...')).toBeTruthy();
		});

		// Resolve to clean up
		resolveApiFetch!([]);
	});

	// 3. Shows empty state when no comments
	it('shows empty state when no comments', async () => {
		mockApiFetch.mockResolvedValue([]);

		render(CommentSection, { props: defaultProps });

		await waitFor(() => {
			expect(screen.getByText('아직 댓글이 없습니다. 먼저 시작해보세요!')).toBeTruthy();
		});
	});

	// 4. Shows comment count badge when comments exist
	it('shows comment count badge when comments exist', async () => {
		const comments = [
			makeComment({ id: 1 }),
			makeComment({ id: 2, content: 'Second comment' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, { props: defaultProps });

		await waitFor(() => {
			expect(screen.getByText('2')).toBeTruthy();
		});
	});

	// 5. Renders top-level comments via CommentItem
	it('renders top-level comments', async () => {
		const comments = [
			makeComment({ id: 1, content: 'First top-level comment', parentId: null }),
			makeComment({ id: 2, content: 'Second top-level comment', parentId: null })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, { props: defaultProps });

		await waitFor(() => {
			expect(screen.getByText('First top-level comment')).toBeTruthy();
			expect(screen.getByText('Second top-level comment')).toBeTruthy();
		});
	});

	// 6. Renders replies indented under parent comment
	it('renders replies indented under parent comment', async () => {
		const comments = [
			makeComment({ id: 1, content: 'Parent comment', parentId: null }),
			makeComment({ id: 2, content: 'Reply to parent', parentId: 1, userId: 'user-2', userName: 'Jane' })
		];
		mockApiFetch.mockResolvedValue(comments);

		const { container } = render(CommentSection, { props: defaultProps });

		await waitFor(() => {
			expect(screen.getByText('Parent comment')).toBeTruthy();
			expect(screen.getByText('Reply to parent')).toBeTruthy();
		});

		// Reply should be inside an indented container (ml-11 border-l-2)
		const indentedDiv = container.querySelector('.ml-11.border-l-2');
		expect(indentedDiv).toBeTruthy();
		expect(indentedDiv!.textContent).toContain('Reply to parent');
	});

	// 7. VIEWER role cannot see comment form
	it('VIEWER role cannot see comment form', async () => {
		mockApiFetch.mockResolvedValue([]);

		const { container } = render(CommentSection, {
			props: { ...defaultProps, userRole: 'VIEWER' }
		});

		await waitFor(() => {
			expect(screen.getByText('아직 댓글이 없습니다. 먼저 시작해보세요!')).toBeTruthy();
		});

		// Should not render the comment form area with placeholder text
		expect(screen.queryByText('댓글을 작성하세요...')).toBeNull();
		// Should not render the mention hint
		expect(screen.queryByText('@이름으로 프로젝트 멤버를 멘션하세요')).toBeNull();
		// Should not have a textarea
		const textarea = container.querySelector('textarea');
		expect(textarea).toBeNull();
	});

	// 8. Non-VIEWER roles can see comment form
	it.each(['TESTER', 'ADMIN', 'PROJECT_ADMIN', 'MEMBER'])('%s role can see comment form', async (role) => {
		mockApiFetch.mockResolvedValue([]);

		render(CommentSection, {
			props: { ...defaultProps, userRole: role }
		});

		await waitFor(() => {
			expect(screen.getByText('@이름으로 프로젝트 멤버를 멘션하세요')).toBeTruthy();
		});
	});

	// 9. Toggle collapse/expand
	it('toggles collapse and expand on header click', async () => {
		mockApiFetch.mockResolvedValue([]);

		render(CommentSection, { props: defaultProps });

		await waitFor(() => {
			expect(screen.getByText('아직 댓글이 없습니다. 먼저 시작해보세요!')).toBeTruthy();
		});

		// Click the collapse toggle button
		const toggleButton = screen.getByText('댓글').closest('button')!;
		toggleButton.click();

		await waitFor(() => {
			// Content should be hidden when collapsed
			expect(screen.queryByText('아직 댓글이 없습니다. 먼저 시작해보세요!')).toBeNull();
		});

		// Click again to expand
		toggleButton.click();

		await waitFor(() => {
			expect(screen.getByText('아직 댓글이 없습니다. 먼저 시작해보세요!')).toBeTruthy();
		});
	});

	// 10. Submit new comment calls apiPost
	it('submit new comment calls apiPost with correct data', async () => {
		mockApiFetch.mockResolvedValue([]);
		const newComment = makeComment({ id: 10, content: 'New comment' });
		mockApiPost.mockResolvedValue(newComment);

		const { container } = render(CommentSection, { props: defaultProps });

		await waitFor(() => {
			expect(screen.getByText('아직 댓글이 없습니다. 먼저 시작해보세요!')).toBeTruthy();
		});

		// Type in the textarea using fireEvent
		const textarea = container.querySelector('textarea')!;
		expect(textarea).toBeTruthy();
		await fireEvent.input(textarea, { target: { value: 'New comment' } });

		// Click submit button
		const submitButton = screen.getByText('댓글 작성');
		await fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockApiPost).toHaveBeenCalledWith(
				'/api/projects/1/test-cases/100/comments',
				{ content: 'New comment' }
			);
		});
	});

	// 10b. Submit with custom commentUrl
	it('uses commentUrl prop when provided', async () => {
		mockApiFetch.mockResolvedValue([]);

		render(CommentSection, {
			props: { ...defaultProps, commentUrl: '/api/custom/comments' }
		});

		await waitFor(() => {
			expect(mockApiFetch).toHaveBeenCalledWith('/api/custom/comments');
		});
	});

	// 11. canModify logic (own comments + admin roles)
	it('own comments show delete button (canModify)', async () => {
		const comments = [
			makeComment({ id: 1, userId: 'user-1', content: 'My comment' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, {
			props: { ...defaultProps, currentUserId: 'user-1', userRole: 'TESTER' }
		});

		await waitFor(() => {
			expect(screen.getByText('삭제')).toBeTruthy();
		});
	});

	it('other user comments do not show delete button for TESTER', async () => {
		const comments = [
			makeComment({ id: 1, userId: 'other-user', content: 'Their comment' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, {
			props: { ...defaultProps, currentUserId: 'user-1', userRole: 'TESTER' }
		});

		await waitFor(() => {
			expect(screen.getByText('Their comment')).toBeTruthy();
		});

		expect(screen.queryByText('삭제')).toBeNull();
	});

	it('ADMIN can delete other user comments (canModify)', async () => {
		const comments = [
			makeComment({ id: 1, userId: 'other-user', content: 'Their comment' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, {
			props: { ...defaultProps, currentUserId: 'user-1', userRole: 'ADMIN' }
		});

		await waitFor(() => {
			expect(screen.getByText('삭제')).toBeTruthy();
		});
	});

	it('PROJECT_ADMIN can delete other user comments (canModify)', async () => {
		const comments = [
			makeComment({ id: 1, userId: 'other-user', content: 'Their comment' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, {
			props: { ...defaultProps, currentUserId: 'user-1', userRole: 'PROJECT_ADMIN' }
		});

		await waitFor(() => {
			expect(screen.getByText('삭제')).toBeTruthy();
		});
	});

	// 12. canEditComment logic (own comments + ADMIN only)
	it('own comments show edit button (canEditComment)', async () => {
		const comments = [
			makeComment({ id: 1, userId: 'user-1', content: 'My comment' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, {
			props: { ...defaultProps, currentUserId: 'user-1', userRole: 'TESTER' }
		});

		await waitFor(() => {
			expect(screen.getByText('수정')).toBeTruthy();
		});
	});

	it('other user comments do not show edit button for TESTER', async () => {
		const comments = [
			makeComment({ id: 1, userId: 'other-user', content: 'Their comment' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, {
			props: { ...defaultProps, currentUserId: 'user-1', userRole: 'TESTER' }
		});

		await waitFor(() => {
			expect(screen.getByText('Their comment')).toBeTruthy();
		});

		expect(screen.queryByText('수정')).toBeNull();
	});

	it('ADMIN can edit other user comments (canEditComment)', async () => {
		const comments = [
			makeComment({ id: 1, userId: 'other-user', content: 'Their comment' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, {
			props: { ...defaultProps, currentUserId: 'user-1', userRole: 'ADMIN' }
		});

		await waitFor(() => {
			expect(screen.getByText('수정')).toBeTruthy();
		});
	});

	it('PROJECT_ADMIN cannot edit other user comments (canEditComment)', async () => {
		const comments = [
			makeComment({ id: 1, userId: 'other-user', content: 'Their comment' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, {
			props: { ...defaultProps, currentUserId: 'user-1', userRole: 'PROJECT_ADMIN' }
		});

		await waitFor(() => {
			expect(screen.getByText('Their comment')).toBeTruthy();
		});

		// PROJECT_ADMIN can delete but NOT edit other users' comments
		expect(screen.queryByText('수정')).toBeNull();
		expect(screen.getByText('삭제')).toBeTruthy();
	});

	// Badge not shown when no comments
	it('does not show count badge when there are no comments', async () => {
		mockApiFetch.mockResolvedValue([]);

		const { container } = render(CommentSection, { props: defaultProps });

		await waitFor(() => {
			expect(screen.getByText('아직 댓글이 없습니다. 먼저 시작해보세요!')).toBeTruthy();
		});

		const badge = container.querySelector('.rounded-full.bg-primary');
		expect(badge).toBeNull();
	});

	// Badge includes replies in total count
	it('shows total count including replies in badge', async () => {
		const comments = [
			makeComment({ id: 1, content: 'Parent', parentId: null }),
			makeComment({ id: 2, content: 'Reply', parentId: 1 }),
			makeComment({ id: 3, content: 'Another reply', parentId: 1 })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, { props: defaultProps });

		await waitFor(() => {
			expect(screen.getByText('3')).toBeTruthy();
		});
	});

	// VIEWER cannot see reply buttons on comments
	it('VIEWER cannot see reply button on comments', async () => {
		const comments = [
			makeComment({ id: 1, content: 'A comment', userId: 'other-user' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, {
			props: { ...defaultProps, userRole: 'VIEWER' }
		});

		await waitFor(() => {
			expect(screen.getByText('A comment')).toBeTruthy();
		});

		expect(screen.queryByText('답글')).toBeNull();
	});

	// Non-VIEWER can see reply button
	it('non-VIEWER can see reply button on comments', async () => {
		const comments = [
			makeComment({ id: 1, content: 'A comment', userId: 'other-user' })
		];
		mockApiFetch.mockResolvedValue(comments);

		render(CommentSection, {
			props: { ...defaultProps, userRole: 'TESTER' }
		});

		await waitFor(() => {
			expect(screen.getByText('답글')).toBeTruthy();
		});
	});

	// Default baseUrl uses projectId and testCaseId
	it('constructs default API URL from projectId and testCaseId', async () => {
		mockApiFetch.mockResolvedValue([]);

		render(CommentSection, {
			props: { ...defaultProps, projectId: 5, testCaseId: 42 }
		});

		await waitFor(() => {
			expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/5/test-cases/42/comments');
		});
	});
});
