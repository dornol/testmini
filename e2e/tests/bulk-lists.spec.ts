import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * Settings lists with many items.
 *
 * These lists have no pagination, so every item must stay reachable and the page must keep
 * its layout and stay usable. The seeded names are long enough to wrap on a phone.
 */
test.describe.serial('Settings lists with many items', () => {
	const COUNT = 120;
	let projectId: number;
	const key = Date.now().toString(36);
	const lists = [
		{ path: 'tags', prefix: 'BulkTag' },
		{ path: 'priorities', prefix: 'BulkPriority' },
		{ path: 'environments', prefix: 'BulkEnv' },
		{ path: 'custom-fields', prefix: 'BulkField' }
	];
	const name = (prefix: string, i: number) => `${prefix}${key}-${String(i).padStart(3, '0')}-label`;

	async function inChunks<T>(items: T[], run: (item: T) => Promise<void>) {
		for (let i = 0; i < items.length; i += 10)
			await Promise.all(items.slice(i, i + 10).map((item) => run(item)));
	}

	test.beforeAll(async ({ request, baseURL }) => {
		test.setTimeout(180_000);
		const project = await request.post('/api/projects', { data: { name: `Bulk ${key}` } });
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
		const indexes = Array.from({ length: COUNT }, (_, i) => i);
		const action = (path: string, form: Record<string, string>) =>
			request.post(`/projects/${projectId}/settings/${path}?/create`, {
				form,
				headers: { 'x-sveltekit-action': 'true', accept: 'application/json', origin: baseURL! }
			});

		await inChunks(indexes, async (i) => {
			const tag = await action('tags', { name: name('BulkTag', i), color: '#3b82f6' });
			expect((await tag.json()).type, `tag ${i}`).toBe('success');
		});
		await inChunks(indexes, async (i) => {
			const priority = await action('priorities', {
				name: name('BulkPriority', i),
				color: '#ef4444'
			});
			expect((await priority.json()).type, `priority ${i}`).toBe('success');
		});
		await inChunks(indexes, async (i) => {
			const environment = await action('environments', {
				name: name('BulkEnv', i),
				color: '#22c55e'
			});
			expect((await environment.json()).type, `environment ${i}`).toBe('success');
		});
		await inChunks(indexes, async (i) => {
			const field = await request.post(`/api/projects/${projectId}/custom-fields`, {
				data: { name: name('BulkField', i), fieldType: 'TEXT' },
				headers: { origin: baseURL! }
			});
			expect(field.ok(), `custom field ${i}: ${field.status()}`).toBe(true);
		});
	});

	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	for (const { path, prefix } of lists)
		for (const width of [375, 1440])
			test(`${path} at ${width}px: all ${COUNT} items are reachable and the layout holds`, async ({
				page
			}) => {
				await page.setViewportSize({ width, height: 850 });
				const started = Date.now();
				await page.goto(`/projects/${projectId}/settings/${path}`);
				const main = page.getByRole('main');
				await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
				const items = main.getByText(new RegExp(`^${prefix}${key}-\\d{3}-label$`));
				await expect.poll(() => items.filter({ visible: true }).count()).toBe(COUNT);
				const elapsed = Date.now() - started;
				test.info().annotations.push({ type: 'render-ms', description: String(elapsed) });
				expect(elapsed, 'time until every item is rendered').toBeLessThan(4000);
				expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
				// The last item must be reachable by scrolling, not cut off by a fixed height.
				const last = items.filter({ visible: true }).last();
				await last.scrollIntoViewIfNeeded();
				await expect(last).toBeInViewport();
				const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
				expect(
					audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
				).toEqual([]);
			});
});
