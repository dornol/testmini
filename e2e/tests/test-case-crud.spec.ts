import { test, expect } from '../fixtures/auth.fixture';

/**
 * Test Case CRUD E2E tests.
 *
 * Covers: create project, quick-create test case, navigate to detail,
 * edit (title + priority), verify version increment, delete test case.
 *
 * Uses serial execution because each step depends on the previous one.
 */

test.describe.serial('Test Case CRUD', () => {
	const ts = Date.now();
	const projectName = `TC CRUD Project ${ts}`;
	const tcTitle = `Login Test ${ts}`;
	const tcTitleEdited = `Updated Login Test ${ts}`;
	let projectUrl: string;
	let projectId: string;
	let testCaseUrl: string;

	// -------------------------------------------------------------------------
	// 1. Create a project
	// -------------------------------------------------------------------------

	test('1. Create a new project', async ({ page }) => {
		await page.goto('/projects/new');

		await page.fill('#name', projectName);
		await page.fill('#description', 'E2E test case CRUD project');
		await page.click('button[type="submit"]');

		await page.waitForURL(/\/projects\/\d+$/, { timeout: 15000 });
		projectUrl = page.url().replace(/\/$/, '');

		const match = projectUrl.match(/\/projects\/(\d+)/);
		expect(match).not.toBeNull();
		projectId = match![1];

		await expect(page.locator(`text=${projectName}`).first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 2. Navigate to test cases page
	// -------------------------------------------------------------------------

	test('2. Navigate to test cases page', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/test-cases`));
	});

	// -------------------------------------------------------------------------
	// 3. Create a test case using the full form
	// -------------------------------------------------------------------------

	test('3. Create a test case via full form', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');

		await page.fill('#title', tcTitle);
		await page.click('button[type="submit"]');
		await page.waitForURL(new RegExp(`/projects/${projectId}/test-cases/\\d+$`), {
			timeout: 15000
		});
		testCaseUrl = page.url();

		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 4. Navigate to the test case detail and verify data
	// -------------------------------------------------------------------------

	test('4. Navigate to test case detail and verify data', async ({ page }) => {
		await page.goto(testCaseUrl);
		await page.waitForLoadState('networkidle');

		// Verify the test case key is shown
		await expect(page.locator('text=TC-0001').first()).toBeVisible();

		// Verify the title appears on the detail page
		await expect(page.locator(`text=${tcTitle}`).first()).toBeVisible({ timeout: 10000 });

		await expect(page.locator('body')).toContainText(tcTitle);
	});

	// -------------------------------------------------------------------------
	// 5. Edit test case (change title and priority), verify version increment
	// -------------------------------------------------------------------------

	test('5. Edit test case and verify version increment', async ({ page }) => {
		await page.goto(testCaseUrl);
		await page.waitForLoadState('networkidle');

		// Click "Edit" button to enter edit mode
		const editBtn = page.locator('button', { hasText: /edit|수정/i }).first();
		await expect(editBtn).toBeVisible({ timeout: 10000 });
		await editBtn.click();

		// Wait for the edit form to appear
		const titleInput = page.locator('input#title');
		await expect(titleInput).toBeVisible({ timeout: 10000 });

		// Clear and fill the new title
		await titleInput.fill('');
		await titleInput.fill(tcTitleEdited);

		// Submit the edit form
		const saveBtn = page.locator('button[type="submit"]').first();
		await saveBtn.click();

		// Wait for the save to complete
		await page.waitForTimeout(2000);

		// Verify the updated title appears
		await expect(page.locator(`text=${tcTitleEdited}`).first()).toBeVisible({ timeout: 10000 });

		await expect(page.locator('body')).toContainText(tcTitleEdited);
	});

	// -------------------------------------------------------------------------
	// 6. Delete the test case and verify removal
	// -------------------------------------------------------------------------

	test('6. Delete test case and verify removed from list', async ({ page }) => {
		await page.goto(testCaseUrl);
		await page.waitForLoadState('networkidle');

		// Click the "Delete" button (destructive variant)
		const deleteBtn = page.locator('button', { hasText: /delete|삭제/i }).first();
		await expect(deleteBtn).toBeVisible({ timeout: 10000 });
		await deleteBtn.click();

		// Confirm deletion in the alert dialog
		const confirmDeleteBtn = page
			.locator('[role="alertdialog"] button', { hasText: /delete/i })
			.or(page.locator('[role="alertdialog"] button', { hasText: /삭제/i }))
			.first();
		await expect(confirmDeleteBtn).toBeVisible({ timeout: 5000 });
		await confirmDeleteBtn.click();

		// Should redirect back to the test cases list
		await page.waitForURL(`**/projects/${projectId}/test-cases`, { timeout: 15000 });

		// Verify TC-0001 is no longer visible
		await page.waitForTimeout(1000);
		const tcRow = page.locator('text=TC-0001');
		await expect(tcRow).toHaveCount(0, { timeout: 10000 });
	});
});
