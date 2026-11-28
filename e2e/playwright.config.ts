import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const port = Number(new URL(baseURL).port || 5173);
// `build` runs the suite against the output of `pnpm build`, as CI does. Some transforms only
// happen there (see scripts/vite-paraglide-direct-imports.ts), so the dev server cannot catch
// their bugs. The default is the dev server, which needs no build while writing tests.
const useBuild = process.env.E2E_SERVER === 'build';
// .env is only a local convenience; variables that are already set take precedence over it.
const serverCommand = useBuild
	? `PORT=${port} node --env-file-if-exists=.env build/index.js`
	: 'pnpm dev';

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
		// RATE_LIMIT_MULTIPLIER: one browser session shares a single IP, so the suite would
		// otherwise exceed the per-minute API limits and fail with 429 at random.
		command: `ORIGIN=${baseURL} RATE_LIMIT_MULTIPLIER=20 ${serverCommand}`,
		port,
		// Never attach to a server that is already running when testing the build: it could be a
		// dev server or an older build.
		reuseExistingServer: !process.env.CI && !useBuild,
		cwd: '..'
	}
});
