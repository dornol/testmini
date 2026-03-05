import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PasswordStrengthMeter from './PasswordStrengthMeter.svelte';

describe('PasswordStrengthMeter', () => {
	it('should render without errors when password is empty', async () => {
		render(PasswordStrengthMeter, { password: '' });

		// Component root element should be present
		const label = page.getByText('Very Weak');
		await expect.element(label).toBeInTheDocument();
	});

	it('should show Very Weak label for empty password', async () => {
		render(PasswordStrengthMeter, { password: '' });

		const label = page.getByText('Very Weak');
		await expect.element(label).toBeInTheDocument();
	});

	it('should show Weak indicator for a short password', async () => {
		// "abc" — length < 8, has lowercase only: score=1 → level=0 (Very Weak)
		// Let's use a slightly longer password that scores 1: length < 8, lowercase only
		// score: lowercase ✓ = 1 → level = floor(1*4/6) = 0 → Very Weak
		// For Weak (level=1): score must be floor(s*4/6) == 1, i.e. s >= 2
		// score=2: length<8 but has upper+lower → 2 criteria → level=1 (Weak)
		render(PasswordStrengthMeter, { password: 'Abc' });

		const label = page.getByText('Weak');
		await expect.element(label).toBeInTheDocument();
	});

	it('should show Very Weak for a single-character lowercase password', async () => {
		render(PasswordStrengthMeter, { password: 'abc' });

		// score: lowercase ✓ = 1 → level = floor(1*4/6) = 0
		const label = page.getByText('Very Weak');
		await expect.element(label).toBeInTheDocument();
	});

	it('should show Strong or Very Strong indicator for a complex password', async () => {
		// "MyP@ssw0rd!123": length≥12 ✓, length≥8 ✓, uppercase ✓, lowercase ✓, digit ✓, special ✓ → score=6 → level=4
		render(PasswordStrengthMeter, { password: 'MyP@ssw0rd!123' });

		const label = page.getByText('Very Strong');
		await expect.element(label).toBeInTheDocument();
	});

	it('should show Fair for a moderately complex password', async () => {
		// score=3: length>=8 ✓, uppercase ✓, lowercase ✓ → level = floor(3*4/6) = 2 → Fair
		render(PasswordStrengthMeter, { password: 'Password' });

		const label = page.getByText('Fair');
		await expect.element(label).toBeInTheDocument();
	});

	it('should update label when password prop changes', async () => {
		const component = render(PasswordStrengthMeter, { password: '' });

		await expect.element(page.getByText('Very Weak')).toBeInTheDocument();

		// Re-render with a strong password
		component.rerender({ password: 'MyP@ssw0rd!123' });

		await expect.element(page.getByText('Very Strong')).toBeInTheDocument();
	});

	it('should render 4 strength bar segments', async () => {
		const { container } = render(PasswordStrengthMeter, { password: '' });

		// The component renders 4 segment divs inside a flex container
		const bars = container.querySelectorAll('.h-1\\.5.flex-1.rounded-full');
		expect(bars.length).toBe(4);
	});
});
