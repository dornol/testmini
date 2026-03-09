import { test, expect } from '../fixtures/auth.fixture';
import path from 'path';
import fs from 'fs';

/**
 * Import/Export E2E tests.
 *
 * Covers: create project, create test cases, export CSV (verify download),
 * and import a CSV file with test case data.
 *
 * Uses serial execution because each step depends on the previous one.
 */

test.describe.serial('Import / Export', () => {
	const ts = Date.now();
	const projectName = `Import Export Project ${ts}`;
	let projectId: string;

	// -------------------------------------------------------------------------
	// 1. Create a project
	// -------------------------------------------------------------------------

	test('1. Create a project for import/export tests', async ({ page }) => {
		await page.goto('/projects/new');

		await page.fill('#name', projectName);
		await page.fill('#description', 'E2E import/export project');
		await page.click('button[type="submit"]');

		await page.waitForURL('**/projects/**', { timeout: 15000 });
		const url = page.url().replace(/\/$/, '');

		const match = url.match(/\/projects\/(\d+)/);
		expect(match).not.toBeNull();
		projectId = match![1];

		await expect(page.locator(`text=${projectName}`).first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 2. Create a test case so there is data to export
	// -------------------------------------------------------------------------

	test('2. Create a test case via the full form', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');

		await page.fill('#title', `Export Test Case ${ts}`);
		await page.fill('#precondition', 'System is running');
		await page.fill('#expectedResult', 'Data exported correctly');
		await page.click('button[type="submit"]');

		await page.waitForURL(`**/projects/${projectId}/test-cases`, { timeout: 15000 });

		// Verify TC-0001 appears
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 3. Export CSV and verify download
	// -------------------------------------------------------------------------

	test('3. Export CSV and verify download', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');

		// Open the export dropdown menu
		const exportTrigger = page.locator('button', { hasText: /export/i }).first();
		await expect(exportTrigger).toBeVisible({ timeout: 10000 });
		await exportTrigger.click();

		// Listen for the download event before clicking CSV export
		const downloadPromise = page.waitForEvent('download', { timeout: 15000 });

		// Click the "CSV" export option
		const csvOption = page.locator('[role="menuitem"]', { hasText: /csv/i }).first();
		await expect(csvOption).toBeVisible({ timeout: 5000 });
		await csvOption.click();

		// Wait for the download to start
		const download = await downloadPromise;

		// Verify the downloaded file name
		const filename = download.suggestedFilename();
		expect(filename).toMatch(/\.csv$/);

		// Save the file temporarily and verify it has content
		const tempPath = path.join('/tmp', `e2e-export-${ts}.csv`);
		await download.saveAs(tempPath);

		const content = fs.readFileSync(tempPath, 'utf-8');
		expect(content.length).toBeGreaterThan(0);

		// Verify the CSV contains the test case title
		expect(content).toContain(`Export Test Case ${ts}`);

		// Clean up
		fs.unlinkSync(tempPath);
	});

	// -------------------------------------------------------------------------
	// 4. Import a CSV file with test case data
	// -------------------------------------------------------------------------

	test('4. Import a CSV file', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');

		// Create a temporary CSV file for import
		const csvContent = [
			'title,priority,precondition,expectedResult',
			`"Imported TC 1 ${ts}","HIGH","Pre-condition 1","Expected result 1"`,
			`"Imported TC 2 ${ts}","LOW","Pre-condition 2","Expected result 2"`
		].join('\n');

		const csvPath = path.join('/tmp', `e2e-import-${ts}.csv`);
		fs.writeFileSync(csvPath, csvContent, 'utf-8');

		// Click the "Import" button to open the import dialog
		const importBtn = page.locator('button', { hasText: /import/i }).first();
		await expect(importBtn).toBeVisible({ timeout: 10000 });
		await importBtn.click();

		// Wait for the import dialog to appear
		const dialog = page.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// Upload the CSV file using the file input
		const fileInput = dialog.locator('input[type="file"]');
		await fileInput.setInputFiles(csvPath);

		// Wait for the preview to load
		await page.waitForTimeout(1000);

		// Click the import/upload button inside the dialog
		const doImportBtn = dialog.locator('button', { hasText: /import|upload/i }).first();
		await expect(doImportBtn).toBeVisible({ timeout: 5000 });
		await doImportBtn.click();

		// Wait for import to complete
		await page.waitForTimeout(3000);

		// Close the dialog if it is still open
		const closeBtn = dialog.locator('button', { hasText: /close/i });
		if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
			await closeBtn.click();
		}

		// Reload and verify the imported test cases appear
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');

		// Check that new test cases were created (TC-0002 and TC-0003)
		await expect(page.locator('text=TC-0002').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=TC-0003').first()).toBeVisible({ timeout: 10000 });

		// Clean up temp file
		fs.unlinkSync(csvPath);
	});
});
