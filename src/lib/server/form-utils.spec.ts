import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodAdapter, validateForm, emptyForm } from './form-utils';

const testSchema = z.object({
	name: z.string().min(1)
});

describe('server form-utils', () => {
	// ── zodAdapter ──────────────────────────────────────

	describe('zodAdapter', () => {
		it('should return an adapter object', () => {
			const adapter = zodAdapter(testSchema);

			expect(adapter).toBeDefined();
			expect(adapter).not.toBeNull();
		});

		it('should return an object (not a primitive)', () => {
			const adapter = zodAdapter(testSchema);

			expect(typeof adapter).toBe('object');
		});
	});

	// ── emptyForm ───────────────────────────────────────

	describe('emptyForm', () => {
		it('should return a form object with default values', async () => {
			const form = await emptyForm(testSchema);

			expect(form).toBeDefined();
			expect(form).toHaveProperty('data');
			expect(form.data).toHaveProperty('name');
		});

		it('should return a form with valid: false initially (no data submitted)', async () => {
			const form = await emptyForm(testSchema);

			expect(form.valid).toBe(false);
		});

		it('should have an empty string as default for the name field', async () => {
			const form = await emptyForm(testSchema);

			expect(form.data.name).toBe('');
		});

		it('should work with a schema that has default values', async () => {
			const schemaWithDefaults = z.object({
				title: z.string().default('Untitled'),
				count: z.number().default(0)
			});

			const form = await emptyForm(schemaWithDefaults);

			expect(form.data.title).toBe('Untitled');
			expect(form.data.count).toBe(0);
		});
	});

	// ── validateForm ────────────────────────────────────

	describe('validateForm', () => {
		it('should return a valid form when given valid data', async () => {
			const formData = new FormData();
			formData.set('name', 'test project');
			const request = new Request('http://localhost', { method: 'POST', body: formData });

			const form = await validateForm(testSchema, request);

			expect(form.valid).toBe(true);
			expect(form.data.name).toBe('test project');
		});

		it('should return an invalid form when given empty required field', async () => {
			const formData = new FormData();
			formData.set('name', '');
			const request = new Request('http://localhost', { method: 'POST', body: formData });

			const form = await validateForm(testSchema, request);

			expect(form.valid).toBe(false);
		});

		it('should return an invalid form when required field is missing', async () => {
			const formData = new FormData();
			const request = new Request('http://localhost', { method: 'POST', body: formData });

			const form = await validateForm(testSchema, request);

			expect(form.valid).toBe(false);
		});

		it('should have errors on the invalid field', async () => {
			const formData = new FormData();
			formData.set('name', '');
			const request = new Request('http://localhost', { method: 'POST', body: formData });

			const form = await validateForm(testSchema, request);

			expect(form.errors.name).toBeDefined();
			expect(form.errors.name!.length).toBeGreaterThan(0);
		});

		it('should validate a more complex schema correctly', async () => {
			const complexSchema = z.object({
				title: z.string().min(1),
				description: z.string().optional(),
				priority: z.number().min(0).max(10).default(5)
			});

			const formData = new FormData();
			formData.set('title', 'My Task');
			formData.set('description', 'Some details');
			formData.set('priority', '7');
			const request = new Request('http://localhost', { method: 'POST', body: formData });

			const form = await validateForm(complexSchema, request);

			expect(form.valid).toBe(true);
			expect(form.data.title).toBe('My Task');
			expect(form.data.description).toBe('Some details');
			expect(form.data.priority).toBe(7);
		});

		it('should return errors for multiple invalid fields', async () => {
			const multiFieldSchema = z.object({
				name: z.string().min(1),
				email: z.string().email()
			});

			const formData = new FormData();
			formData.set('name', '');
			formData.set('email', 'not-an-email');
			const request = new Request('http://localhost', { method: 'POST', body: formData });

			const form = await validateForm(multiFieldSchema, request);

			expect(form.valid).toBe(false);
			expect(form.errors.name).toBeDefined();
			expect(form.errors.email).toBeDefined();
		});
	});
});
