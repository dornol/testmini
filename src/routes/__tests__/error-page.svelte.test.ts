import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateAll } from '$app/navigation';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import ErrorPage from '../+error.svelte';

const state = vi.hoisted(() => ({
	page: { status: 404, error: { message: 'Release not found' } as { message: string } | null }
}));
vi.mock('$app/state', () => state);

function show(status: number, message: string | null, locale: 'ko' | 'en' = 'ko') {
	overwriteGetLocale(() => locale);
	state.page.status = status;
	state.page.error = message === null ? null : { message };
	render(ErrorPage);
}

describe('error page', () => {
	beforeEach(() => {
		vi.mocked(invalidateAll).mockClear();
	});

	it.each([
		[400, '잘못된 요청입니다'],
		[403, '권한이 없습니다'],
		[404, '찾을 수 없습니다']
	])('shows a Korean message for %i instead of the server text', (status, expected) => {
		show(status, 'Server said something in English');
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(String(status));
		expect(screen.getByText(new RegExp(expected))).toBeTruthy();
		expect(screen.queryByText(/Server said/)).toBeNull();
		expect(screen.getByRole('link', { name: '홈으로' }).getAttribute('href')).toBe('/');
		expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
	});

	it('shows the English message when the language is English', () => {
		show(404, 'Release not found', 'en');
		expect(screen.getByText(/could not find what you asked for/)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Go home' })).toBeTruthy();
	});

	it('hides server internals for a 500 and lets the user retry', async () => {
		show(500, 'ECONNREFUSED 10.0.0.5:5432 password authentication failed');
		expect(screen.getByText('문제가 발생했습니다')).toBeTruthy();
		expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
		await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});

	it('keeps the server text for other client errors and falls back when there is none', () => {
		show(409, 'Cycle number 3 already exists');
		expect(screen.getByText('Cycle number 3 already exists')).toBeTruthy();
	});

	it('falls back to the generic message when a client error has no text', () => {
		show(418, null);
		expect(screen.getByText('문제가 발생했습니다')).toBeTruthy();
	});
});
