import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import postgres from 'postgres';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * Admin lists that need data the UI cannot easily produce.
 *
 * - Admin projects with more than one page (created through the API).
 * - Audit logs with metadata (rows inserted into the database, so the metadata shapes are
 *   under the test's control). The audit part needs DATABASE_URL (environment or .env) and
 *   is skipped without it.
 */
function databaseUrl(): string | undefined {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	try {
		return readFileSync('.env', 'utf8').match(/^DATABASE_URL=["']?([^"'\n]+)["']?/m)?.[1];
	} catch {
		return undefined;
	}
}

const accessible = async (page: import('@playwright/test').Page) => {
	const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
	expect(audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
		[]
	);
};

test.describe.serial('Admin projects with more than one page', () => {
	const COUNT = 22;
	const key = randomUUID().slice(0, 8);
	const ids: number[] = [];
	const list = `/admin/projects?search=AdminList${key}`;

	test.beforeAll(async ({ request }) => {
		test.setTimeout(120_000);
		for (let i = 0; i < COUNT; i += 6)
			await Promise.all(
				Array.from({ length: Math.min(6, COUNT - i) }, async (_, j) => {
					const response = await request.post('/api/projects', {
						data: { name: `AdminList${key}-${String(i + j).padStart(2, '0')}` }
					});
					expect(response.ok(), `project ${i + j}`).toBe(true);
					ids.push((await response.json()).data.id);
				})
			);
	});

	test.afterAll(async ({ request }) => {
		for (const id of ids) await request.delete(`/api/projects/${id}`);
	});

	for (const width of [375, 1440])
		test(`${width}px: pages through ${COUNT} projects and keeps the search`, async ({ page }) => {
			await page.setViewportSize({ width, height: 850 });
			await page.goto(list);
			const main = page.getByRole('main');
			const names = main
				.getByText(new RegExp(`^AdminList${key}-\\d{2}$`))
				.filter({ visible: true });
			await expect(names).toHaveCount(20);
			expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
			await accessible(page);

			const nav = main.getByRole('navigation', { name: '페이지 탐색' });
			await expect(nav.getByText('1 / 2')).toBeVisible();
			await nav.getByRole('link', { name: '다음' }).click();
			await expect(page).toHaveURL(/page=2/);
			await expect(page).toHaveURL(new RegExp(`search=AdminList${key}`));
			await expect(names).toHaveCount(COUNT - 20);
			await nav.getByRole('link', { name: '이전' }).click();
			await expect(names).toHaveCount(20);
		});
});

test.describe.serial('Audit logs with metadata', () => {
	test.skip(!databaseUrl(), 'DATABASE_URL is needed to insert audit log rows');
	const key = randomUUID().slice(0, 8);
	const action = `E2E_META_${key}`;
	const longToken = 'x'.repeat(240);
	const sql = () => postgres(databaseUrl()!, { max: 1 });
	const url = `/admin/audit-logs?action=${action}`;

	test.beforeAll(async () => {
		const db = sql();
		try {
			const rows = [
				{ entity: 'with-nested', metadata: { before: { role: 'user' }, after: { role: 'admin' } } },
				{ entity: 'with-long-token', metadata: { token: longToken, note: 'a long value' } },
				{ entity: 'without-metadata', metadata: null }
			];
			for (const row of rows)
				await db`insert into audit_log (action, entity_type, entity_id, metadata)
					values (${action}, 'E2E', ${row.entity}, ${row.metadata === null ? null : db.json(row.metadata)})`;
		} finally {
			await db.end();
		}
	});

	test.afterAll(async () => {
		const db = sql();
		try {
			await db`delete from audit_log where action = ${action}`;
		} finally {
			await db.end();
		}
	});

	for (const width of [375, 1440])
		test(`${width}px: metadata opens as details, wraps long values and stays accessible`, async ({
			page
		}) => {
			await page.setViewportSize({ width, height: 850 });
			await page.goto(url);
			const main = page.getByRole('main');
			await expect(main.getByText('총 3개')).toBeVisible();

			// Only the two rows that have metadata offer the disclosure.
			const summaries = main.locator('summary').filter({ hasText: '세부 정보', visible: true });
			await expect(summaries).toHaveCount(2);

			for (let i = 0; i < 2; i++) await summaries.nth(i).click();
			await expect(main.getByText('"role": "admin"').filter({ visible: true })).toHaveCount(1);
			await expect(main.getByText(longToken).filter({ visible: true })).toHaveCount(1);

			expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
			// The long unbroken value must wrap inside its box, not push the page sideways.
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
			).toBe(false);
			await accessible(page);
		});
});
