import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LAYOUT } from '$lib/dashboard-widgets';
import DashboardCustomizer from '../DashboardCustomizer.svelte';

const { apiPut } = vi.hoisted(() => ({ apiPut: vi.fn().mockResolvedValue({}) }));

vi.mock('$lib/api-client', () => ({ apiPut }));
vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn() } }));

describe('DashboardCustomizer', () => {
	beforeEach(() => {
		apiPut.mockClear();
	});

	it('opens a localized widget panel and exposes switch state', async () => {
		render(DashboardCustomizer, {
			props: { projectId: 7, layout: DEFAULT_LAYOUT.map((widget) => ({ ...widget })) }
		});

		await fireEvent.click(screen.getByRole('button', { name: '대시보드 레이아웃 커스터마이즈' }));

		expect(screen.getByRole('region', { name: '대시보드 위젯' })).toBeTruthy();
		expect(screen.getByText('요약 지표')).toBeTruthy();
		expect(screen.getByText('테스트 케이스, 테스트 런, 합격률 요약')).toBeTruthy();
		expect(
			screen.getByRole('switch', { name: '요약 지표 위젯 표시 전환' }).getAttribute('aria-checked')
		).toBe('true');
	});

	it('toggles a widget and persists the changed layout', async () => {
		render(DashboardCustomizer, {
			props: { projectId: 9, layout: DEFAULT_LAYOUT.map((widget) => ({ ...widget })) }
		});
		await fireEvent.click(screen.getByRole('button', { name: '대시보드 레이아웃 커스터마이즈' }));

		const toggle = screen.getByRole('switch', { name: '요약 지표 위젯 표시 전환' });
		await fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-checked')).toBe('false');

		await waitFor(() => expect(apiPut).toHaveBeenCalledOnce(), { timeout: 1_500 });
		expect(apiPut).toHaveBeenCalledWith(
			'/api/projects/9/dashboard-layout',
			expect.objectContaining({
				layout: expect.arrayContaining([
					expect.objectContaining({ id: 'stats_summary', visible: false })
				])
			})
		);
	});
});
