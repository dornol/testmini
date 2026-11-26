import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import postgres from 'postgres';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * OIDC providers that have linked accounts.
 *
 * Linked accounts only appear after a real OIDC login, so the spec inserts the
 * `oidc_account` rows straight into the database. It needs
 * DATABASE_URL (environment or .env) and is skipped without it.
 */
function databaseUrl(): string | undefined {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	try {
		return readFileSync('.env', 'utf8').match(/^DATABASE_URL=["']?([^"'\n]+)["']?/m)?.[1];
	} catch {
		return undefined;
	}
}

test.describe.serial('OIDC provider with linked accounts', () => {
	test.skip(!databaseUrl(), 'DATABASE_URL is needed to link OIDC accounts');
	const key = randomUUID().slice(0, 8);
	const providerName = `Linked ${key} Provider`;
	const slug = `linked-${key}`;
	const password = randomUUID();
	const withPassword = { email: `with-pw-${key}@example.com`, name: `WithPw ${key}`, id: '' };
	const withoutPassword = { email: `no-pw-${key}@example.com`, name: `NoPw ${key}`, id: '' };
	let providerId: number;
	const sql = () => postgres(databaseUrl()!, { max: 1 });
	const formHeaders = (baseURL: string) => ({
		origin: baseURL,
		accept: 'application/json',
		'x-sveltekit-action': 'true'
	});

	test.beforeAll(async ({ request, baseURL }) => {
		const created = await request.post('/admin/oidc-providers/new?/create', {
			form: {
				name: providerName,
				slug,
				providerType: 'OIDC',
				clientId: 'linked-client',
				clientSecret: 'linked-secret',
				authorizationUrl: 'https://1.1.1.1/authorize',
				tokenUrl: 'https://1.1.1.1/token'
			},
			headers: formHeaders(baseURL!)
		});
		expect((await created.json()).type).toBe('redirect');

		for (const person of [withPassword, withoutPassword]) {
			const user = await request.post('/api/auth/admin/create-user', {
				data: { email: person.email, password, name: person.name, role: 'user' },
				headers: { origin: baseURL! }
			});
			expect(user.ok()).toBe(true);
			person.id = (await user.json()).user.id;
		}

		const db = sql();
		try {
			const [provider] = await db`select id from oidc_provider where slug = ${slug}`;
			providerId = Number(provider.id);
			for (const person of [withPassword, withoutPassword])
				await db`insert into oidc_account (user_id, provider_id, external_id, email, name)
					values (${person.id}, ${providerId}, ${'ext-' + person.id}, ${person.email}, ${person.name})`;
		} finally {
			await db.end();
		}
	});

	test.afterAll(async ({ request, baseURL }) => {
		for (const person of [withPassword, withoutPassword])
			if (person.id)
				await request.post('/api/auth/admin/remove-user', {
					data: { userId: person.id },
					headers: { origin: baseURL! }
				});
		if (providerId) {
			// The provider cannot be deleted while accounts are linked; users are gone now.
			await request.post('/admin/oidc-providers?/deleteProvider', {
				form: { providerId: String(providerId) },
				headers: formHeaders(baseURL!)
			});
		}
	});

	test('the list shows the linked account count', async ({ page }) => {
		await page.goto('/admin/oidc-providers');
		await expect(
			page.getByRole('main').getByText('2개 계정').filter({ visible: true })
		).toHaveCount(1);
	});

	test('deleting a provider with linked accounts warns and only disables it', async ({ page }) => {
		await page.goto('/admin/oidc-providers');
		const main = page.getByRole('main');
		const remove = main
			.getByRole('button', { name: `${providerName} 삭제` })
			.filter({ visible: true });
		await expect(async () => {
			await remove.click();
			await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 1500 });
		}).toPass({ timeout: 10000 });
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toContainText(providerName);
		// The question matches what happens (disable), and the reason is stated.
		await expect(dialog).toContainText('비활성화하시겠습니까');
		await expect(dialog).not.toContainText('삭제하시겠습니까');
		await expect(dialog).toContainText('연결된 계정이 있습니다');
		// The confirm button says "disable", not "delete", because that is what will happen.
		await expect(dialog.getByRole('button', { name: '삭제', exact: true })).toHaveCount(0);
		await dialog.getByRole('button', { name: '비활성화', exact: true }).click();
		await expect(dialog).toHaveCount(0);

		// The provider is still listed, now disabled, and its accounts are untouched.
		await page.reload();
		await expect(
			main.getByRole('button', { name: `${providerName} 활성화` }).filter({ visible: true })
		).toBeVisible();
		await expect(main.getByText('2개 계정').filter({ visible: true })).toHaveCount(1);
	});

	test('a user with a password can unlink; the page fits and is accessible', async ({
		browser,
		baseURL
	}) => {
		for (const width of [375, 1440]) {
			const context = await browser.newContext({ baseURL, viewport: { width, height: 850 } });
			try {
				const login = await context.request.post('/api/auth/sign-in/email', {
					data: { email: withPassword.email, password },
					headers: { origin: baseURL! }
				});
				expect(login.ok()).toBe(true);
				const page = await context.newPage();
				await page.goto('/auth/account');
				// The auth pages have no <main> landmark.
				const main = page.locator('body');
				await expect(main.getByText(providerName).first()).toBeVisible();
				await expect(main.getByText('비밀번호가 없어')).toHaveCount(0);
				const unlink = main.getByRole('button', { name: `${providerName} 연동 해제` });
				await expect(unlink).toBeEnabled();
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
				).toBe(false);
				const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
				expect(
					audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
				).toEqual([]);
				if (width === 375) continue;

				await expect(async () => {
					await unlink.click();
					await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 1500 });
				}).toPass({ timeout: 10000 });
				const dialog = page.getByRole('alertdialog');
				await expect(dialog).toContainText(providerName);
				await dialog.getByRole('button', { name: '연동 해제', exact: true }).click();
				await expect(dialog).toHaveCount(0);
				await expect(main.getByText('연동된 계정이 없습니다.')).toBeVisible();
			} finally {
				await context.close();
			}
		}
	});

	test('a user without a password cannot unlink their only way in', async ({
		browser,
		baseURL
	}) => {
		const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 850 } });
		try {
			// Sign in while the password exists, then remove it so the session stays valid.
			const login = await context.request.post('/api/auth/sign-in/email', {
				data: { email: withoutPassword.email, password },
				headers: { origin: baseURL! }
			});
			expect(login.ok()).toBe(true);
			const db = sql();
			try {
				await db`delete from account where user_id = ${withoutPassword.id} and provider_id = 'credential'`;
			} finally {
				await db.end();
			}

			const page = await context.newPage();
			await page.goto('/auth/account');
			// The auth pages have no <main> landmark.
			const main = page.locator('body');
			await expect(
				main.getByText('비밀번호가 없어 마지막 로그인 수단은 해제할 수 없습니다.')
			).toBeVisible();
			await expect(main.getByRole('button', { name: `${providerName} 연동 해제` })).toBeDisabled();
		} finally {
			await context.close();
		}
	});
});
