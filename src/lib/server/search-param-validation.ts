export function parsePositiveIntegerSearchParam(
	value: string | null,
	defaultValue: number,
	options: { max?: number } = {}
): number {
	if (!Number.isSafeInteger(defaultValue) || defaultValue <= 0) {
		throw new Error('defaultValue must be a positive safe integer');
	}

	const parsed = parseSearchInteger(value);
	const normalized = parsed === null || parsed <= 0 ? defaultValue : parsed;
	return options.max === undefined ? normalized : Math.min(options.max, normalized);
}

function parseSearchInteger(value: string | null): number | null {
	if (value === null || value.trim() === '') return null;

	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}
