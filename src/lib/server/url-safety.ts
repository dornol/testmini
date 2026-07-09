import { lookup } from 'node:dns/promises';

export interface UrlValidationResult {
	ok: boolean;
	error?: string;
}

export async function validatePublicHttpUrl(rawUrl: string): Promise<UrlValidationResult> {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return { ok: false, error: 'Invalid URL' };
	}

	if (!['http:', 'https:'].includes(parsed.protocol)) {
		return { ok: false, error: 'URL must use http or https' };
	}

	if (!parsed.hostname) {
		return { ok: false, error: 'URL must include a hostname' };
	}

	let addresses: string[];
	try {
		const records = await lookup(parsed.hostname, { all: true });
		addresses = records.map((record) => record.address);
	} catch {
		return { ok: false, error: 'URL hostname could not be resolved' };
	}

	if (addresses.length === 0) {
		return { ok: false, error: 'URL hostname could not be resolved' };
	}

	if (addresses.some(isPrivateOrReservedIp)) {
		return { ok: false, error: 'URL resolves to a private or reserved IP address' };
	}

	return { ok: true };
}

export async function validatePublicHttpsUrl(rawUrl: string): Promise<UrlValidationResult> {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return { ok: false, error: 'Invalid URL' };
	}

	if (parsed.protocol !== 'https:') {
		return { ok: false, error: 'URL must use https' };
	}

	return validatePublicHttpUrl(rawUrl);
}

export function isPrivateOrReservedIp(address: string): boolean {
	if (address.includes(':')) {
		const normalized = normalizeIpv6(address);
		if (normalized.includes('.')) {
			const embeddedIpv4 = normalized.slice(normalized.lastIndexOf(':') + 1);
			return isPrivateOrReservedIpv4(embeddedIpv4);
		}

		const expanded = expandIpv6(normalized);
		const mappedIpv4 = ipv4FromMappedIpv6(expanded);
		if (mappedIpv4) return isPrivateOrReservedIpv4(mappedIpv4);

		if (expanded === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
		if (expanded === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
		if (expanded.startsWith('0064:ff9b:0001:')) return true;
		if (expanded.startsWith('0064:ff9b:0000:0000:0000:0000:')) return true;
		if (expanded.startsWith('0100:0000:0000:0000:')) return true;
		if (/^2001:0[0-1][0-9a-f]:/.test(expanded)) return true;
		if (/^2001:0db8:/.test(expanded)) return true;
		if (/^2002:/.test(expanded)) return true;
		if (/^fe[89ab][0-9a-f]:/.test(expanded)) return true;
		if (/^f[cd][0-9a-f]{2}:/.test(expanded)) return true;
		if (/^ff[0-9a-f]{2}:/.test(expanded)) return true;
		return false;
	}

	return isPrivateOrReservedIpv4(address);
}

function isPrivateOrReservedIpv4(address: string): boolean {
	const parts = address.split('.').map(Number);
	if (
		parts.length !== 4 ||
		parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
	) {
		return true;
	}

	const [a, b] = parts;

	if (a === 0) return true;
	if (a === 10) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	if (a === 127) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 0) return true;
	if (a === 192 && b === 0 && parts[2] === 2) return true;
	if (a === 192 && b === 88 && parts[2] === 99) return true;
	if (a === 192 && b === 168) return true;
	if (a === 198 && (b === 18 || b === 19)) return true;
	if (a === 198 && b === 51 && parts[2] === 100) return true;
	if (a === 203 && b === 0 && parts[2] === 113) return true;
	if (a >= 224) return true;

	return false;
}

function normalizeIpv6(address: string): string {
	return address.replace(/^\[|\]$/g, '').toLowerCase();
}

function expandIpv6(address: string): string {
	const halves = address.split('::');
	let groups: string[];

	if (halves.length === 2) {
		const left = halves[0] ? halves[0].split(':') : [];
		const right = halves[1] ? halves[1].split(':') : [];
		const missing = 8 - left.length - right.length;
		groups = [...left, ...Array(Math.max(missing, 0)).fill('0'), ...right];
	} else {
		groups = address.split(':');
	}

	return groups.map((group) => group.padStart(4, '0')).join(':');
}

function ipv4FromMappedIpv6(expanded: string): string | null {
	const groups = expanded.split(':');
	if (
		groups.length !== 8 ||
		!groups.slice(0, 5).every((group) => group === '0000') ||
		groups[5] !== 'ffff'
	) {
		return null;
	}

	const high = Number.parseInt(groups[6], 16);
	const low = Number.parseInt(groups[7], 16);
	if (!Number.isInteger(high) || !Number.isInteger(low)) return null;

	return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
}
