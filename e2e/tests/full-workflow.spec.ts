import { test, expect } from '../fixtures/auth.fixture';

test.describe.serial('Full Workflow: Project → TC → Run → Execute', () => {
	const projectName = `E2E Project ${Date.now()}`;
	let projectUrl: string;
	let projectId: string;
	let runUrl: string;

	test('1. Create a new project', async ({ page }) => {
		await page.goto('/projects/new');

		await page.fill('#name', projectName);
		await page.fill('#description', 'E2E test project description');
		await page.click('button[type="submit"]');

		// Should redirect to the project page
		await page.waitForURL('**/projects/**', { timeout: 15000 });
		projectUrl = page.url();
		const match = projectUrl.match(/\/projects\/(\d+)/);
		expect(match).not.toBeNull();
		projectId = match![1];

		// Verify project name appears
		await expect(page.locator('text=' + projectName).first()).toBeVisible();
	});

	test('2. Create a test case', async ({ page }) => {
		// Navigate to test cases from project
		await page.goto(projectUrl);

		// Find and click "test cases" navigation
		const testCasesLink = page.locator('a[href*="test-cases"]').first();
		await testCasesLink.click();
		await page.waitForURL('**/test-cases', { timeout: 10000 });

		// Click create test case button
		const createLink = page.locator('a[href*="test-cases/new"]').first();
		await createLink.click();
		await page.waitForURL('**/test-cases/new', { timeout: 10000 });

		// Fill in test case form
		await page.fill('#title', 'Login Functionality Test');
		await page.fill('#precondition', 'User account exists');
		await page.fill('#expectedResult', 'User should be logged in');

		await page.click('button[type="submit"]');

		await page.waitForURL(/\/test-cases\/\d+$/, { timeout: 15000 });
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });
	});

	test('3. Create a test run', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-runs/new`);
		await page.waitForLoadState('networkidle');
		await page.fill('#name', 'Sprint 1 E2E Run');
		await page.locator('input[type="checkbox"]:visible').first().check();
		await page.click('button[type="submit"]');
		await page.waitForURL(/\/test-runs\/\d+$/, { timeout: 15000 });
		runUrl = page.url();

		// Verify run page loaded with execution table
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });
	});

	test('4. Execute test - mark as PASS', async ({ page }) => {
		await page.goto(runUrl);

		// Start the run first (click the Start Run button)
		const startBtn = page.locator('button:has-text("Start"), button[type="submit"]').first();
		if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			// Look for form with start run action
			const startForm = page.locator('form[action*="updateRunStatus"]').first();
			if (await startForm.isVisible({ timeout: 2000 }).catch(() => false)) {
				await startForm.locator('button[type="submit"]').click();
				await page.waitForTimeout(1000);
			}
		}

		const statusButton = page.locator('[data-status-dropdown]:visible').first();
		await expect(statusButton).toBeVisible({ timeout: 10000 });
		await statusButton.click();

		const passBtn = page.getByRole('menuitem', { name: 'PASS', exact: true });
		await expect(passBtn).toBeVisible({ timeout: 10000 });
		await passBtn.evaluate((element) => (element as HTMLElement).click());

		// Wait for the status to update
		await page.waitForTimeout(2000);
	});

	test('5. Verify test results', async ({ page }) => {
		await page.goto(runUrl);
		await page.waitForLoadState('domcontentloaded');

		// Verify PASS status is shown somewhere in the execution table
		await expect(
			page.locator('[data-status-dropdown]:visible').filter({ hasText: 'PASS' }).first()
		).toBeVisible({
			timeout: 10000
		});
	});
});
