const MAX_CUSTOM_TEMPLATE_JSON_LENGTH = 20_000;
const MAX_TEMPLATE_STRING_LENGTH = 4_000;
const MAX_HEADER_COUNT = 20;
const MAX_HEADER_NAME_LENGTH = 128;
const MAX_HEADER_VALUE_LENGTH = 2_000;

const ALLOWED_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const FORBIDDEN_HEADERS = new Set([
	'authorization',
	'cookie',
	'host',
	'proxy-authorization',
	'set-cookie',
	'content-length',
	'transfer-encoding',
	'connection',
	'upgrade'
]);

export type CustomIssueTemplate = {
	titleTemplate?: string;
	bodyTemplate?: string;
	method?: 'POST' | 'PUT' | 'PATCH';
	headers?: Record<string, string>;
};

export function validateCustomIssueTemplate(
	value: unknown
): { ok: true; template: CustomIssueTemplate } | { ok: false; error: string } {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { ok: false, error: 'Custom template must be an object' };
	}

	if (JSON.stringify(value).length > MAX_CUSTOM_TEMPLATE_JSON_LENGTH) {
		return { ok: false, error: 'Custom template is too large' };
	}

	const input = value as Record<string, unknown>;
	const template: CustomIssueTemplate = {};

	for (const key of ['titleTemplate', 'bodyTemplate'] as const) {
		const raw = input[key];
		if (raw === undefined) continue;
		if (typeof raw !== 'string') {
			return { ok: false, error: `Custom template ${key} must be a string` };
		}
		if (raw.length > MAX_TEMPLATE_STRING_LENGTH) {
			return {
				ok: false,
				error: `Custom template ${key} must be ${MAX_TEMPLATE_STRING_LENGTH} characters or less`
			};
		}
		template[key] = raw;
	}

	if (input.method !== undefined) {
		if (typeof input.method !== 'string') {
			return { ok: false, error: 'Custom template method must be a string' };
		}
		const method = input.method.toUpperCase();
		if (!ALLOWED_METHODS.has(method)) {
			return { ok: false, error: 'Custom template method must be POST, PUT, or PATCH' };
		}
		template.method = method as CustomIssueTemplate['method'];
	}

	if (input.headers !== undefined) {
		if (!input.headers || typeof input.headers !== 'object' || Array.isArray(input.headers)) {
			return { ok: false, error: 'Custom template headers must be an object' };
		}

		const headerEntries = Object.entries(input.headers as Record<string, unknown>);
		if (headerEntries.length > MAX_HEADER_COUNT) {
			return { ok: false, error: `Custom template headers must contain ${MAX_HEADER_COUNT} or fewer entries` };
		}

		const headers: Record<string, string> = {};
		for (const [name, rawValue] of headerEntries) {
			const normalizedName = name.trim().toLowerCase();
			if (!normalizedName) {
				return { ok: false, error: 'Custom template header names must not be empty' };
			}
			if (normalizedName.length > MAX_HEADER_NAME_LENGTH) {
				return {
					ok: false,
					error: `Custom template header names must be ${MAX_HEADER_NAME_LENGTH} characters or less`
				};
			}
			if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(normalizedName)) {
				return { ok: false, error: 'Custom template header names must be valid HTTP tokens' };
			}
			if (FORBIDDEN_HEADERS.has(normalizedName)) {
				return { ok: false, error: `Custom template header ${name} is not allowed` };
			}
			if (typeof rawValue !== 'string') {
				return { ok: false, error: `Custom template header ${name} must be a string` };
			}
			if (rawValue.length > MAX_HEADER_VALUE_LENGTH) {
				return {
					ok: false,
					error: `Custom template header ${name} must be ${MAX_HEADER_VALUE_LENGTH} characters or less`
				};
			}
			if (/[\r\n]/.test(rawValue)) {
				return { ok: false, error: `Custom template header ${name} must not contain line breaks` };
			}
			headers[name.trim()] = rawValue;
		}
		template.headers = headers;
	}

	return { ok: true, template };
}
