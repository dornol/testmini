import { expect, test } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

test.describe.serial('Workflow UI consistency', () => {
	let projectId: number;
	let caseId: number;
	const resourceIds: Record<string, number> = {};

	test('prepare isolated populated workflow fixtures', async ({ page }, testInfo) => {
		test.setTimeout(60_000);
		const response = await page.request.post('/api/projects', {
			data: { name: `Workflow UX ${Date.now()}` }
		});
		expect(response.ok()).toBe(true);
		projectId = (await response.json()).data.id;
		for (const resource of [
			'test-plans',
			'releases',
			'test-cycles',
			'test-suites',
			'test-runs',
			'exploratory'
		]) {
			await page.goto(`/projects/${projectId}/${resource}`);
			await page.waitForLoadState('networkidle');
			await expect(page.getByRole('heading', { level: 3 })).toBeVisible();
			await expect(
				page.getByRole('heading', { name: '조건에 맞는 결과가 없습니다' })
			).not.toBeVisible();
		}

		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#title').fill('Accessible workflow case');
		await page.locator('form button[type="submit"]').click();
		await page.waitForURL(/\/test-cases\/\d+$/);
		caseId = Number(page.url().match(/\/test-cases\/(\d+)$/)![1]);
		for (const [resource, data] of [
			['releases', { name: 'UX Release', version: '1.0' }],
			['test-plans', { name: 'UX Plan', testCaseIds: [caseId] }],
			['test-suites', { name: 'UX Suite', testCaseIds: [caseId] }],
			['test-cycles', { name: 'UX Cycle', cycleNumber: 1 }],
			['exploratory-sessions', { title: 'UX Session', charter: 'Check the workflow experience' }]
		] as const) {
			const result = await page.request.post(`/api/projects/${projectId}/${resource}`, { data });
			expect(result.ok(), `${resource}: ${await result.text()}`).toBe(true);
			resourceIds[resource] = (await result.json()).id;
		}
		await page.goto(`/projects/${projectId}/test-runs/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#name').fill('UX Run');
		await page.locator('input[type="checkbox"]:visible').first().check();
		await page.locator('button[type="submit"]').click();
		await page.waitForURL(/\/test-runs\/\d+$/);
		resourceIds['test-runs'] = Number(page.url().match(/\/test-runs\/(\d+)$/)![1]);
		await testInfo.attach('fixture-ids', {
			body: JSON.stringify({ projectId, caseId, ...resourceIds }),
			contentType: 'application/json'
		});
	});

	test('detail links use client navigation without reloading the document', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-runs`);
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => {
			Object.defineProperty(window, '__workflowUxMarker', { value: true });
		});
		await page.getByRole('link', { name: 'UX Run', exact: true }).click();
		await page.waitForURL(`**/projects/${projectId}/test-runs/${resourceIds['test-runs']}`);
		expect(await page.evaluate(() => Reflect.get(window, '__workflowUxMarker'))).toBe(true);
		await expect(page.getByRole('heading', { name: 'UX Run', exact: true })).toBeVisible();
	});

	test('status filters survive reload/back and explain empty matches', async ({ page }) => {
		for (const resource of ['test-plans', 'releases', 'test-cycles', 'test-runs', 'exploratory']) {
			await page.goto(`/projects/${projectId}/${resource}`);
			await page.waitForLoadState('networkidle');
			const filters = page.locator('[data-slot="status-filter"]');
			await filters.getByRole('button').last().click();
			await expect(page).toHaveURL(/status=/);
			await expect(filters.getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');
			await expect(
				page.getByRole('heading', { name: '조건에 맞는 결과가 없습니다' })
			).toBeVisible();
			await page.reload();
			await page.waitForLoadState('networkidle');
			await expect(filters.getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');
			await page.getByRole('button', { name: /필터 초기화|필터 지우기|Clear filters/ }).click();
			await expect(filters.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
			await page.goBack();
			await expect(filters.getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');
		}
	});

	for (const locale of ['ko', 'en'] as const) {
		for (const width of [375, 768, 1440]) {
			for (const theme of ['light', 'dark'] as const) {
				test(`${locale}/${theme}/${width}: populated workflow lists`, async ({
					page
				}, testInfo) => {
					test.setTimeout(120_000);
					await page.setViewportSize({ width, height: 1000 });
					await page.goto(`/projects/${projectId}/test-plans`);
					await page.waitForLoadState('networkidle');
					if (locale === 'en') {
						await page.getByRole('button', { name: '언어 변경' }).click();
						await page.getByRole('menuitem', { name: 'English' }).click();
						await expect(page.locator('html')).toHaveAttribute('lang', 'en');
						await page.waitForLoadState('networkidle');
					}
					const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
					if (isDark !== (theme === 'dark'))
						await page.getByRole('button', { name: /테마 변경|Toggle theme/ }).click();
					for (const resource of [
						'test-plans',
						'releases',
						'test-cycles',
						'test-suites',
						'test-runs',
						'exploratory'
					]) {
						await page.goto(`/projects/${projectId}/${resource}`);
						await page.waitForLoadState('networkidle');
						expect(
							await page.locator('main').evaluate((el) => el.scrollWidth > el.clientWidth),
							`${resource} overflow`
						).toBe(false);
						const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
						expect
							.soft(
								result.violations
									.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
									.map((v) => ({
										id: v.id,
										nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary }))
									})),
								resource
							)
							.toEqual([]);
						if (['releases', 'test-cycles', 'test-suites', 'exploratory'].includes(resource)) {
							const trigger = page.locator('[data-slot="page-header"]').getByRole('button').first();
							await trigger.click();
							const dialog = page.getByRole('dialog');
							await expect(dialog).toBeVisible();
							expect(
								await dialog.evaluate((el) => el.scrollWidth > el.clientWidth),
								`${resource} dialog overflow`
							).toBe(false);
							const modalResult = await new AxeBuilder({ page })
								.withTags(['wcag2a', 'wcag2aa'])
								.analyze();
							expect
								.soft(
									modalResult.violations
										.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
										.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
									`${resource} create dialog`
								)
								.toEqual([]);
							await page.keyboard.press('Escape');
							await expect(dialog).not.toBeVisible();
							await expect(trigger).toBeFocused();
						}
					}
					await testInfo.attach('exploratory', {
						body: await page.screenshot(),
						contentType: 'image/png'
					});

					await page.goto(`/projects/${projectId}/releases/${resourceIds.releases}`);
					await page.waitForLoadState('networkidle');
					expect(await page.locator('main').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
						false
					);
					for (const label of [/^(계획 연결|Link Plan)$/, /^(실행 연결|Link Run)$/]) {
						const trigger = page.getByRole('button', { name: label });
						await trigger.click();
						const dialog = page.getByRole('dialog', { name: label });
						await expect(dialog.getByRole('radio')).toBeVisible();
						expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
						const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
						expect
							.soft(
								result.violations
									.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
									.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
								String(label)
							)
							.toEqual([]);
						await page.keyboard.press('Escape');
						await expect(dialog).toHaveCount(0);
						await expect(trigger).toBeFocused();
					}
				});
			}
		}
	}

	test('release links support keyboard selection, retry, and an empty candidate state', async ({
		page
	}, testInfo) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await page.goto(`/projects/${projectId}/releases/${resourceIds.releases}`);
		await page.waitForLoadState('networkidle');
		for (const [resource, title, label, empty] of [
			['test-plans', 'UX Plan', '계획 연결', '이 프로젝트에 연결 가능한 계획이 없습니다.'],
			['test-runs', 'UX Run', '실행 연결', '이 프로젝트에 연결 가능한 실행이 없습니다.']
		] as const) {
			const opener = page.getByRole('button', { name: label, exact: true });
			await opener.click();
			const dialog = page.getByRole('dialog', { name: label, exact: true });
			const search = dialog.getByRole('searchbox');
			const submit = dialog.getByRole('button', { name: label, exact: true });
			await expect(submit).toBeDisabled();
			await search.fill('no matching result');
			await expect(dialog.getByRole('status')).toContainText('조건에 맞는 결과가 없습니다');
			await search.fill(title);
			const radio = dialog.getByRole('radio', { name: new RegExp(title) });
			await radio.press('Space');
			await expect(radio).toBeChecked();
			await search.fill('no matching result');
			await expect(dialog.getByText(`선택한 항목: ${title}`, { exact: true })).toBeVisible();
			await search.press('Enter');
			await expect(dialog).toBeVisible();
			await search.fill(title);
			await expect(radio).toBeChecked();
			const endpoint = `**/api/projects/${projectId}/${resource}/${resourceIds[resource]}`;
			let respond!: () => void;
			const pending = new Promise<void>((resolve) => {
				respond = resolve;
			});
			await page.route(endpoint, async (route) => {
				await pending;
				await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
			});
			await submit.click();
			try {
				await expect(dialog.locator('button[type=submit]')).toBeDisabled();
				await expect(radio).toBeDisabled();
				await page.keyboard.press('Escape');
				await expect(dialog).toBeVisible();
			} finally {
				respond();
			}
			const error = dialog.locator('[data-slot=form-error-summary]');
			await expect(error).toBeFocused();
			await expect(error).toContainText('저장하지 못했습니다');
			await expect(radio).toBeChecked();
			await expect(search).toHaveValue(title);
			expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
			const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
			expect(
				axe.violations
					.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
					.map((v) => v.id)
			).toEqual([]);
			await testInfo.attach(`${resource}-link-error`, {
				body: await page.screenshot({ path: `/tmp/testmini-release-link-${resource}.png` }),
				contentType: 'image/png'
			});
			await page.unroute(endpoint);
			await submit.click();
			await expect(dialog).toHaveCount(0);
			await expect(opener).toBeFocused();
			await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute(
				'href',
				`/projects/${projectId}/${resource}/${resourceIds[resource]}`
			);
			await opener.click();
			await expect(dialog.getByText(empty)).toBeVisible();
			await expect(dialog.getByRole('link')).toHaveAttribute(
				'href',
				`/projects/${projectId}/${resource}`
			);
			await expect(dialog.locator('button[type=submit]')).toHaveCount(0);
			await page.keyboard.press('Escape');
			await expect(dialog).toHaveCount(0);
		}
	});
});
