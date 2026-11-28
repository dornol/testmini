import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { lazyZodValidators } from './form-utils';

const schema = z.object({
	name: z.string().min(1),
	description: z.string().optional()
});

describe('lazyZodValidators', () => {
	it('is a superforms zod4 client adapter', () => {
		const validators = lazyZodValidators(async () => schema);

		expect(validators.superFormValidationLibrary).toBe('zod4');
		expect(typeof validators.validate).toBe('function');
	});

	it('does not load the schema until the first validation', async () => {
		const load = vi.fn(async () => schema);
		const validators = lazyZodValidators(load);
		expect(load).not.toHaveBeenCalled();

		await validators.validate({ name: 'ok' });
		await validators.validate({ name: 'again' });
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('accepts valid data and reports issues for invalid data', async () => {
		const validators = lazyZodValidators(async () => schema);

		const valid = await validators.validate({ name: 'Case', description: 'text' });
		expect(valid.success).toBe(true);

		const invalid = await validators.validate({ name: '' });
		expect(invalid.success).toBe(false);
		expect(invalid.success === false && invalid.issues[0].path).toEqual(['name']);
	});

	it('validates concurrent calls against the same loaded schema', async () => {
		const load = vi.fn(async () => schema);
		const validators = lazyZodValidators(load);

		const results = await Promise.all([
			validators.validate({ name: '' }),
			validators.validate({ name: 'x' })
		]);

		expect(results.map((r) => r.success)).toEqual([false, true]);
		expect(load).toHaveBeenCalledTimes(1);
	});
});
