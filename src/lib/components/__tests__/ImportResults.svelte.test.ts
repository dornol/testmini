import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ImportResults from '../ImportResults.svelte';

function makeResult(overrides: Partial<{
	imported: number;
	rows: { row: number; status: 'success' | 'skipped' | 'error'; title?: string; key?: string; error?: string }[];
}> = {}) {
	return {
		imported: 3,
		rows: [
			{ row: 1, status: 'success' as const, title: 'TC-1' },
			{ row: 2, status: 'success' as const, title: 'TC-2' },
			{ row: 3, status: 'success' as const, title: 'TC-3' }
		],
		...overrides
	};
}

describe('ImportResults', () => {
	it('renders success count', () => {
		const { container } = render(ImportResults, {
			props: {
				importResult: makeResult(),
				onreset: vi.fn(),
				onclose: vi.fn()
			}
		});
		// Should show green success text
		const successText = container.querySelector('.text-green-600');
		expect(successText).toBeTruthy();
	});

	it('renders all-success message when all rows succeed', () => {
		render(ImportResults, {
			props: {
				importResult: makeResult(),
				onreset: vi.fn(),
				onclose: vi.fn()
			}
		});
		expect(screen.getByText('모든 행을 성공적으로 가져왔습니다')).toBeTruthy();
	});

	it('shows auto-close message when all succeeded', () => {
		render(ImportResults, {
			props: {
				importResult: makeResult(),
				onreset: vi.fn(),
				onclose: vi.fn()
			}
		});
		expect(screen.getByText('Closing automatically in 3 seconds...')).toBeTruthy();
	});

	it('renders error rows when some fail', () => {
		render(ImportResults, {
			props: {
				importResult: makeResult({
					imported: 1,
					rows: [
						{ row: 1, status: 'success', title: 'TC-1' },
						{ row: 2, status: 'error', error: 'Missing title' },
						{ row: 3, status: 'skipped', error: 'Duplicate key' }
					]
				}),
				onreset: vi.fn(),
				onclose: vi.fn()
			}
		});
		// Should show partial success message
		expect(screen.getByText('일부 오류와 함께 가져오기 완료')).toBeTruthy();
	});

	it('renders failed rows section with correct count', () => {
		render(ImportResults, {
			props: {
				importResult: makeResult({
					imported: 1,
					rows: [
						{ row: 1, status: 'success' },
						{ row: 2, status: 'error', error: 'Bad data' },
						{ row: 3, status: 'skipped', error: 'Dup' }
					]
				}),
				onreset: vi.fn(),
				onclose: vi.fn()
			}
		});
		// Failed rows header with count (2)
		expect(screen.getByText(/실패한 행/)).toBeTruthy();
		expect(screen.getByText(/\(2\)/)).toBeTruthy();
	});

	it('expands failed rows on click', async () => {
		const { container } = render(ImportResults, {
			props: {
				importResult: makeResult({
					imported: 0,
					rows: [
						{ row: 1, status: 'error', error: 'Missing field' }
					]
				}),
				onreset: vi.fn(),
				onclose: vi.fn()
			}
		});

		// Click expand button
		const expandButton = container.querySelector('button[type="button"]');
		expect(expandButton).toBeTruthy();
		expandButton!.click();

		// After click, the table should be visible
		await vi.waitFor(() => {
			expect(container.querySelector('table')).toBeTruthy();
		});
	});

	it('renders progress bar', () => {
		const { container } = render(ImportResults, {
			props: {
				importResult: makeResult(),
				onreset: vi.fn(),
				onclose: vi.fn()
			}
		});
		const progressBar = container.querySelector('.bg-green-500');
		expect(progressBar).toBeTruthy();
	});

	it('calls onreset when "New Import" button is clicked', async () => {
		const onreset = vi.fn();
		render(ImportResults, {
			props: {
				importResult: makeResult(),
				onreset,
				onclose: vi.fn()
			}
		});
		screen.getByText('새로 가져오기').click();
		expect(onreset).toHaveBeenCalledOnce();
	});

	it('calls onclose when "Close" button is clicked', async () => {
		const onclose = vi.fn();
		render(ImportResults, {
			props: {
				importResult: makeResult(),
				onreset: vi.fn(),
				onclose
			}
		});
		screen.getByText('닫기').click();
		expect(onclose).toHaveBeenCalledOnce();
	});

	it('renders correct success ratio in progress bar', () => {
		const { container } = render(ImportResults, {
			props: {
				importResult: makeResult({
					imported: 2,
					rows: [
						{ row: 1, status: 'success' },
						{ row: 2, status: 'success' },
						{ row: 3, status: 'error', error: 'fail' },
						{ row: 4, status: 'error', error: 'fail' }
					]
				}),
				onreset: vi.fn(),
				onclose: vi.fn()
			}
		});
		const bar = container.querySelector('.bg-green-500') as HTMLElement;
		expect(bar).toBeTruthy();
		expect(bar.style.width).toBe('50%');
	});

	it('handles empty rows array', () => {
		const { container } = render(ImportResults, {
			props: {
				importResult: { imported: 0, rows: [] },
				onreset: vi.fn(),
				onclose: vi.fn()
			}
		});
		// Should still render without errors
		expect(container).toBeTruthy();
	});
});
