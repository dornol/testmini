import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * Sweeps the main screens in dark mode and at 200% zoom (1280px → 640 CSS px) and fails on
 * serious/critical axe findings (which include colour contrast) or horizontal overflow.
 * Slow, so it only runs with E2E_SWEEP=1 (`pnpm test:e2e:sweep`).
 * Set SWEEP_SHOTS=<dir> to also save a screenshot of every visit for manual review, and
 * SWEEP_ONLY=<regex> to open overlays only on matching paths (full run: about 25 min).
 */

const MODES = [
	{ name: 'dark-1440', viewport: { width: 1440, height: 1500 }, colorScheme: 'dark' as const },
	{ name: 'light-zoom200', viewport: { width: 640, height: 1800 }, colorScheme: 'light' as const },
	{ name: 'dark-zoom200', viewport: { width: 640, height: 1800 }, colorScheme: 'dark' as const },
	// In-between widths, where a table may be shown before it has room for its columns.
	{ name: 'light-768', viewport: { width: 768, height: 1500 }, colorScheme: 'light' as const },
	{ name: 'light-1024', viewport: { width: 1024, height: 1500 }, colorScheme: 'light' as const }
];

type Finding = { mode: string; path: string; issue: string };

/**
 * Text under 12px is counted on every screen and reported at the end. Screens listed here have
 * been cleaned up, so any small text on them fails the sweep. Add a screen once it is done.
 */
const SMALL_TEXT_ENFORCED = [/\/test-runs$/, /\/test-runs\/compare/];

test.describe.serial('Dark mode and 200% zoom sweep', () => {
	test.skip(!process.env.E2E_SWEEP, 'Slow (about 5 min). Run it with `pnpm test:e2e:sweep`.');
	const key = randomUUID().slice(0, 8);
	const ids: Record<string, number> = {};
	let headers: Record<string, string>;
	let paths: string[] = [];
	const findings: Finding[] = [];
	const smallText = new Map<string, string[]>();
	const providerName = `Sweep provider ${key}`;

	const idOf = (json: { id?: number; data?: { id: number } }) => (json.id ?? json.data?.id)!;

	async function api(request: APIRequestContext, path: string, data: object) {
		const res = await request.post(path, { data, headers });
		expect(res.ok(), `${path}: ${res.status()} ${await res.text()}`).toBe(true);
		return idOf(await res.json());
	}

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
		expect(json.type, `${path}: ${JSON.stringify(json)}`).toBe('redirect');
		return json.location as string;
	}

	test.beforeAll(async ({ request, baseURL }) => {
		headers = { origin: baseURL! };
		const p = (
			await (
				await request.post('/api/projects', { data: { name: `Sweep ${key}` }, headers })
			).json()
		).data.id as number;
		ids.project = p;
		const base = `/api/projects/${p}`;

		const caseIds: number[] = [];
		for (const title of ['Login', 'Checkout', 'Search', 'Refund']) {
			const loc = await action(
				request,
				`/projects/${p}/test-cases/new`,
				new URLSearchParams({ title: `${title} ${key}` }).toString()
			);
			caseIds.push(Number(loc.split('/').at(-1)));
		}
		ids.case = caseIds[0];

		const runLoc = await action(
			request,
			`/projects/${p}/test-runs/new`,
			new URLSearchParams({
				name: `Run ${key}`,
				environment: 'e2e',
				testCaseIds: String(caseIds[0])
			}).toString()
		);
		ids.run = Number(runLoc.split('/').at(-1));
		const runLoc2 = await action(
			request,
			`/projects/${p}/test-runs/new`,
			new URLSearchParams({
				name: `Run 2 ${key}`,
				environment: 'e2e',
				testCaseIds: String(caseIds[0])
			}).toString()
		);
		ids.run2 = Number(runLoc2.split('/').at(-1));
		const statuses = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];
		for (const [i, c] of caseIds.slice(1).entries())
			for (const run of [ids.run, ids.run2]) {
				const added = await request.post(`${base}/test-runs/${run}/executions`, {
					data: { testCaseId: c },
					headers
				});
				const { executionId } = await added.json();
				await request.put(`${base}/test-runs/${run}/executions/${executionId}/status`, {
					data: { status: statuses[(i + (run === ids.run ? 0 : 1)) % 4] },
					headers
				});
			}

		ids.suite = await api(request, `${base}/test-suites`, {
			name: `Suite ${key}`,
			testCaseIds: caseIds
		});
		ids.plan = await api(request, `${base}/test-plans`, {
			name: `Plan ${key}`,
			milestone: 'v1',
			testCaseIds: caseIds
		});
		ids.release = await api(request, `${base}/releases`, {
			name: `Release ${key}`,
			version: '1.0.0'
		});
		ids.requirement = await api(request, `${base}/requirements`, { title: `Requirement ${key}` });
		await api(request, `${base}/test-cycles`, { name: `Cycle ${key}`, cycleNumber: 1 });
		ids.session = await api(request, `${base}/exploratory-sessions`, {
			title: `Session ${key}`,
			charter: 'Explore the sweep',
			environment: 'e2e'
		});
		await api(request, `${base}/tags`, {
			name: `Tag ${key}`,
			color: '#ff6b6b',
			testCaseId: caseIds[0]
		});

		const teamLoc = await action(
			request,
			'/teams/new',
			new URLSearchParams({ name: `Sweep team ${key}` }).toString()
		);
		ids.team = Number(teamLoc.split('/').at(-1));

		// A provider of our own, so the admin dialogs can be opened without touching real ones.
		await action(
			request,
			'/admin/oidc-providers/new?/create',
			new URLSearchParams({
				name: providerName,
				slug: `sweep-${key}`,
				providerType: 'OIDC',
				clientId: 'sweep-client',
				clientSecret: 'sweep-secret',
				authorizationUrl: 'https://1.1.1.1/authorize',
				tokenUrl: 'https://1.1.1.1/token'
			}).toString()
		);
		const list = await (await request.get('/admin/oidc-providers')).text();
		ids.provider = Number(
			list
				.split(providerName)[0]
				.match(/\/admin\/oidc-providers\/(\d+)(?!.*\/admin\/oidc-providers\/\d+)/s)?.[1]
		);

		const P = `/projects/${p}`;
		paths = [
			'/projects',
			'/projects/new',
			'/my-work',
			'/teams',
			'/teams/new',
			'/account/profile',
			'/auth/account',
			'/admin/users',
			'/admin/projects',
			'/admin/branding',
			'/admin/oidc-providers',
			'/admin/oidc-providers/new',
			'/admin/audit-logs',
			`/teams/${ids.team}`,
			`/teams/${ids.team}/settings`,
			`/teams/${ids.team}/settings/members`,
			P,
			`${P}/test-cases`,
			`${P}/test-cases/new`,
			`${P}/test-cases/${ids.case}`,
			`${P}/test-runs`,
			`${P}/test-runs/new`,
			`${P}/test-runs/${ids.run}`,
			`${P}/test-runs/compare?runA=${ids.run}&runB=${ids.run2}`,
			`${P}/test-suites`,
			`${P}/test-suites/${ids.suite}`,
			`${P}/test-plans`,
			`${P}/test-plans/new`,
			`${P}/test-plans/${ids.plan}`,
			`${P}/test-cycles`,
			`${P}/releases`,
			`${P}/releases/${ids.release}`,
			`${P}/exploratory`,
			`${P}/exploratory/${ids.session}`,
			`${P}/quality`,
			`${P}/reports`,
			`${P}/traceability`,
			`${P}/settings`,
			`${P}/settings/api-keys`,
			`${P}/settings/custom-fields`,
			`${P}/settings/environments`,
			`${P}/settings/issue-tracker`,
			`${P}/settings/members`,
			`${P}/settings/priorities`,
			`${P}/settings/tags`,
			`${P}/settings/webhooks`
		];
	});

	test.afterAll(async ({ request }) => {
		if (ids.provider)
			await request.post(`/admin/oidc-providers/${ids.provider}?/deleteProvider`, {
				form: {},
				headers: { ...headers, accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
		if (ids.project)
			await request.post(`/projects/${ids.project}/settings?/deactivate`, {
				form: {},
				headers: { ...headers, accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
		if (ids.team)
			await request.post(`/teams/${ids.team}/settings?/delete`, {
				form: {},
				headers: { ...headers, accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
	});

	async function check(page: Page, mode: string, path: string) {
		await page.goto(path, { waitUntil: 'load' });
		// Some screens keep a live (SSE) connection open, so "networkidle" never arrives.
		// Auth pages have no <main>, so wait for any heading instead.
		await page.getByRole('heading').first().waitFor({ timeout: 30_000 });
		await page.waitForTimeout(800);
		if (process.env.SWEEP_SHOTS)
			await page.screenshot({
				path: `${process.env.SWEEP_SHOTS}/${mode}${path.replace(/[^a-z0-9]+/gi, '_')}.png`,
				fullPage: true
			});
		const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
		for (const v of result.violations)
			if (v.impact === 'serious' || v.impact === 'critical')
				findings.push({
					mode,
					path,
					issue: `${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')} | ${v.nodes[0]?.failureSummary?.split('\n')[1]?.trim() ?? ''}`
				});
		// axe cannot see these: content clipped by overflow-hidden, and text squeezed to a sliver.
		const layout = await page.evaluate(() => {
			const out: string[] = [];
			const name = (el: Element) =>
				el.tagName.toLowerCase() +
				(el.id ? `#${el.id}` : '') +
				(typeof el.className === 'string' && el.className.trim()
					? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
					: '');
			for (const el of document.querySelectorAll('body *')) {
				const cs = getComputedStyle(el);
				const box = el.getBoundingClientRect();
				if (cs.display === 'none' || cs.visibility === 'hidden' || !box.width || !box.height)
					continue;
				if (typeof el.className === 'string' && el.className.includes('sr-only')) continue;
				if (
					(cs.overflowX === 'hidden' || cs.overflowX === 'clip') &&
					cs.textOverflow !== 'ellipsis' &&
					el.scrollWidth > el.clientWidth + 2
				)
					out.push(`clipped ${name(el)} (${el.scrollWidth}px of ${el.clientWidth}px)`);
				const own = Array.from(el.childNodes)
					.filter((n) => n.nodeType === 3)
					.map((n) => n.textContent?.trim() ?? '')
					.filter(Boolean)
					.join(' ');
				const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
				const lines = box.height / lineHeight;
				// Text wrapped into a tall sliver, a few characters per line.
				if (own.length >= 12 && lines >= 5 && own.length / lines < 6)
					out.push(
						`sliver ${name(el)} ${Math.round(box.width)}px x${Math.round(lines)} lines "${own.slice(0, 24)}"`
					);
				// Ellipsis that leaves almost nothing readable.
				if (cs.textOverflow === 'ellipsis' && own.length >= 10 && box.width < 64)
					out.push(`cut ${name(el)} ${Math.round(box.width)}px "${own.slice(0, 24)}"`);
			}
			return out;
		});
		if (layout.length)
			findings.push({
				mode,
				path,
				issue: `layout x${layout.length}: ${layout.slice(0, 3).join(' | ')}`
			});
		// Font size does not change between the modes, so measure once.
		if (mode === 'dark-1440') {
			const small = await page.evaluate(() => {
				const out: string[] = [];
				for (const el of document.querySelectorAll('body *')) {
					if (el.closest('kbd, script, style, [aria-hidden=true], .sr-only')) continue;
					const cs = getComputedStyle(el);
					if (cs.display === 'none' || cs.visibility === 'hidden') continue;
					const own = Array.from(el.childNodes)
						.filter((n) => n.nodeType === 3)
						.map((n) => n.textContent?.trim() ?? '')
						.filter(Boolean)
						.join(' ');
					const size = parseFloat(cs.fontSize);
					// Short counters such as "+3" are allowed; real labels and values are not.
					if (own.length >= 3 && size < 12)
						out.push(`${size}px ${el.tagName.toLowerCase()} "${own.slice(0, 22)}"`);
				}
				return out;
			});
			smallText.set(path, small);
			if (small.length && SMALL_TEXT_ENFORCED.some((re) => re.test(path)))
				findings.push({
					mode,
					path,
					issue: `text under 12px x${small.length}: ${small.slice(0, 3).join(' | ')}`
				});
		}
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		if (overflow > 0) findings.push({ mode, path, issue: `horizontal overflow ${overflow}px` });
	}

	for (const mode of MODES) {
		test.describe(mode.name, () => {
			test.use({ viewport: mode.viewport, colorScheme: mode.colorScheme });
			test(`sweep ${mode.name}`, async ({ page }) => {
				test.setTimeout(900_000);
				for (const path of paths) await check(page, mode.name, path);
			});
		});
	}

	// ── Open states: dialogs, sheets, menus and popovers ──────────────────────────────────────
	const OVERLAY =
		'[role=dialog], [role=alertdialog], [role=menu], [data-slot=sheet-content], [data-slot=popover-content]';
	// Buttons that would change or remove data. The admin ones are opened explicitly below.
	const SKIP = /삭제|제거|비활성화|차단|초기화|로그아웃|완료/;
	// 200% zoom of a 1280x900 window is 640x450 CSS px, so overlays must fit that height too.
	const OVERLAY_MODES = [
		{ name: 'dark-1440', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' as const },
		{ name: 'dark-zoom200', viewport: { width: 640, height: 450 }, colorScheme: 'dark' as const }
	];

	async function settle(page: Page, path: string) {
		await page.goto(path, { waitUntil: 'load' });
		await page.getByRole('heading').first().waitFor({ timeout: 30_000 });
		await page.waitForTimeout(800);
	}

	async function inspectOverlay(page: Page, mode: string, path: string, trigger: string) {
		const add = (issue: string) => findings.push({ mode, path, issue: `[${trigger}] ${issue}` });
		const axe = await new AxeBuilder({ page })
			.include(OVERLAY)
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		for (const v of axe.violations)
			if (v.impact === 'serious' || v.impact === 'critical')
				add(
					`${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')} | ${v.nodes[0]?.failureSummary?.split('\n')[1]?.trim() ?? ''}`
				);

		const outside = await page.evaluate((sel) => {
			const out: string[] = [];
			for (const el of document.querySelectorAll(sel)) {
				const box = el.getBoundingClientRect();
				const cs = getComputedStyle(el);
				if (cs.display === 'none' || cs.visibility === 'hidden' || !box.width || !box.height)
					continue;
				if (
					box.top < -1 ||
					box.left < -1 ||
					box.bottom > innerHeight + 1 ||
					box.right > innerWidth + 1
				)
					out.push(
						`${el.getAttribute('role') ?? el.getAttribute('data-slot')} leaves the viewport: ${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)} in ${innerWidth}x${innerHeight}`
					);
			}
			return out;
		}, OVERLAY);
		for (const o of outside) add(o);

		const dialog = page
			.locator('[role=dialog], [role=alertdialog]')
			.filter({ visible: true })
			.first();
		if (await dialog.count()) {
			const focusInside = await dialog.evaluate((el) => el.contains(document.activeElement));
			if (!focusInside) add('focus did not move into the dialog');
		}
	}

	async function closeOverlay(page: Page, mode: string, path: string, trigger: string) {
		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);
		if (await page.locator(OVERLAY).filter({ visible: true }).count()) {
			findings.push({ mode, path, issue: `[${trigger}] Escape does not close the overlay` });
			await settle(page, path);
		}
	}

	// Presses each visible, non-destructive button once and inspects whatever opens.
	async function sweepButtons(page: Page, mode: string, path: string) {
		await settle(page, path);
		const names = await page.getByRole('button').evaluateAll((els) => {
			const seen = new Set<string>();
			for (const el of els) {
				if (!el.getClientRects().length || el.closest('[aria-hidden=true], [inert]')) continue;
				if ((el as HTMLButtonElement).disabled) continue;
				const name = (el.getAttribute('aria-label') || el.textContent || '')
					.replace(/\s+/g, ' ')
					.trim();
				if (name && name.length <= 60) seen.add(name);
			}
			return [...seen];
		});
		for (const name of names.slice(0, 30)) {
			if (SKIP.test(name)) continue;
			const button = page.getByRole('button', { name }).filter({ visible: true }).first();
			if (!(await button.count())) continue;
			const before = page.url();
			try {
				await button.click({ timeout: 3000 });
			} catch {
				continue;
			}
			await page.waitForTimeout(350);
			if (page.url() !== before) {
				await settle(page, path);
				continue;
			}
			if (await page.locator(OVERLAY).filter({ visible: true }).count()) {
				await inspectOverlay(page, mode, path, name);
				await closeOverlay(page, mode, path, name);
			}
		}
	}

	for (const mode of OVERLAY_MODES) {
		test.describe(`overlays ${mode.name}`, () => {
			test.use({ viewport: mode.viewport, colorScheme: mode.colorScheme });

			test(`overlays ${mode.name}`, async ({ page }) => {
				test.setTimeout(2_400_000);
				const pages = [
					'/projects',
					'/my-work',
					...paths.filter(
						(p) =>
							/^\/(projects\/\d+|teams\/\d+)/.test(p) &&
							!p.includes('/new') &&
							!p.includes('compare')
					)
				];
				// SWEEP_ONLY=<regex> narrows the run to matching paths (for a quick re-check).
				const only = process.env.SWEEP_ONLY ? new RegExp(process.env.SWEEP_ONLY) : null;
				for (const path of pages)
					if (!only || only.test(path)) await sweepButtons(page, mode.name, path);

				// Admin dialogs: only ever opened, never confirmed.
				const admin: [string, RegExp | string, string][] = [
					['/admin/users', /관리자 지정$/, 'make admin'],
					['/admin/users', /차단$/, 'ban'],
					['/admin/projects', /비활성화$/, 'deactivate project'],
					['/admin/oidc-providers', new RegExp(`${providerName} 비활성화$`), 'disable provider'],
					['/admin/oidc-providers', new RegExp(`${providerName} 삭제$`), 'delete provider'],
					[`/admin/oidc-providers/${ids.provider}`, '삭제', 'delete on provider page']
				];
				for (const [path, trigger, label] of admin) {
					if (only && !only.test(path)) continue;
					await settle(page, path);
					const button = page
						.getByRole('button', { name: trigger })
						.filter({ visible: true })
						.first();
					if (!(await button.count())) {
						findings.push({ mode: mode.name, path, issue: `[${label}] trigger not found` });
						continue;
					}
					await button.click();
					await page.waitForTimeout(400);
					await inspectOverlay(page, mode.name, path, label);
					await closeOverlay(page, mode.name, path, label);
				}
			});
		});
	}

	test('the login page too (signed out)', async ({ browser }) => {
		for (const mode of MODES) {
			const context = await browser.newContext({
				viewport: mode.viewport,
				colorScheme: mode.colorScheme,
				storageState: undefined
			});
			const page = await context.newPage();
			await check(page, mode.name, '/auth/login');
			await context.close();
		}
	});

	test('no serious findings', () => {
		const small = [...smallText]
			.filter(([, list]) => list.length)
			.sort((a, b) => b[1].length - a[1].length);
		if (small.length)
			console.log(
				`SMALL TEXT (<12px): ${small.reduce((n, [, l]) => n + l.length, 0)} elements on ${small.length} screens\n` +
					small.map(([path, list]) => `  ${String(list.length).padStart(3)}  ${path}`).join('\n')
			);
		const lines = findings.map((f) => `${f.mode}  ${f.path}\n    ${f.issue}`);
		if (lines.length) console.log(`SWEEP FINDINGS (${lines.length})\n${lines.join('\n')}`);
		expect(lines).toEqual([]);
	});
});
