import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

// Relative luminance and contrast ratio, as defined by WCAG.
async function borderContrast(page: Page, selector: string) {
	return page.evaluate((sel) => {
		const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
		const lum = ([r, g, b]: number[]) => {
			const f = (v: number) => {
				const s = v / 255;
				return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		};
		const box = document.querySelector(sel) as HTMLElement;
		// The first opaque background up the tree is what the border sits on.
		let bg = [255, 255, 255];
		for (let el: HTMLElement | null = box; el; el = el.parentElement) {
			const c = getComputedStyle(el).backgroundColor;
			if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
				bg = parse(c);
				break;
			}
		}
		const border = parse(getComputedStyle(box).borderTopColor);
		const [a, b] = [lum(border), lum(bg)];
		return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
	}, selector);
}

test.describe.serial('Checkbox touch targets and contrast', () => {
	const key = randomUUID().slice(0, 8);
	let projectId: number;
	let runId: number;
	let headers: Record<string, string>;

	test.beforeAll(async ({ request, baseURL }) => {
		headers = { origin: baseURL! };
		const project = await request.post('/api/projects', {
			data: { name: `Checkbox ${key}` },
			headers
		});
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
		const form = (body: string) => ({
			data: body,
			headers: {
				...headers,
				'content-type': 'application/x-www-form-urlencoded',
				accept: 'application/json',
				'x-sveltekit-action': 'true'
			}
		});
		const caseIds: string[] = [];
		for (const title of ['One', 'Two', 'Three']) {
			const res = await request.post(
				`/projects/${projectId}/test-cases/new`,
				form(new URLSearchParams({ title: `${title} ${key}` }).toString())
			);
			const json = await res.json();
			expect(json.type).toBe('redirect');
			caseIds.push(json.location.split('/').at(-1));
		}
		// A new run starts with every case pending, which is what the run page lets you select.
		const body = new URLSearchParams({ name: `Run ${key}`, environment: 'e2e' });
		for (const id of caseIds) body.append('testCaseIds', id);
		const run = await request.post(`/projects/${projectId}/test-runs/new`, form(body.toString()));
		const runJson = await run.json();
		expect(runJson.type).toBe('redirect');
		runId = Number(runJson.location.split('/').at(-1));
	});

	// Projects cannot be deleted, so leave the fixture inactive.
	test.afterAll(async ({ request }) => {
		if (projectId)
			await request.post(`/projects/${projectId}/settings?/deactivate`, {
				form: {},
				headers: { ...headers, accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
	});

	const rowBox = (page: Page, title: string) =>
		page
			.getByRole('checkbox', { name: new RegExp(`TC-\\d+`) })
			.filter({ visible: true })
			.nth(title === 'first' ? 0 : 1);

	test('row and select-all checkboxes have a touch-sized hit area on a phone', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');

		for (const box of [
			page.getByRole('checkbox', { name: /전체 선택|select all/i }).first(),
			rowBox(page, 'first')
		]) {
			await expect(box).toBeVisible();
			const area = await box.locator('xpath=..').boundingBox();
			expect(area!.width).toBeGreaterThanOrEqual(32);
			expect(area!.height).toBeGreaterThanOrEqual(32);
			// The drawn box itself stays small, so rows do not get taller.
			const drawn = await box.boundingBox();
			expect(drawn!.width).toBeLessThanOrEqual(18);
		}
	});

	test('tapping the padding around a row checkbox selects it without opening the detail or moving the list', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');
		const box = rowBox(page, 'first');
		// Put the row mid-screen, clear of the bar that appears at the bottom.
		await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));

		// Where to tap: inside the label but outside the 16px box.
		const tapPadding = async () => {
			const area = (await box.locator('xpath=..').boundingBox())!;
			const drawn = (await box.boundingBox())!;
			await page.mouse.click(area.x + 3, drawn.y + drawn.height / 2);
		};
		await expect(box).not.toBeChecked();
		const before = (await box.boundingBox())!;

		await tapPadding();
		await expect(box).toBeChecked();
		await expect(page.locator('[data-slot=sheet-content]')).toHaveCount(0);

		// Selecting a row used to insert a tall action bar above the list and push it off-screen.
		const bar = page.getByText('1개 선택됨');
		await expect(bar).toBeVisible();
		const after = (await box.boundingBox())!;
		expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);

		// On a phone the bar starts collapsed to the count, a toggle and cancel.
		// The label changes between "작업" and "닫기", so find it by what it controls.
		const toggle = page.locator('[aria-controls=bulk-actions]');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(
			page.locator('#bulk-actions').getByRole('button', { name: '내보내기', exact: true })
		).toBeHidden();
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(
			page.locator('#bulk-actions').getByRole('button', { name: '내보내기', exact: true })
		).toBeVisible();
		await page.getByRole('button', { name: '닫기', exact: true }).click();
		await expect(
			page.locator('#bulk-actions').getByRole('button', { name: '내보내기', exact: true })
		).toBeHidden();

		// Unchecking works the same way, and the neighbouring row is untouched.
		await tapPadding();
		await expect(box).not.toBeChecked();
		await expect(rowBox(page, 'second')).not.toBeChecked();
		await expect(bar).toBeHidden();
	});

	test('on a wide screen the bar stays in the page flow with all actions visible', async ({
		page
	}) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');
		await rowBox(page, 'first').check();
		await expect(page.getByText('1개 선택됨')).toBeVisible();
		// No phone toggle, and the actions are right there.
		await expect(page.getByRole('button', { name: '작업', exact: true })).toBeHidden();
		await expect(
			page.locator('#bulk-actions').getByRole('button', { name: '내보내기', exact: true })
		).toBeVisible();
	});

	test('select all checks every row', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');
		const all = page.getByRole('checkbox', { name: /전체 선택|select all/i }).first();
		await all.check();
		for (const row of await page.getByRole('checkbox', { name: /TC-\d+/ }).all())
			await expect(row).toBeChecked();
	});

	for (const scheme of ['light', 'dark'] as const) {
		test(`the checkbox border meets 3:1 against the page in ${scheme} mode`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto(`/projects/${projectId}/test-cases`);
			await page.waitForLoadState('networkidle');
			const ratio = await borderContrast(page, 'label input[type=checkbox]');
			expect(ratio).toBeGreaterThanOrEqual(3);
		});
	}

	// ── Run page: selecting pending executions ───────────────────────────────────────────────
	const execBoxes = (page: Page) =>
		page.getByRole('checkbox', { name: /TC-\d+/ }).filter({ visible: true });

	for (const [label, width] of [
		['a phone', 375],
		['a wide screen', 1280]
	] as const) {
		test(`run page execution checkboxes have a touch target on ${label}`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto(`/projects/${projectId}/test-runs/${runId}`);
			await page.getByRole('heading').first().waitFor();
			await page.waitForTimeout(800);

			const boxes = execBoxes(page);
			await expect(boxes.first()).toBeVisible();
			const area = (await boxes.first().locator('xpath=..').boundingBox())!;
			expect(area.width).toBeGreaterThanOrEqual(32);
			expect(area.height).toBeGreaterThanOrEqual(32);
			expect((await boxes.first().boundingBox())!.width).toBeLessThanOrEqual(18);
		});
	}

	test('tapping the padding selects an execution without leaving the run page', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await page.goto(`/projects/${projectId}/test-runs/${runId}`);
		await page.getByRole('heading').first().waitFor();
		await page.waitForTimeout(800);
		const url = page.url();

		const box = execBoxes(page).first();
		await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
		const area = (await box.locator('xpath=..').boundingBox())!;
		const drawn = (await box.boundingBox())!;
		await expect(box).not.toBeChecked();
		await page.mouse.click(area.x + 3, drawn.y + drawn.height / 2);
		await expect(box).toBeChecked();
		expect(page.url()).toBe(url);
	});

	test('select all on the run page checks every pending execution', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto(`/projects/${projectId}/test-runs/${runId}`);
		await page.getByRole('heading').first().waitFor();
		await page.waitForTimeout(800);
		await page
			.getByRole('checkbox', { name: /전체 선택|select all/i })
			.first()
			.check();
		for (const row of await execBoxes(page).all()) await expect(row).toBeChecked();
	});

	for (const scheme of ['light', 'dark'] as const) {
		test(`run page checkbox borders meet 3:1 in ${scheme} mode`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await page.setViewportSize({ width: 1280, height: 800 });
			await page.goto(`/projects/${projectId}/test-runs/${runId}`);
			await page.getByRole('heading').first().waitFor();
			await page.waitForTimeout(800);
			expect(await borderContrast(page, 'label input[type=checkbox]')).toBeGreaterThanOrEqual(3);
		});
	}
});
