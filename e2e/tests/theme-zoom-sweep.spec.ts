import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * Sweeps the main screens in dark mode and at 200% zoom (1280px → 640 CSS px) and fails on
 * serious/critical axe findings (which include colour contrast) or horizontal overflow.
 * Slow, so it only runs with E2E_SWEEP=1 (`pnpm test:e2e:sweep`).
 * Set SWEEP_SHOTS=<dir> to also save a screenshot of every visit for manual review.
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

test.describe.serial('Dark mode and 200% zoom sweep', () => {
	test.skip(!process.env.E2E_SWEEP, 'Slow (about 5 min). Run it with `pnpm test:e2e:sweep`.');
	const key = randomUUID().slice(0, 8);
	const ids: Record<string, number> = {};
	let headers: Record<string, string>;
	let paths: string[] = [];
	const findings: Finding[] = [];

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
		const lines = findings.map((f) => `${f.mode}  ${f.path}\n    ${f.issue}`);
		if (lines.length) console.log(`SWEEP FINDINGS (${lines.length})\n${lines.join('\n')}`);
		expect(lines).toEqual([]);
	});
});
