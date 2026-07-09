const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9]\d*)$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export function parseCanonicalPositiveInteger(value: string): number | null {
	if (!POSITIVE_INTEGER_PATTERN.test(value)) return null;

	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseCanonicalPositiveIntegerList(value: string): number[] {
	return value
		.split(',')
		.map((token) => parseCanonicalPositiveInteger(token))
		.filter((id): id is number => id !== null);
}

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

export function parseOptionalPositiveIntegerSearchParam(
	value: string | null,
	label: string,
	options: { max?: number } = {}
): number | null {
	if (value === null || value.trim() === '') return null;

	const parsed = parseSearchInteger(value);
	if (parsed === null || parsed <= 0) {
		throw new Error(`Invalid ${label}`);
	}

	return options.max === undefined ? parsed : Math.min(options.max, parsed);
}

export function parsePositiveIntegerSearchParamStrict(
	value: string | null,
	label: string,
	options: { defaultValue?: number; max?: number } = {}
): number {
	if (value === null || value.trim() === '') {
		if (options.defaultValue !== undefined) return options.defaultValue;
		throw new Error(`Invalid ${label}`);
	}

	const parsed = parseOptionalPositiveIntegerSearchParam(value, label, options);
	if (parsed === null) {
		throw new Error(`Invalid ${label}`);
	}
	return parsed;
}

export function parseNonNegativeIntegerSearchParam(
	value: string | null,
	label: string,
	options: { defaultValue?: number; max?: number } = {}
): number {
	if (value === null || value.trim() === '') return options.defaultValue ?? 0;

	const parsed = parseSearchInteger(value);
	if (parsed === null || parsed < 0) {
		throw new Error(`Invalid ${label}`);
	}

	return options.max === undefined ? parsed : Math.min(options.max, parsed);
}

function parseSearchInteger(value: string | null): number | null {
	if (value === null || value.trim() === '') return null;
	if (!NON_NEGATIVE_INTEGER_PATTERN.test(value)) return null;

	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}
