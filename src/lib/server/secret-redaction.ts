const REDACTED = '[redacted]';
const MAX_PUBLIC_ERROR_LENGTH = 1000;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function secretVariants(secret: string): string[] {
	const variants = new Set<string>();
	const trimmed = secret.trim();
	if (!trimmed) return [];

	variants.add(trimmed);

	for (const part of trimmed.split(':')) {
		if (part.length >= 8) variants.add(part);
	}

	try {
		variants.add(Buffer.from(trimmed, 'utf8').toString('base64'));
	} catch {
		// Buffer is available server-side; keep this defensive for test environments.
	}

	return [...variants].filter((variant) => variant.length >= 8);
}

export function redactSecrets(
	message: string,
	secrets: Array<string | null | undefined> = []
): string {
	let redacted = message;

	redacted = redacted.replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${REDACTED}@`);
	redacted = redacted.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`);
	redacted = redacted.replace(/\btoken\s+[A-Za-z0-9._~+/=-]{8,}/gi, `token ${REDACTED}`);
	redacted = redacted.replace(
		/\b((?:[A-Za-z0-9_-]*(?:token|secret|password)|authorization)\b["']?\s*[:=]\s*["']?)([^"',\s}]+)/gi,
		`$1${REDACTED}`
	);

	for (const secret of secrets) {
		if (!secret) continue;
		for (const variant of secretVariants(secret)) {
			redacted = redacted.replace(new RegExp(escapeRegExp(variant), 'g'), REDACTED);
		}
	}

	if (redacted.length > MAX_PUBLIC_ERROR_LENGTH) {
		return `${redacted.slice(0, MAX_PUBLIC_ERROR_LENGTH)}...`;
	}

	return redacted;
}
