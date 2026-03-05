import { describe, expect, it } from 'vitest';
import { isFormDirty, isInlineEditDirty, shouldWarnOnApiKeyClose } from './unsaved-guard';

describe('isFormDirty', () => {
	it('should return false when tainted is null', () => {
		expect(isFormDirty(null, false)).toBe(false);
	});

	it('should return false when tainted is undefined', () => {
		expect(isFormDirty(undefined, false)).toBe(false);
	});

	it('should return false when submitting', () => {
		expect(isFormDirty({ title: true }, true)).toBe(false);
	});

	it('should return false when no fields are tainted', () => {
		expect(isFormDirty({ title: false, description: false }, false)).toBe(false);
	});

	it('should return true when at least one field is tainted', () => {
		expect(isFormDirty({ title: true, description: false }, false)).toBe(true);
	});

	it('should return true when all fields are tainted', () => {
		expect(isFormDirty({ title: true, description: true }, false)).toBe(true);
	});

	it('should return false for empty tainted object', () => {
		expect(isFormDirty({}, false)).toBe(false);
	});
});

describe('isInlineEditDirty', () => {
	it('should return false when editingValue is undefined', () => {
		expect(isInlineEditDirty(undefined, 'original')).toBe(false);
	});

	it('should return false when originalValue is undefined', () => {
		expect(isInlineEditDirty('new', undefined)).toBe(false);
	});

	it('should return false when both are undefined', () => {
		expect(isInlineEditDirty(undefined, undefined)).toBe(false);
	});

	it('should return false when values are identical', () => {
		expect(isInlineEditDirty('hello', 'hello')).toBe(false);
	});

	it('should return false when values differ only by whitespace', () => {
		expect(isInlineEditDirty('  hello  ', 'hello')).toBe(false);
	});

	it('should return true when values differ', () => {
		expect(isInlineEditDirty('new value', 'old value')).toBe(true);
	});

	it('should return true when editing value is empty but original is not', () => {
		expect(isInlineEditDirty('', 'original')).toBe(true);
	});
});

describe('shouldWarnOnApiKeyClose', () => {
	it('should return false when generatedKey is null', () => {
		expect(shouldWarnOnApiKeyClose(false, null)).toBe(false);
	});

	it('should return false when key has been copied', () => {
		expect(shouldWarnOnApiKeyClose(true, 'tmk_abc123')).toBe(false);
	});

	it('should return true when key exists but has not been copied', () => {
		expect(shouldWarnOnApiKeyClose(false, 'tmk_abc123')).toBe(true);
	});

	it('should return false when key is null even if not copied', () => {
		expect(shouldWarnOnApiKeyClose(false, null)).toBe(false);
	});
});
