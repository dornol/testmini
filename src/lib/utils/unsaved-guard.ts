/**
 * Utility functions for unsaved changes protection.
 * Extracted for testability — UI components delegate to these pure functions.
 */

/**
 * Determines whether the form is "dirty" (has unsaved changes).
 * Integrates with superForm's tainted store.
 */
export function isFormDirty(tainted: Record<string, boolean> | undefined | null, submitting: boolean): boolean {
	if (submitting) return false;
	if (!tainted) return false;
	return Object.values(tainted).some(Boolean);
}

/**
 * Determines whether the inline edit cell has been modified.
 * Returns true if value differs from the original.
 */
export function isInlineEditDirty(
	editingValue: string | undefined,
	originalValue: string | undefined
): boolean {
	if (editingValue === undefined || originalValue === undefined) return false;
	return editingValue.trim() !== originalValue.trim();
}

/**
 * Determines whether the API key dialog should warn before closing.
 * Returns true if the key has not been copied yet.
 */
export function shouldWarnOnApiKeyClose(keyCopied: boolean, generatedKey: string | null): boolean {
	if (!generatedKey) return false;
	return !keyCopied;
}
