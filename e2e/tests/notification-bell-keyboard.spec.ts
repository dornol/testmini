import { test, expect } from '../fixtures/auth.fixture';

// The bell panel is declared as a dialog, so it must behave like one for keyboard users.
test.describe('Notification bell keyboard behaviour', () => {
	test('opens with the keyboard, takes focus, and Escape closes it and gives focus back', async ({
		page
	}) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');
		const bell = page.getByRole('button', { name: '알림', exact: true });
		await expect(bell).toHaveAttribute('aria-haspopup', 'dialog');

		await bell.focus();
		await page.keyboard.press('Enter');
		const panel = page.getByRole('dialog', { name: /알림/ });
		await expect(panel).toBeVisible();
		await expect(bell).toHaveAttribute('aria-expanded', 'true');
		await expect(panel).toBeFocused();
		// Clicking outside closes it, so it must not announce itself as modal.
		await expect(panel).not.toHaveAttribute('aria-modal', 'true');

		await page.keyboard.press('Escape');
		await expect(panel).toBeHidden();
		await expect(bell).toHaveAttribute('aria-expanded', 'false');
		await expect(bell).toBeFocused();
	});

	test('Escape also closes it when focus is still on the bell', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');
		const bell = page.getByRole('button', { name: '알림', exact: true });
		await bell.click();
		const panel = page.getByRole('dialog', { name: /알림/ });
		await expect(panel).toBeVisible();

		await bell.focus(); // as if the user shift-tabbed back to the trigger
		await page.keyboard.press('Escape');
		await expect(panel).toBeHidden();
		await expect(bell).toBeFocused();
	});
});
