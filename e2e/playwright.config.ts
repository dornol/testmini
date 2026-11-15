import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
	testDir: './tests',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: 'html',
	// Keep one reviewed baseline per scenario. The ratio tolerance in each test
	// absorbs minor font rasterization differences across developer and CI hosts.
	snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
	use: {
		baseURL,
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	globalSetup: './global-setup.ts',
	webServer: {
		// Better Auth validates the request origin against ORIGIN. Override a
		// developer's local .env value so the isolated E2E server always matches
		// Playwright's configured base URL (including custom CI URLs).
		command: `ORIGIN=${baseURL} pnpm dev`,
		port: 5173,
		reuseExistingServer: !process.env.CI,
		cwd: '..'
	}
});
