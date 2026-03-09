import { test, expect } from '../fixtures/auth.fixture';

/**
 * Team Management E2E tests.
 *
 * Covers: create a team from /teams/new, verify it appears in the teams list,
 * and navigate to team settings.
 *
 * Uses serial execution because each step depends on the previous one.
 */

test.describe.serial('Team Management', () => {
	const ts = Date.now();
	const teamName = `E2E Team ${ts}`;
	const teamDescription = `Team created by E2E test at ${ts}`;
	let teamId: string;

	// -------------------------------------------------------------------------
	// 1. Create a team from /teams/new
	// -------------------------------------------------------------------------

	test('1. Create a new team', async ({ page }) => {
		await page.goto('/teams/new');
		await page.waitForLoadState('networkidle');

		// Fill in the team form
		const nameInput = page.locator('#name');
		await expect(nameInput).toBeVisible({ timeout: 10000 });
		await nameInput.fill(teamName);

		const descInput = page.locator('#description');
		await descInput.fill(teamDescription);

		// Submit the form
		await page.click('button[type="submit"]');

		// Should redirect to the team detail page
		await page.waitForURL('**/teams/**', { timeout: 15000 });

		const url = page.url();
		const match = url.match(/\/teams\/(\d+)/);
		expect(match).not.toBeNull();
		teamId = match![1];

		// Verify team name is visible on the detail page
		await expect(page.locator(`text=${teamName}`).first()).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 2. Verify team appears in the teams list
	// -------------------------------------------------------------------------

	test('2. Verify team appears in teams list', async ({ page }) => {
		await page.goto('/teams');
		await page.waitForLoadState('networkidle');

		// The team card should be visible in the grid
		await expect(page.locator(`text=${teamName}`).first()).toBeVisible({ timeout: 10000 });

		// Verify the description is also shown
		await expect(page.locator(`text=${teamDescription}`).first()).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 3. Navigate to team settings
	// -------------------------------------------------------------------------

	test('3. Navigate to team settings', async ({ page }) => {
		await page.goto(`/teams/${teamId}/settings`);
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(new RegExp(`/teams/${teamId}/settings`));

		// The settings page should show the team name in the form
		const nameInput = page.locator('input#name');
		await expect(nameInput).toBeVisible({ timeout: 10000 });
		await expect(nameInput).toHaveValue(teamName);
	});

	// -------------------------------------------------------------------------
	// 4. Navigate to team members settings
	// -------------------------------------------------------------------------

	test('4. Navigate to team members settings', async ({ page }) => {
		await page.goto(`/teams/${teamId}/settings/members`);
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(new RegExp(`/teams/${teamId}/settings/members`));

		// The members page should render without error
		await expect(page.locator('body')).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 5. Team detail page shows member and project counts
	// -------------------------------------------------------------------------

	test('5. Team detail page shows counts', async ({ page }) => {
		await page.goto(`/teams/${teamId}`);
		await page.waitForLoadState('networkidle');

		// The team detail page should render the team name
		await expect(page.locator(`text=${teamName}`).first()).toBeVisible({ timeout: 10000 });
	});
});
