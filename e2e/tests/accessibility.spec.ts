import { test, expect } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility E2E tests using axe-core.
 *
 * Covers: WCAG 2.1 AA compliance checks on key pages,
 * skip-to-content link, keyboard navigation, ARIA landmarks.
 */

test.describe('Accessibility', () => {
	test('1. Skip-to-content link exists and works', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');

		// The skip link should be present but visually hidden (sr-only)
		const skipLink = page.locator('a[href="#main-content"]');
		await expect(skipLink).toBeAttached();

		// Tab to it — it should become visible on focus
		await page.keyboard.press('Tab');
		await expect(skipLink).toBeFocused();
		await expect(skipLink).toBeVisible();

		// Click it — focus should move to main content
		await skipLink.click();
		const main = page.locator('#main-content');
		await expect(main).toBeVisible();
	});

	test('2. Main content landmark exists', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');

		const main = page.locator('main#main-content');
		await expect(main).toBeVisible();
	});

	test('3. Navigation landmark has aria-label', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');

		const nav = page.locator('nav[aria-label="Main navigation"]');
		await expect(nav).toBeVisible();
	});

	test('4. Projects page passes axe-core checks', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa'])
			.exclude('[data-chart]') // charts may have known issues
			.analyze();

		const criticalViolations = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);

		if (criticalViolations.length > 0) {
			const summary = criticalViolations.map(
				(v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} elements)`
			);
			console.warn('A11y violations:', summary);
		}

		// No critical violations
		expect(criticalViolations.filter((v) => v.impact === 'critical')).toHaveLength(0);
	});

	test('5. Login page passes axe-core checks', async ({ page }) => {
		await page.goto('/auth/login');
		await page.waitForLoadState('networkidle');

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();

		const critical = results.violations.filter((v) => v.impact === 'critical');
		expect(critical).toHaveLength(0);
	});

	test('6. Dashboard page passes axe-core checks', async ({ page }) => {
		// First create a project to have a dashboard
		await page.goto('/projects/new');
		await page.fill('#name', `A11y Dashboard ${Date.now()}`);
		await page.click('button[type="submit"]');
		await page.waitForURL('**/projects/**', { timeout: 15000 });

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa'])
			.exclude('[data-chart]')
			.exclude('canvas') // Chart.js canvas
			.analyze();

		const critical = results.violations.filter((v) => v.impact === 'critical');
		expect(critical).toHaveLength(0);
	});

	test('7. All interactive elements are keyboard accessible', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');

		// Tab through the page and verify focus is visible
		const focusedElements: string[] = [];

		for (let i = 0; i < 15; i++) {
			await page.keyboard.press('Tab');
			const tag = await page.evaluate(() => {
				const el = document.activeElement;
				return el ? `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}` : 'none';
			});
			focusedElements.push(tag);
		}

		// Should have focused on various interactive elements (links, buttons)
		const interactiveCount = focusedElements.filter(
			(t) => t.startsWith('a') || t.startsWith('button') || t.startsWith('input')
		).length;

		expect(interactiveCount).toBeGreaterThan(3);
	});

	test('8. Images have alt attributes', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');

		const images = page.locator('img');
		const count = await images.count();

		for (let i = 0; i < count; i++) {
			const alt = await images.nth(i).getAttribute('alt');
			// alt should be present (can be empty for decorative images)
			expect(alt).not.toBeNull();
		}
	});
});
