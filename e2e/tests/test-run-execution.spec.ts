import { test, expect } from '../fixtures/auth.fixture';

/**
 * Test Run Execution E2E tests.
 *
 * Covers: create project, create test case, create test run,
 * start the run (IN_PROGRESS), mark execution as FAIL then PASS,
 * and complete the run.
 *
 * Uses serial execution because each step depends on the previous one.
 */

test.describe.serial('Test Run Execution', () => {
	const ts = Date.now();
	const projectName = `Run Exec Project ${ts}`;
	const tcTitle = `Execution Test ${ts}`;
	const runName = `Sprint Run ${ts}`;
	let projectId: string;

	// -------------------------------------------------------------------------
	// 1. Create a project
	// -------------------------------------------------------------------------

	test('1. Create a new project', async ({ page }) => {
		await page.goto('/projects/new');

		await page.fill('#name', projectName);
		await page.fill('#description', 'E2E test run execution project');
		await page.click('button[type="submit"]');

		await page.waitForURL('**/projects/**', { timeout: 15000 });
		const url = page.url().replace(/\/$/, '');

		const match = url.match(/\/projects\/(\d+)/);
		expect(match).not.toBeNull();
		projectId = match![1];

		await expect(page.locator(`text=${projectName}`).first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 2. Create a test case
	// -------------------------------------------------------------------------

	test('2. Create a test case', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');

		await page.fill('#title', tcTitle);
		await page.fill('#precondition', 'User account exists');
		await page.fill('#expectedResult', 'User should be logged in');
		await page.click('button[type="submit"]');

		await page.waitForURL(`**/projects/${projectId}/test-cases`, { timeout: 15000 });

		// Verify TC-0001 appears
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 3. Create a test run and select the test case
	// -------------------------------------------------------------------------

	test('3. Create a test run', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-runs/new`);
		await page.waitForLoadState('networkidle');

		await page.fill('#name', runName);

		// Select the first test case checkbox
		const checkbox = page.locator('input[type="checkbox"]').first();
		if (await checkbox.isVisible({ timeout: 5000 }).catch(() => false)) {
			await checkbox.check();
		}

		await page.click('button[type="submit"]');

		// Should redirect to the run detail page
		await page.waitForURL(`**/projects/${projectId}/test-runs/**`, { timeout: 15000 });

		// Verify execution table shows TC-0001
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });

		// Verify run status is CREATED
		await expect(page.locator('text=CREATED').first()).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 4. Start the run (transition to IN_PROGRESS)
	// -------------------------------------------------------------------------

	test('4. Start the run', async ({ page }) => {
		// Navigate to the test runs list and open the run
		await page.goto(`/projects/${projectId}/test-runs`);
		await page.waitForLoadState('networkidle');

		await page.locator(`text=${runName}`).first().click();
		await page.waitForURL(`**/projects/${projectId}/test-runs/**`, { timeout: 10000 });

		// Click the "Start" button (form with action ?/updateRunStatus)
		const startForm = page.locator('form[action*="updateRunStatus"]').first();
		await expect(startForm).toBeVisible({ timeout: 10000 });
		await startForm.locator('button[type="submit"]').click();

		// Wait for status update
		await page.waitForTimeout(2000);

		// Verify the run status changed to IN_PROGRESS (shown as "IN PROGRESS")
		await expect(page.locator('text=/IN.PROGRESS/').first()).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 5. Mark execution as FAIL, verify status
	// -------------------------------------------------------------------------

	test('5. Mark execution as FAIL', async ({ page }) => {
		// Navigate to the run
		await page.goto(`/projects/${projectId}/test-runs`);
		await page.waitForLoadState('networkidle');

		await page.locator(`text=${runName}`).first().click();
		await page.waitForURL(`**/projects/${projectId}/test-runs/**`, { timeout: 10000 });

		// Click on the status badge (PENDING) to open the status dropdown
		const statusBadge = page.locator('[data-status-dropdown]').first();
		await expect(statusBadge).toBeVisible({ timeout: 10000 });
		await statusBadge.click();

		// The floating dropdown should show status options.
		// Clicking FAIL should open the failure detail dialog.
		const failOption = page.locator('button:has-text("FAIL"), [data-status="FAIL"]').last();
		await expect(failOption).toBeVisible({ timeout: 5000 });
		await failOption.click();

		// The FailureDetailDialog should open; submit it
		await page.waitForTimeout(1000);

		// Look for a submit/save button in the failure dialog
		const submitFailure = page
			.locator('[role="dialog"] button[type="submit"], [role="dialog"] button:has-text("Save"), [role="dialog"] button:has-text("OK"), [role="dialog"] button:has-text("Submit")')
			.first();
		if (await submitFailure.isVisible({ timeout: 3000 }).catch(() => false)) {
			await submitFailure.click();
		}

		await page.waitForTimeout(2000);

		// Verify FAIL status is shown
		await expect(page.locator('text=FAIL').first()).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 6. Mark execution as PASS, verify status
	// -------------------------------------------------------------------------

	test('6. Mark execution as PASS', async ({ page }) => {
		// Navigate to the run
		await page.goto(`/projects/${projectId}/test-runs`);
		await page.waitForLoadState('networkidle');

		await page.locator(`text=${runName}`).first().click();
		await page.waitForURL(`**/projects/${projectId}/test-runs/**`, { timeout: 10000 });

		// Click on the status badge to open the dropdown
		const statusBadge = page.locator('[data-status-dropdown]').first();
		await expect(statusBadge).toBeVisible({ timeout: 10000 });
		await statusBadge.click();

		// Select PASS from the dropdown
		const passOption = page.locator('button:has-text("PASS"), [data-status="PASS"]').last();
		await expect(passOption).toBeVisible({ timeout: 5000 });
		await passOption.click();

		await page.waitForTimeout(2000);

		// Verify PASS status is shown
		await expect(page.locator('text=PASS').first()).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 7. Complete the run
	// -------------------------------------------------------------------------

	test('7. Complete the run', async ({ page }) => {
		// Navigate to the run
		await page.goto(`/projects/${projectId}/test-runs`);
		await page.waitForLoadState('networkidle');

		await page.locator(`text=${runName}`).first().click();
		await page.waitForURL(`**/projects/${projectId}/test-runs/**`, { timeout: 10000 });

		// Click the "Complete" button (form with action ?/updateRunStatus)
		const completeForm = page.locator('form[action*="updateRunStatus"]').first();
		await expect(completeForm).toBeVisible({ timeout: 10000 });
		await completeForm.locator('button[type="submit"]').click();

		await page.waitForTimeout(2000);

		// Verify the run status changed to COMPLETED
		await expect(page.locator('text=COMPLETED').first()).toBeVisible({ timeout: 10000 });
	});
});
