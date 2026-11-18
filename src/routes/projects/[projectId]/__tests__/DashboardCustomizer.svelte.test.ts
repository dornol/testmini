import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LAYOUT } from '$lib/dashboard-widgets';
import DashboardCustomizer from '../DashboardCustomizer.svelte';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn().mockResolvedValue({}) }));

vi.mock('$lib/api-client', () => ({ apiFetch }));

describe('DashboardCustomizer', () => {
	beforeEach(() => {
		apiFetch.mockClear();
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

		await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce(), { timeout: 1_500 });
		expect(apiFetch).toHaveBeenCalledWith(
			'/api/projects/9/dashboard-layout',
			expect.objectContaining({ method: 'PUT' })
		);
		const payload = JSON.parse(apiFetch.mock.calls[0][1].body);
		expect(
			payload.layout.find((widget: { id: string }) => widget.id === 'stats_summary')
		).toMatchObject({ visible: false });
	});

	it('serializes updates and saves the newest order after a pending request', async () => {
		let resolveFirst!: (value: object) => void;
		apiFetch.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveFirst = resolve;
				})
		);
		render(DashboardCustomizer, {
			props: { projectId: 9, layout: DEFAULT_LAYOUT.map((widget) => ({ ...widget })) }
		});
		await fireEvent.click(screen.getByRole('button', { name: '대시보드 레이아웃 커스터마이즈' }));
		await fireEvent.click(screen.getByRole('switch', { name: '요약 지표 위젯 표시 전환' }));
		await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce(), { timeout: 1_500 });
		const up = screen.getByRole('button', { name: '합격률 추이 위로 이동' });
		await fireEvent.click(up);
		expect(up.getAttribute('aria-disabled')).toBe('true');
		expect(apiFetch).toHaveBeenCalledOnce();

		resolveFirst({});
		await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2), { timeout: 1_500 });
		const payload = JSON.parse(apiFetch.mock.calls[1][1].body);
		expect(payload.layout.slice(0, 2)).toMatchObject([
			{ id: 'pass_rate_trend', order: 0 },
			{ id: 'stats_summary', order: 1, visible: false }
		]);
	});
});
