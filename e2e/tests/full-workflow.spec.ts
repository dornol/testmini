import { test, expect } from '../fixtures/auth.fixture';

test.describe.serial('Full Workflow: Project → TC → Run → Execute', () => {
	const projectName = `E2E Project ${Date.now()}`;
	let projectUrl: string;

	test('1. Create a new project', async ({ page }) => {
		await page.goto('/projects/new');

		await page.fill('#name', projectName);
		await page.fill('#description', 'E2E test project description');
		await page.click('button[type="submit"]');

		// Should redirect to the project page
		await page.waitForURL('**/projects/**', { timeout: 15000 });
		projectUrl = page.url();

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

		// Should redirect back to test cases list
		await page.waitForURL('**/test-cases', { timeout: 15000 });

		// Verify test case with key TC-0001 appears
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });
	});

	test('3. Create a test run', async ({ page }) => {
		// Navigate to test runs
		const testRunsUrl = projectUrl.replace(/\/[^/]*$/, '') + '/test-runs';
		await page.goto(testRunsUrl.replace(/\/+$/, ''));

		// Wait for the page, then find create run button
		const createLink = page.locator('a[href*="test-runs/new"]').first();
		await createLink.click();
		await page.waitForURL('**/test-runs/new', { timeout: 10000 });

		// Fill in run details
		await page.fill('#name', 'Sprint 1 E2E Run');

		// Select environment (find the environment select trigger and pick QA)
		const envSelect = page.locator('#environment');
		if (await envSelect.isVisible()) {
			await envSelect.selectOption('QA');
		} else {
			// Custom select component - click trigger and select QA
			const envTrigger = page.locator('button[id*="environment"], [data-value]').first();
			await envTrigger.click();
			await page.locator('text=QA').click();
		}

		// Select the test case checkbox
		const checkbox = page.locator('input[type="checkbox"]').first();
		await checkbox.check();

		await page.click('button[type="submit"]');

		// Should redirect to the run page
		await page.waitForURL('**/test-runs/**', { timeout: 15000 });

		// Verify run page loaded with execution table
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });
	});

	test('4. Execute test - mark as PASS', async ({ page }) => {
		// Navigate back to the run (in serial mode, we track via project URL)
		const testRunsUrl = projectUrl.replace(/\/[^/]*$/, '') + '/test-runs';
		await page.goto(testRunsUrl.replace(/\/+$/, ''));

		// Click on the first run to open it
		const runRow = page.locator('text=Sprint 1 E2E Run').first();
		await runRow.click();
		await page.waitForURL('**/test-runs/**', { timeout: 10000 });

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

		// Click PASS button for the execution
		const passBtn = page.locator('button:has-text("PASS")').first();
		await expect(passBtn).toBeVisible({ timeout: 10000 });
		await passBtn.click();

		// Wait for the status to update
		await page.waitForTimeout(2000);
	});

	test('5. Verify test results', async ({ page }) => {
		// Navigate to test runs list
		const testRunsUrl = projectUrl.replace(/\/[^/]*$/, '') + '/test-runs';
		await page.goto(testRunsUrl.replace(/\/+$/, ''));
		await page.waitForLoadState('networkidle');

		// Verify run is visible
		await expect(page.locator('text=Sprint 1 E2E Run').first()).toBeVisible({ timeout: 10000 });

		// Click to open the run
		await page.locator('text=Sprint 1 E2E Run').first().click();
		await page.waitForURL('**/test-runs/**', { timeout: 10000 });

		// Verify PASS status is shown somewhere in the execution table
		await expect(page.locator('text=PASS').first()).toBeVisible({ timeout: 10000 });
	});
});
