import { chromium, type FullConfig } from '@playwright/test';

const STORAGE_STATE = './e2e/.auth-storage.json';

async function globalSetup(_config: FullConfig) {
	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();

	// Register a test user via the UI
	await page.goto('http://localhost:5173/auth/register');

	await page.fill('#name', 'E2E Test User');
	await page.fill('#email', `e2e-${Date.now()}@test.com`);
	await page.fill('#password', 'TestPassword123!');
	await page.fill('#passwordConfirm', 'TestPassword123!');
	await page.click('button[type="submit"]');

	// Wait for redirect to /projects after successful registration
	await page.waitForURL('**/projects', { timeout: 15000 });

	// Save signed-in state
	await context.storageState({ path: STORAGE_STATE });
	await browser.close();
}

export default globalSetup;
