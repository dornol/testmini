export function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

export function stringField(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

export function optionalStringField(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

export function nullableStringField(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

export function normalizeIssueColor(value: unknown): string {
	const color = typeof value === 'string' ? value.trim() : '';
	if (!color) return '#6b7280';
	return color.startsWith('#') ? color : `#${color}`;
}
