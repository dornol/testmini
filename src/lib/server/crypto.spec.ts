import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: { BETTER_AUTH_SECRET: 'test-secret-key-for-unit-tests-32chars!' }
}));

let encrypt: typeof import('./crypto').encrypt;
let decrypt: typeof import('./crypto').decrypt;

beforeAll(async () => {
	const mod = await import('./crypto');
	encrypt = mod.encrypt;
	decrypt = mod.decrypt;
});

describe('encrypt / decrypt', () => {
	it('should round-trip a simple string', () => {
		const plaintext = 'hello world';
		const encrypted = encrypt(plaintext);
		const decrypted = decrypt(encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it('should round-trip an empty string', () => {
		const encrypted = encrypt('');
		const decrypted = decrypt(encrypted);
		expect(decrypted).toBe('');
	});

	it('should round-trip unicode text', () => {
		const plaintext = '한국어 테스트 🚀 日本語';
		const encrypted = encrypt(plaintext);
		const decrypted = decrypt(encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it('should round-trip a long string', () => {
		const plaintext = 'a'.repeat(10_000);
		const encrypted = encrypt(plaintext);
		const decrypted = decrypt(encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it('should produce different ciphertext for the same input (random IV)', () => {
		const plaintext = 'same input';
		const encrypted1 = encrypt(plaintext);
		const encrypted2 = encrypt(plaintext);
		expect(encrypted1).not.toBe(encrypted2);
	});

	it('should produce ciphertext in iv:authTag:data format', () => {
		const encrypted = encrypt('test');
		const parts = encrypted.split(':');
		expect(parts).toHaveLength(3);
		// IV = 12 bytes = 24 hex chars
		expect(parts[0]).toHaveLength(24);
		// AuthTag = 16 bytes = 32 hex chars
		expect(parts[1]).toHaveLength(32);
		// Ciphertext should be non-empty
		expect(parts[2].length).toBeGreaterThan(0);
	});

	it('should throw on tampered ciphertext', () => {
		const encrypted = encrypt('secret');
		const parts = encrypted.split(':');
		// Tamper with ciphertext
		const tampered = `${parts[0]}:${parts[1]}:${'00'.repeat(parts[2].length / 2)}`;
		expect(() => decrypt(tampered)).toThrow();
	});

	it('should throw on invalid format', () => {
		expect(() => decrypt('not-valid-format')).toThrow();
	});
});
