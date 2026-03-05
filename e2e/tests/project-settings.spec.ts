import { test, expect } from '../fixtures/auth.fixture';

/**
 * Project settings E2E tests.
 *
 * Uses the standard auth fixture (global-setup registers a user, saves storage
 * state to ./e2e/.auth-storage.json). The fixture reuses that state so the
 * user is already authenticated when each test begins.
 *
 * Because creating a project is a prerequisite for all settings tests, the
 * suite is run serially and shares a project URL across tests.
 */

test.describe.serial('Project Settings', () => {
	const projectName = `Settings Project ${Date.now()}`;
	const updatedName = `Updated Settings Project ${Date.now()}`;
	let projectUrl: string;
	let projectId: string;

	// -------------------------------------------------------------------------
	// Helper: derive the settings base URL once projectUrl is known
	// -------------------------------------------------------------------------

	function settingsUrl(sub = ''): string {
		// projectUrl looks like http://localhost:5173/projects/42
		return projectUrl + '/settings' + (sub ? `/${sub}` : '');
	}

	// -------------------------------------------------------------------------
	// 1. Create a project to use throughout this suite
	// -------------------------------------------------------------------------

	test('1. Create a project for settings tests', async ({ page }) => {
		await page.goto('/projects/new');

		await page.fill('#name', projectName);
		await page.fill('#description', 'Project for settings E2E tests');
		await page.click('button[type="submit"]');

		await page.waitForURL('**/projects/**', { timeout: 15000 });
		projectUrl = page.url().replace(/\/$/, '');

		// Extract numeric project ID from the URL path
		const match = projectUrl.match(/\/projects\/(\d+)/);
		expect(match).not.toBeNull();
		projectId = match![1];

		await expect(page.locator(`text=${projectName}`).first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 2. Navigate to project settings
	// -------------------------------------------------------------------------

	test('2. Should navigate to project settings page', async ({ page }) => {
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/settings`));

		// General settings card should be visible
		await expect(page.locator('input#name')).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 3. Update project name
	// -------------------------------------------------------------------------

	test('3. Should update project name', async ({ page }) => {
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');

		// Clear the name field and type the new name
		const nameInput = page.locator('input#name');
		await expect(nameInput).toBeVisible();
		await nameInput.fill('');
		await nameInput.fill(updatedName);

		// Submit the form
		await page.locator('button[type="submit"]').first().click();

		// Wait for the success toast or form to settle
		await page.waitForTimeout(2000);

		// Reload and verify the new name persisted
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');
		await expect(page.locator('input#name')).toHaveValue(updatedName);
	});

	// -------------------------------------------------------------------------
	// 4. Settings sub-navigation is visible
	// -------------------------------------------------------------------------

	test('4. Should display settings sub-navigation links', async ({ page }) => {
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');

		// The settings layout renders a side-nav with General, Members, Tags
		await expect(
			page.locator(`a[href="/projects/${projectId}/settings"]`).first()
		).toBeVisible();
		await expect(
			page.locator(`a[href="/projects/${projectId}/settings/members"]`).first()
		).toBeVisible();
		await expect(
			page.locator(`a[href="/projects/${projectId}/settings/tags"]`).first()
		).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 5. Navigate to members settings
	// -------------------------------------------------------------------------

	test('5. Should navigate to project members page', async ({ page }) => {
		await page.goto(settingsUrl('members'));
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/settings/members`));

		// Members table headers should be visible
		await expect(page.locator('th').filter({ hasText: /name/i }).first()).toBeVisible();
		await expect(page.locator('th').filter({ hasText: /email/i }).first()).toBeVisible();
		await expect(page.locator('th').filter({ hasText: /role/i }).first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 6. Current user appears in the members list
	// -------------------------------------------------------------------------

	test('6. Should see the project creator as a member', async ({ page }) => {
		await page.goto(settingsUrl('members'));
		await page.waitForLoadState('networkidle');

		// The logged-in user (global-setup created "E2E Test User") should be a member
		// with the PROJECT_ADMIN role since they created the project.
		const memberRows = page.locator('table tbody tr');
		await expect(memberRows.first()).toBeVisible({ timeout: 10000 });

		// At least one row should contain a role badge
		await expect(
			page.locator('table tbody').locator('text=/PROJECT.ADMIN|QA|DEV|VIEWER/i').first()
		).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 7. Add Member dialog can be opened
	// -------------------------------------------------------------------------

	test('7. Should be able to open the Add Member dialog', async ({ page }) => {
		await page.goto(settingsUrl('members'));
		await page.waitForLoadState('networkidle');

		// Click the "Add Member" button (renders a Dialog.Trigger)
		const addMemberBtn = page.locator('button', { hasText: /add member|add/i }).first();
		await expect(addMemberBtn).toBeVisible();
		await addMemberBtn.click();

		// Dialog should open — look for the search input inside it
		const dialogSearch = page.locator('#member-search');
		await expect(dialogSearch).toBeVisible({ timeout: 5000 });

		// Close dialog by pressing Escape
		await page.keyboard.press('Escape');
	});

	// -------------------------------------------------------------------------
	// 8. Danger zone (deactivate) section is visible
	// -------------------------------------------------------------------------

	test('8. Should display danger zone section with deactivate button', async ({ page }) => {
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');

		// The danger zone card should appear for active projects
		await expect(page.locator('button', { hasText: /deactivate/i }).first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 9. Tags settings page loads
	// -------------------------------------------------------------------------

	test('9. Should navigate to tags settings page', async ({ page }) => {
		await page.goto(settingsUrl('tags'));
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/settings/tags`));
		// Tags page should render without an error
		await expect(page.locator('body')).toBeVisible();
	});
});
