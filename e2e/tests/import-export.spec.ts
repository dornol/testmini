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
	let firstTestCaseId: string;

	// -------------------------------------------------------------------------
	// 1. Create a project
	// -------------------------------------------------------------------------

	test('1. Create a project for import/export tests', async ({ page }) => {
		await page.goto('/projects/new');

		await page.fill('#name', projectName);
		await page.fill('#description', 'E2E import/export project');
		await page.click('button[type="submit"]');

		await page.waitForURL(/\/projects\/\d+$/, { timeout: 15000 });
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

		await page.waitForURL(new RegExp(`/projects/${projectId}/test-cases/\\d+$`), {
			timeout: 15000
		});
		const match = page.url().match(/\/test-cases\/(\d+)$/);
		expect(match).not.toBeNull();
		firstTestCaseId = match![1];
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 3. Export CSV and verify download
	// -------------------------------------------------------------------------

	test('3. Export CSV and verify download', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');

		const response = await page.request.get(
			`/api/projects/${projectId}/test-cases/export?format=csv`
		);
		expect(response.ok()).toBeTruthy();
		expect(response.headers()['content-type']).toContain('text/csv');

		const tempPath = path.join('/tmp', `e2e-export-${ts}.csv`);
		const content = await response.text();
		fs.writeFileSync(tempPath, content, 'utf-8');
		expect(content.length).toBeGreaterThan(0);

		// Verify the CSV contains the test case title
		expect(content).toContain(`Export Test Case ${ts}`);

		fs.unlinkSync(tempPath);
	});

	// -------------------------------------------------------------------------
	// 4. Import a CSV file with test case data
	// -------------------------------------------------------------------------

	test('4. Import a CSV file', async ({ page, baseURL }) => {
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

		const response = await page.request.post(`/api/projects/${projectId}/test-cases/import`, {
			multipart: {
				file: {
					name: `e2e-import-${ts}.csv`,
					mimeType: 'text/csv',
					buffer: Buffer.from(csvContent)
				}
			},
			// A production build rejects a multipart POST that carries no Origin header.
			headers: { origin: baseURL! }
		});
		expect(response.ok()).toBeTruthy();
		const result = await response.json();
		expect(result.imported).toBeGreaterThanOrEqual(2);

		// Reload and verify the imported test cases appear
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');

		// Check that new test cases were created (TC-0002 and TC-0003)
		await expect(page.locator('text=TC-0002').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=TC-0003').first()).toBeVisible({ timeout: 10000 });

		// Clean up temp file
		fs.unlinkSync(csvPath);
	});

	// -------------------------------------------------------------------------
	// 5. Export selected CSV and verify only selected cases are included
	// -------------------------------------------------------------------------

	test('5. Export selected CSV and verify scope', async ({ page }) => {
		const response = await page.request.get(
			`/api/projects/${projectId}/test-cases/export?format=csv&ids=${firstTestCaseId}`
		);
		expect(response.ok()).toBeTruthy();
		expect(response.headers()['content-type']).toContain('text/csv');

		const content = await response.text();
		expect(content).toContain(`Export Test Case ${ts}`);
		expect(content).not.toContain(`Imported TC 1 ${ts}`);
		expect(content).not.toContain(`Imported TC 2 ${ts}`);
	});
});
