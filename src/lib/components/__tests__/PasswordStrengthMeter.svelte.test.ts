import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import PasswordStrengthMeter from '../PasswordStrengthMeter.svelte';

describe('PasswordStrengthMeter', () => {
	it('shows "Very Weak" for empty password', () => {
		render(PasswordStrengthMeter, { props: { password: '' } });
		expect(screen.getByText('Very Weak')).toBeTruthy();
	});

	it('shows "Very Weak" for very short password', () => {
		render(PasswordStrengthMeter, { props: { password: 'ab' } });
		expect(screen.getByText('Very Weak')).toBeTruthy();
	});

	it('shows "Weak" for password with only lowercase >= 8 chars', () => {
		render(PasswordStrengthMeter, { props: { password: 'abcdefgh' } });
		// score: length>=8(1) + lowercase(1) = 2 -> level = floor(2*4/6) = 1
		expect(screen.getByText('Weak')).toBeTruthy();
	});

	it('shows "Fair" for password with mixed case >= 8 chars', () => {
		render(PasswordStrengthMeter, { props: { password: 'Abcdefgh' } });
		// score: length>=8(1) + uppercase(1) + lowercase(1) = 3 -> level = floor(3*4/6) = 2
		expect(screen.getByText('Fair')).toBeTruthy();
	});

	it('shows "Strong" for password with mixed case + numbers >= 8 chars', () => {
		render(PasswordStrengthMeter, { props: { password: 'Abcdef1g' } });
		// score: length>=8(1) + upper(1) + lower(1) + digit(1) = 4 -> level = floor(4*4/6) = 2
		// Actually 4*4/6 = 2.66 -> floor = 2 -> Fair
		// Need >=12 for another point
		render(PasswordStrengthMeter, { props: { password: 'Abcdefghij1k' } });
		// score: length>=8(1) + length>=12(1) + upper(1) + lower(1) + digit(1) = 5 -> floor(5*4/6) = 3
		expect(screen.getByText('Strong')).toBeTruthy();
	});

	it('shows "Very Strong" for password with all character types >= 12 chars', () => {
		render(PasswordStrengthMeter, { props: { password: 'Abcdefg1!@hi' } });
		// score: length>=8(1) + length>=12(1) + upper(1) + lower(1) + digit(1) + special(1) = 6 -> min(floor(6*4/6), 4) = 4
		expect(screen.getByText('Very Strong')).toBeTruthy();
	});

	it('renders 4 strength bar segments', () => {
		const { container } = render(PasswordStrengthMeter, {
			props: { password: '' }
		});
		const segments = container.querySelectorAll('.flex.gap-1 > div');
		expect(segments.length).toBe(4);
	});

	it('fills correct number of segments for strength level', () => {
		// Very Strong = level 4 -> all 4 segments filled with green
		const { container } = render(PasswordStrengthMeter, {
			props: { password: 'Abcdefg1!@hi' }
		});
		const segments = container.querySelectorAll('.flex.gap-1 > div');
		const filledSegments = Array.from(segments).filter(
			(seg) => !seg.className.includes('bg-muted')
		);
		expect(filledSegments.length).toBe(4);
	});

	it('uses red color for Very Weak level', () => {
		const { container } = render(PasswordStrengthMeter, {
			props: { password: '' }
		});
		const label = container.querySelector('p');
		expect(label?.className).toContain('text-red-500');
	});

	it('uses green color for Very Strong level', () => {
		const { container } = render(PasswordStrengthMeter, {
			props: { password: 'Abcdefg1!@hi' }
		});
		const label = container.querySelector('p');
		expect(label?.className).toContain('text-green-500');
	});

	it('handles special characters in strength calculation', () => {
		render(PasswordStrengthMeter, { props: { password: '!@#$%^&*' } });
		// score: length>=8(1) + special(1) = 2 -> level 1 = Weak
		expect(screen.getByText('Weak')).toBeTruthy();
	});

	it('handles digits only password', () => {
		render(PasswordStrengthMeter, { props: { password: '12345678' } });
		// score: length>=8(1) + digit(1) = 2 -> level 1 = Weak
		expect(screen.getByText('Weak')).toBeTruthy();
	});
});
