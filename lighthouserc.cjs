/**
 * Lighthouse CI configuration.
 *
 * Run: pnpm lighthouse
 *
 * Requires a running server (pnpm preview or pnpm dev).
 * Set LHCI_BASE_URL to override the default URL.
 */
module.exports = {
	ci: {
		collect: {
			url: [
				process.env.LHCI_BASE_URL || 'http://localhost:4173',
				(process.env.LHCI_BASE_URL || 'http://localhost:4173') + '/auth/login',
			],
			numberOfRuns: 3,
			settings: {
				preset: 'desktop',
				// Skip login-required pages; focus on public pages
				chromeFlags: '--no-sandbox --disable-gpu',
			},
		},
		assert: {
			assertions: {
				// Performance
				'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
				'largest-contentful-paint': ['warn', { maxNumericValue: 3000 }],
				'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
				'total-blocking-time': ['warn', { maxNumericValue: 300 }],

				// Accessibility
				'categories:accessibility': ['warn', { minScore: 0.9 }],

				// Best Practices
				'categories:best-practices': ['warn', { minScore: 0.9 }],

				// SEO (relaxed — internal tool)
				'categories:seo': ['off'],
			},
		},
		upload: {
			target: 'filesystem',
			outputDir: '.lighthouseci',
		},
	},
};
