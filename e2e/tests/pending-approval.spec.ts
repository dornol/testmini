import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import postgres from 'postgres';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * A user waiting for approval.
 *
 * The app only creates unapproved users through OIDC sign-up, so this spec creates a normal
 * user and then flips `approved` to false directly in the database. It needs DATABASE_URL
 * (from the environment or .env) and is skipped without it, so a run against a remote
 * server never touches a database it does not know about.
 */
function databaseUrl(): string | undefined {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	try {
		return readFileSync('.env', 'utf8').match(/^DATABASE_URL=["']?([^"'\n]+)["']?/m)?.[1];
	} catch {
		return undefined;
	}
}

test.describe.serial('Unapproved user', () => {
	test.skip(!databaseUrl(), 'DATABASE_URL is needed to create an unapproved user');
	const key = randomUUID();
	const email = `pending-${key}@example.com`;
	const password = randomUUID();
	const name = 'Pending' + 'LongIdentifier'.repeat(3);
	let userId: string;
	const sql = () => postgres(databaseUrl()!, { max: 1 });

	test.beforeAll(async ({ request, baseURL }) => {
		const created = await request.post('/api/auth/admin/create-user', {
			data: { email, password, name, role: 'user' },
			headers: { origin: baseURL! }
		});
		expect(created.ok()).toBe(true);
		userId = (await created.json()).user.id;
		const db = sql();
		try {
			await db`update "user" set approved = false where id = ${userId}`;
		} finally {
			await db.end();
		}
	});

	test.afterAll(async ({ request, baseURL }) => {
		if (userId)
			expect(
				(
					await request.post('/api/auth/admin/remove-user', {
						data: { userId },
						headers: { origin: baseURL! }
					})
				).ok()
			).toBe(true);
	});

	async function signIn(browser: import('@playwright/test').Browser, baseURL: string, width = 375) {
		const context = await browser.newContext({ baseURL, viewport: { width, height: 850 } });
		const login = await context.request.post('/api/auth/sign-in/email', {
			data: { email, password },
			headers: { origin: baseURL }
		});
		expect(login.ok()).toBe(true);
		return context;
	}

	for (const width of [375, 1440])
		test(`${width}px: every app page leads to the approval page, which fits and is accessible`, async ({
			browser,
			baseURL
		}) => {
			const context = await signIn(browser, baseURL!, width);
			try {
				const page = await context.newPage();
				for (const url of ['/projects', '/my-work', '/teams']) {
					await page.goto(url);
					await expect(page, url).toHaveURL(/\/auth\/pending$/);
				}
				await expect(page.getByRole('heading', { level: 1 })).toHaveText('계정 승인 대기 중');
				const card = page.getByText(email);
				await expect(card).toBeVisible();
				await expect(page.getByText(name)).toBeVisible();
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
				).toBe(false);
				const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
				expect(
					audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
				).toEqual([]);
			} finally {
				await context.close();
			}
		});

	test('checking the status while unapproved explains it, then approval lets the user in', async ({
		browser,
		baseURL,
		request
	}) => {
		const context = await signIn(browser, baseURL!);
		try {
			const page = await context.newPage();
			await page.goto('/auth/pending');
			const check = page.getByRole('button', { name: '상태 확인' });
			// A click before hydration finishes is ignored, so retry until the notice shows.
			await expect(async () => {
				await check.click();
				await expect(page.getByRole('status')).toContainText('아직 승인되지 않았습니다', {
					timeout: 1500
				});
			}).toPass({ timeout: 10000 });
			await expect(page).toHaveURL(/\/auth\/pending$/);

			const approve = await request.post('/admin/users?/approve', {
				form: { userId },
				headers: {
					'x-sveltekit-action': 'true',
					accept: 'application/json',
					origin: baseURL!
				}
			});
			expect((await approve.json()).type).toBe('success');

			await check.click();
			await expect(page).toHaveURL(/\/projects$/);
		} finally {
			await context.close();
		}
	});

	test('the user can sign out from the approval page', async ({ browser, baseURL }) => {
		const db = sql();
		try {
			await db`update "user" set approved = false where id = ${userId}`;
		} finally {
			await db.end();
		}
		const context = await signIn(browser, baseURL!);
		try {
			const page = await context.newPage();
			await page.goto('/auth/pending');
			const logout = page.getByRole('button', { name: '로그아웃' });
			await expect(async () => {
				await logout.click();
				await expect(page).toHaveURL(/\/auth\/login/, { timeout: 1500 });
			}).toPass({ timeout: 10000 });
		} finally {
			await context.close();
		}
	});
});
