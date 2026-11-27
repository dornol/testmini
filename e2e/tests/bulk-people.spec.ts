import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * Member and team lists with many entries.
 *
 * Project members, team members and the team directory have no pagination, so every entry
 * must stay reachable and the layout must hold on a phone and on a desktop.
 */
test.describe.serial('Member and team lists with many entries', () => {
	const COUNT = 60;
	const key = randomUUID().slice(0, 8);
	const password = randomUUID();
	const personName = (i: number) => `BulkPerson${key}-${String(i).padStart(2, '0')}`;
	const teamName = (i: number) => `BulkTeam${key}-${String(i).padStart(2, '0')}`;
	const userIds: string[] = [];
	const teamIds: number[] = [];
	let projectId: number;
	let membersTeamId: number;

	const formHeaders = (baseURL: string) => ({
		origin: baseURL,
		accept: 'application/json',
		'x-sveltekit-action': 'true'
	});

	async function inChunks<T>(items: T[], run: (item: T) => Promise<void>) {
		for (let i = 0; i < items.length; i += 6)
			await Promise.all(items.slice(i, i + 6).map((item) => run(item)));
	}

	test.beforeAll(async ({ request, baseURL }) => {
		test.setTimeout(240_000);
		const indexes = Array.from({ length: COUNT }, (_, i) => i);
		const project = await request.post('/api/projects', { data: { name: `BulkPeople ${key}` } });
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;

		const createTeam = async (name: string) => {
			const response = await request.post('/teams/new', {
				form: { name, description: 'Bulk list fixture' },
				headers: formHeaders(baseURL!)
			});
			const result = await response.json();
			expect(result.type, name).toBe('redirect');
			const id = Number(result.location.split('/').at(-1));
			teamIds.push(id);
			return id;
		};
		membersTeamId = await createTeam(`BulkTeamMembers ${key}`);
		await inChunks(indexes, async (i) => {
			await createTeam(teamName(i));
		});

		await inChunks(indexes, async (i) => {
			const created = await request.post('/api/auth/admin/create-user', {
				data: {
					email: `bulk-person-${key}-${i}@example.com`,
					password,
					name: personName(i),
					role: 'user'
				},
				headers: { origin: baseURL! }
			});
			expect(created.ok(), `user ${i}`).toBe(true);
			const id = (await created.json()).user.id as string;
			userIds.push(id);
			const project = await request.post(`/projects/${projectId}/settings/members?/addMember`, {
				form: { userId: id, role: i % 2 ? 'QA' : 'DEV' },
				headers: formHeaders(baseURL!)
			});
			expect((await project.json()).type, `project member ${i}`).toBe('success');
			const team = await request.post(`/teams/${membersTeamId}/settings/members?/addMember`, {
				form: { userId: id, role: 'MEMBER' },
				headers: formHeaders(baseURL!)
			});
			expect((await team.json()).type, `team member ${i}`).toBe('success');
		});
	});

	test.afterAll(async ({ request, baseURL }) => {
		for (const id of teamIds)
			await request.post(`/teams/${id}/settings?/delete`, {
				form: {},
				headers: formHeaders(baseURL!)
			});
		if (projectId) await request.delete(`/api/projects/${projectId}`);
		for (const id of userIds)
			await request.post('/api/auth/admin/remove-user', {
				data: { userId: id },
				headers: { origin: baseURL! }
			});
	});

	const lists = () => [
		{
			name: 'team directory',
			url: `/teams?search=BulkTeam${key}-`,
			item: new RegExp(`^BulkTeam${key}-\\d{2}$`)
		},
		{
			name: 'project members',
			url: `/projects/${projectId}/settings/members`,
			item: new RegExp(`^BulkPerson${key}-\\d{2}$`)
		},
		{
			name: 'team members',
			url: `/teams/${membersTeamId}/settings/members`,
			item: new RegExp(`^BulkPerson${key}-\\d{2}$`)
		}
	];

	for (const width of [375, 1440])
		for (const index of [0, 1, 2])
			test(`list ${index + 1} at ${width}px: all ${COUNT} entries are reachable and the layout holds`, async ({
				page
			}) => {
				const { url, item } = lists()[index];
				await page.setViewportSize({ width, height: 850 });
				const started = Date.now();
				await page.goto(url);
				const main = page.getByRole('main');
				await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
				const entries = main.getByText(item).filter({ visible: true });
				await expect.poll(() => entries.count()).toBe(COUNT);
				const elapsed = Date.now() - started;
				test.info().annotations.push({ type: 'render-ms', description: String(elapsed) });
				expect(elapsed, 'time until every entry is rendered').toBeLessThan(4000);
				expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
				const last = entries.last();
				await last.scrollIntoViewIfNeeded();
				await expect(last).toBeInViewport();
				const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
				expect(
					audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
				).toEqual([]);
			});
});
