import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockLookup = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
	lookup: mockLookup
}));

const { isPrivateOrReservedIp, validatePublicHttpUrl, validatePublicHttpsUrl } =
	await import('./url-safety');

describe('isPrivateOrReservedIp', () => {
	it.each([
		'0.0.0.0',
		'10.1.2.3',
		'100.64.0.1',
		'127.0.0.1',
		'169.254.10.20',
		'172.16.0.1',
		'192.0.2.1',
		'192.168.1.1',
		'198.18.0.1',
		'198.51.100.42',
		'203.0.113.10',
		'224.0.0.1',
		'240.0.0.1',
		'::',
		'::1',
		'::ffff:127.0.0.1',
		'::ffff:7f00:0001',
		'64:ff9b::192.0.2.33',
		'64:ff9b:1::1',
		'100::1',
		'2001:db8::1',
		'2002::1',
		'fc00::1',
		'fd00::1',
		'fe80::1',
		'ff00::1'
	])('returns true for private or reserved address %s', (address) => {
		expect(isPrivateOrReservedIp(address)).toBe(true);
	});

	it.each(['8.8.8.8', '93.184.216.34', '2001:4860:4860::8888', '2606:4700:4700::1111'])(
		'returns false for public address %s',
		(address) => {
			expect(isPrivateOrReservedIp(address)).toBe(false);
		}
	);
});

describe('validatePublicHttpUrl', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('accepts public http urls', async () => {
		mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

		await expect(validatePublicHttpUrl('https://example.com/hook')).resolves.toEqual({
			ok: true
		});
	});

	it('rejects urls resolving to a reserved IPv6 address', async () => {
		mockLookup.mockResolvedValue([{ address: '2001:db8::1', family: 6 }]);

		await expect(validatePublicHttpUrl('https://example.com/hook')).resolves.toEqual({
			ok: false,
			error: 'URL resolves to a private or reserved IP address'
		});
	});

	it('accepts public IPv6 literal urls without DNS lookup', async () => {
		await expect(validatePublicHttpUrl('https://[2606:4700:4700::1111]/hook')).resolves.toEqual({
			ok: true
		});
		expect(mockLookup).not.toHaveBeenCalled();
	});

	it.each([
		'https://[::1]/hook',
		'https://[::ffff:127.0.0.1]/hook',
		'https://2130706433/hook',
		'https://0x7f000001/hook',
		'https://017700000001/hook',
		'https://127.1/hook'
	])('rejects private or obfuscated IP literal %s without DNS lookup', async (url) => {
		await expect(validatePublicHttpUrl(url)).resolves.toEqual({
			ok: false,
			error: 'URL resolves to a private or reserved IP address'
		});
		expect(mockLookup).not.toHaveBeenCalled();
	});

	it('rejects non-HTTPS urls when HTTPS is required', async () => {
		await expect(validatePublicHttpsUrl('http://example.com/hook')).resolves.toEqual({
			ok: false,
			error: 'URL must use https'
		});
		expect(mockLookup).not.toHaveBeenCalled();
	});

	it('rejects http URLs with embedded credentials before DNS lookup', async () => {
		await expect(validatePublicHttpUrl('https://user:token@example.com/hook')).resolves.toEqual({
			ok: false,
			error: 'URL must not include credentials'
		});
		expect(mockLookup).not.toHaveBeenCalled();
	});

	it('rejects https URLs with embedded credentials before DNS lookup', async () => {
		await expect(validatePublicHttpsUrl('https://user:token@example.com/hook')).resolves.toEqual({
			ok: false,
			error: 'URL must not include credentials'
		});
		expect(mockLookup).not.toHaveBeenCalled();
	});
});
