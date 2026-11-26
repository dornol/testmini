import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import postgres from 'postgres';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * The admin user list with more than one page and with users waiting for approval.
 *
 * Needs DATABASE_URL (environment or .env) to mark two users as unapproved, because the app
 * only creates them through OIDC sign-up. Skipped without it.
 */
function databaseUrl(): string | undefined {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	try {
		return readFileSync('.env', 'utf8').match(/^DATABASE_URL=["']?([^"'\n]+)["']?/m)?.[1];
	} catch {
		return undefined;
	}
}

test.describe.serial('Admin user list fixtures', () => {
	test.skip(!databaseUrl(), 'DATABASE_URL is needed to create unapproved users');
	const COUNT = 24;
	const key = randomUUID().slice(0, 8);
	const password = randomUUID();
	const nameOf = (i: number) => `Bulk${key}-${String(i).padStart(2, '0')}`;
	const ids: string[] = [];
	const approveName = nameOf(0);
	const rejectName = nameOf(1);
	const list = (extra = '') => `/admin/users?search=Bulk${key}${extra}`;
	const row = (page: import('@playwright/test').Page, name: string) =>
		page.getByRole('main').getByText(name, { exact: true }).filter({ visible: true });

	test.beforeAll(async ({ request, baseURL }) => {
		test.setTimeout(120_000);
		for (let i = 0; i < COUNT; i += 4)
			await Promise.all(
				Array.from({ length: Math.min(4, COUNT - i) }, async (_, j) => {
					const n = i + j;
					const created = await request.post('/api/auth/admin/create-user', {
						data: {
							email: `bulk-${key}-${n}@example.com`,
							password,
							name: nameOf(n),
							role: 'user'
						},
						headers: { origin: baseURL! }
					});
					expect(created.ok(), `user ${n}: ${created.status()}`).toBe(true);
					ids[n] = (await created.json()).user.id;
				})
			);
		const db = postgres(databaseUrl()!, { max: 1 });
		try {
			await db`update "user" set approved = false where id in (${ids[0]}, ${ids[1]})`;
		} finally {
			await db.end();
		}
	});

	test.afterAll(async ({ request, baseURL }) => {
		for (const id of ids.filter(Boolean))
			await request.post('/api/auth/admin/remove-user', {
				data: { userId: id },
				headers: { origin: baseURL! }
			});
	});

	for (const width of [375, 1440])
		test(`${width}px: the list pages through ${COUNT} users and keeps the search`, async ({
			page
		}) => {
			await page.setViewportSize({ width, height: 850 });
			await page.goto(list());
			const main = page.getByRole('main');
			await expect(main.getByText(`${COUNT}명의 사용자`)).toBeVisible();
			const names = main.getByText(new RegExp(`^Bulk${key}-\\d{2}$`)).filter({ visible: true });
			await expect(names).toHaveCount(20);
			expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
			const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
			expect(
				audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
			).toEqual([]);

			const nav = main.getByRole('navigation', { name: '페이지 탐색' });
			await expect(nav.getByText('1 / 2')).toBeVisible();
			await nav.getByRole('link', { name: '다음' }).click();
			await expect(page).toHaveURL(/page=2/);
			await expect(page).toHaveURL(new RegExp(`search=Bulk${key}`));
			await expect(names).toHaveCount(COUNT - 20);
			await expect(nav.getByText('2 / 2')).toBeVisible();
			await nav.getByRole('link', { name: '이전' }).click();
			await expect(names).toHaveCount(20);
		});

	test('the pending filter shows only the users waiting for approval', async ({ page }) => {
		await page.goto(list());
		const main = page.getByRole('main');
		const toggle = main.getByRole('button', { name: '대기만 보기' });
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
		// A click before hydration finishes is ignored, so retry until the URL changes.
		await expect(async () => {
			await toggle.click();
			await expect(page).toHaveURL(/pending=true/, { timeout: 1500 });
		}).toPass({ timeout: 10000 });
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		await expect(main.getByText(`2명의 사용자`)).toBeVisible();
		await expect(row(page, approveName)).toHaveCount(1);
		await expect(row(page, rejectName)).toHaveCount(1);
		await expect(row(page, nameOf(2))).toHaveCount(0);
		await expect(page).toHaveURL(new RegExp(`search=Bulk${key}`));
	});

	test('approving and rejecting a waiting user work from the list', async ({ page }) => {
		const confirm = async (action: string, name: string) => {
			await page.goto(list('&pending=true'));
			const main = page.getByRole('main');
			const open = main
				.getByRole('button', { name: `${name} ${action}` })
				.filter({ visible: true });
			await expect(async () => {
				await open.click();
				await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 1500 });
			}).toPass({ timeout: 10000 });
			const dialog = page.getByRole('alertdialog');
			await expect(dialog).toContainText(name);
			await dialog.getByRole('button', { name: action, exact: true }).click();
			await expect(dialog).toHaveCount(0);
		};

		await confirm('승인', approveName);
		await expect(row(page, approveName)).toHaveCount(0);
		await expect(row(page, rejectName)).toHaveCount(1);

		await confirm('거절', rejectName);
		await expect(row(page, rejectName)).toHaveCount(0);
		await expect(page.getByRole('main')).toContainText('사용자를 찾을 수 없습니다');

		// The approved user is now a normal member; the rejected one is gone for good.
		await page.goto(list());
		const main = page.getByRole('main');
		await expect(main.getByText(`${COUNT - 1}명의 사용자`)).toBeVisible();
		// Oldest first-created users sit on page 2, so look the approved one up by name.
		await page.goto(`/admin/users?search=${approveName}`);
		await expect(row(page, approveName)).toHaveCount(1);
		await expect(main.getByText('대기', { exact: true })).toHaveCount(0);
		await page.goto(`/admin/users?search=${rejectName}`);
		await expect(main).toContainText('사용자를 찾을 수 없습니다');
	});
});
