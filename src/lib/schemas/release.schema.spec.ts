import { describe, it, expect } from 'vitest';
import { createReleaseSchema, updateReleaseSchema } from './release.schema';

describe('release.schema', () => {
	describe('createReleaseSchema', () => {
		it('accepts valid release dates', () => {
			const result = createReleaseSchema.safeParse({
				name: 'v1.0.0',
				targetDate: '2026-01-01',
				releaseDate: '2026-01-31'
			});

			expect(result.success).toBe(true);
		});

		it('rejects whitespace-only names', () => {
			const result = createReleaseSchema.safeParse({ name: '   ' });

			expect(result.success).toBe(false);
		});

		it('trims release text fields before returning parsed data', () => {
			const result = createReleaseSchema.parse({
				name: '  v1.0.0  ',
				version: '  1.0.0  ',
				description: '  First stable release  '
			});

			expect(result).toMatchObject({
				name: 'v1.0.0',
				version: '1.0.0',
				description: 'First stable release'
			});
		});

		it('accepts empty release date strings for backwards-compatible null conversion', () => {
			const result = createReleaseSchema.safeParse({
				name: 'v1.0.0',
				targetDate: '',
				releaseDate: ''
			});

			expect(result.success).toBe(true);
		});

		it('rejects invalid release dates', () => {
			const result = createReleaseSchema.safeParse({
				name: 'v1.0.0',
				targetDate: 'not-a-date'
			});

			expect(result.success).toBe(false);
		});
	});

	describe('updateReleaseSchema', () => {
		it('accepts null release dates', () => {
			const result = updateReleaseSchema.safeParse({
				targetDate: null,
				releaseDate: null
			});

			expect(result.success).toBe(true);
		});

		it('rejects whitespace-only names when provided', () => {
			const result = updateReleaseSchema.safeParse({ name: '   ' });

			expect(result.success).toBe(false);
		});

		it('trims update release text fields before returning parsed data', () => {
			const result = updateReleaseSchema.parse({
				name: '  v1.1.0  ',
				version: '  1.1.0  ',
				description: '  Patch release  '
			});

			expect(result).toEqual({
				name: 'v1.1.0',
				version: '1.1.0',
				description: 'Patch release'
			});
		});

		it('rejects invalid update release dates', () => {
			const result = updateReleaseSchema.safeParse({
				releaseDate: 'not-a-date'
			});

			expect(result.success).toBe(false);
		});
	});
});
