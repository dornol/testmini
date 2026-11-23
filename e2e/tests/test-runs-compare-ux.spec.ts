import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

test.describe.serial('Test run comparison UX', () => {
	const key = randomUUID().slice(0, 8);
	const names = { a: `Compare A ${key}`, b: `Compare B ${key}` };
	// A formula-looking title must be defused in the exported CSV.
	const formulaTitle = '=HYPERLINK("http://evil.example","x")';
	let projectId: number;
	let runA: number;
	let runB: number;
	let headers: Record<string, string>;

	async function action(request: APIRequestContext, path: string, body: string) {
		const res = await request.post(path, {
			data: body,
			headers: {
				...headers,
				'content-type': 'application/x-www-form-urlencoded',
				accept: 'application/json',
				'x-sveltekit-action': 'true'
			}
		});
		const json = await res.json();
		expect(json.type, JSON.stringify(json)).toBe('redirect');
		return json.location as string;
	}

	async function createCase(request: APIRequestContext, title: string) {
		const location = await action(
			request,
			`/projects/${projectId}/test-cases/new`,
			new URLSearchParams({ title }).toString()
		);
		return Number(location.split('/').at(-1));
	}

	async function createRun(request: APIRequestContext, name: string, caseId: number) {
		const location = await action(
			request,
			`/projects/${projectId}/test-runs/new`,
			new URLSearchParams({ name, environment: 'e2e', testCaseIds: String(caseId) }).toString()
		);
		return Number(location.split('/').at(-1));
	}

	// Adds a case to a run and sets its result.
	async function record(request: APIRequestContext, runId: number, caseId: number, status: string) {
		const added = await request.post(`/api/projects/${projectId}/test-runs/${runId}/executions`, {
			data: { testCaseId: caseId },
			headers
		});
		expect(added.ok()).toBe(true);
		const { executionId } = await added.json();
		const set = await request.put(
			`/api/projects/${projectId}/test-runs/${runId}/executions/${executionId}/status`,
			{ data: { status }, headers }
		);
		expect(set.ok()).toBe(true);
	}

	test.beforeAll(async ({ request, baseURL }) => {
		headers = { origin: baseURL! };
		const project = await request.post('/api/projects', {
			data: { name: `Compare UX ${key}` },
			headers
		});
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;

		// c0 only exists so each run can be created; the rest cover every kind of change.
		const c0 = await createCase(request, `Seed ${key}`);
		const same = await createCase(request, `Same ${key}`);
		const regression = await createCase(request, formulaTitle);
		const improvement = await createCase(request, `Improvement ${key}`);
		const changed = await createCase(request, `Changed ${key}`);
		const onlyA = await createCase(request, `Only A ${key}`);
		const onlyB = await createCase(request, `Only B ${key}`);

		runA = await createRun(request, names.a, c0);
		runB = await createRun(request, names.b, c0);
		await record(request, runA, same, 'PASS');
		await record(request, runB, same, 'PASS');
		await record(request, runA, regression, 'PASS');
		await record(request, runB, regression, 'FAIL');
		await record(request, runA, improvement, 'FAIL');
		await record(request, runB, improvement, 'PASS');
		await record(request, runA, changed, 'PASS');
		await record(request, runB, changed, 'BLOCKED');
		await record(request, runA, onlyA, 'PASS');
		await record(request, runB, onlyB, 'PASS');
	});

	// Projects cannot be deleted, so leave the fixture inactive.
	test.afterAll(async ({ request }) => {
		if (projectId)
			await request.post(`/projects/${projectId}/settings?/deactivate`, {
				form: {},
				headers: { ...headers, accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
	});

	const compareUrl = () => `/projects/${projectId}/test-runs/compare?runA=${runA}&runB=${runB}`;

	test('two selected runs open the comparison from the run list', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-runs`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('checkbox', { name: `비교: ${names.a}` }).check();
		await page.getByRole('checkbox', { name: `비교: ${names.b}` }).check();
		await page.getByRole('button', { name: '비교', exact: true }).click();
		await expect(page).toHaveURL(/test-runs\/compare\?runA=\d+&runB=\d+/);
		await expect(page.getByRole('heading', { name: '런 비교' })).toBeVisible();
	});

	test('on a phone-sized screen two runs can be selected and compared', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await page.goto(`/projects/${projectId}/test-runs`);
		await page.waitForLoadState('networkidle');
		const first = page.getByRole('checkbox', { name: `비교: ${names.a}` });
		const second = page.getByRole('checkbox', { name: `비교: ${names.b}` });
		await expect(first).toBeVisible();

		// A 16px box with a 40px touch target around it.
		const target = await first.locator('xpath=..').boundingBox();
		expect(target!.width).toBeGreaterThanOrEqual(40);
		expect(target!.height).toBeGreaterThanOrEqual(40);

		await first.check();
		await expect(page.getByRole('status')).toContainText('정확히 2개');
		await second.check();
		await expect(page.getByRole('status')).toContainText(names.b);
		await page.getByRole('button', { name: '비교', exact: true }).click();
		await expect(page).toHaveURL(/test-runs\/compare\?runA=\d+&runB=\d+/);
		await expect(page.getByRole('heading', { name: '런 비교' })).toBeVisible();
	});

	test('each kind of change is named in text and cases link to their detail', async ({ page }) => {
		await page.goto(compareUrl());
		await page.waitForLoadState('networkidle');
		const table = page.getByRole('table', { name: '런 비교' });
		const rowOf = (title: string) => table.getByRole('row').filter({ hasText: title });

		await expect(rowOf(`Same ${key}`)).toContainText('동일');
		await expect(rowOf(formulaTitle)).toContainText('회귀');
		await expect(rowOf(`Improvement ${key}`)).toContainText('개선');
		await expect(rowOf(`Changed ${key}`)).toContainText('변경');
		await expect(rowOf(`Only A ${key}`)).toContainText('A에만 존재');
		await expect(rowOf(`Only B ${key}`)).toContainText('B에만 존재');
		// A case absent from a run is said so for screen readers, not only shown as a dash.
		await expect(rowOf(`Only A ${key}`)).toContainText('이 런에 없음');

		await expect(table.getByRole('link', { name: `Same ${key}` })).toHaveAttribute(
			'href',
			new RegExp(`/projects/${projectId}/test-cases/\\d+$`)
		);
		await expect(page.getByRole('link', { name: names.a })).toHaveAttribute(
			'href',
			`/projects/${projectId}/test-runs/${runA}`
		);
	});

	test('the difference filter is a pressed toggle and updates the shown count', async ({
		page
	}) => {
		await page.goto(compareUrl());
		await page.waitForLoadState('networkidle');
		const table = page.getByRole('table', { name: '런 비교' });
		await expect(page.getByRole('status')).toContainText('7건 표시 중');

		const diff = page.getByRole('button', { name: /^차이만/ });
		await expect(diff).toHaveAttribute('aria-pressed', 'false');
		await diff.click();
		await expect(diff).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('status')).toContainText('5건 표시 중');
		await expect(table.getByText(`Same ${key}`)).toHaveCount(0);
	});

	test('the CSV export is safe against spreadsheet formulas', async ({ page }) => {
		await page.goto(compareUrl());
		await page.waitForLoadState('networkidle');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'CSV 내보내기' }).click()
		]);
		expect(download.suggestedFilename()).toBe(`compare-${names.a}-vs-${names.b}.csv`);
		const csv = (
			await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8')
		)
			.replace('﻿', '')
			.split('\n');
		expect(csv[0]).toBe('"키","제목","우선순위","런 A 상태","런 B 상태","변화"');
		const line = csv.find((l) => l.includes('HYPERLINK'))!;
		// Starts with an apostrophe inside the quotes, and the embedded quotes are doubled.
		expect(line).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
		expect(line).toContain('"회귀"');
	});

	for (const width of [375, 768, 1440]) {
		test(`fits and passes accessibility checks at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto(compareUrl());
			await page.waitForLoadState('networkidle');
			const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
			expect(
				result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
			).toEqual([]);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBeLessThanOrEqual(0);
		});
	}
});
