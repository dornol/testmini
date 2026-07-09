export function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.getPrototypeOf(value) === Object.prototype;
}
