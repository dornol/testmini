import { chromium, type FullConfig } from '@playwright/test';

const STORAGE_STATE = './e2e/.auth-storage.json';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@admin.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin1234';

async function globalSetup(_config: FullConfig) {
	const browser = await chromium.launch();
	const context = await browser.newContext();

	const response = await context.request.post(`${BASE_URL}/api/auth/sign-in/email`, {
		data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
	});
	if (!response.ok()) {
		throw new Error(`E2E admin login failed: ${response.status()} ${await response.text()}`);
	}

	await context.storageState({ path: STORAGE_STATE });
	await browser.close();
}

export default globalSetup;
