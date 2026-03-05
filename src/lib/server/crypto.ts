import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';
import { env } from '$env/dynamic/private';

const PBKDF2_SALT = 'testmini-encryption-salt';
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = 'sha256';

function deriveKey(): Buffer {
	const secret = env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error('BETTER_AUTH_SECRET is not set');
	return pbkdf2Sync(secret, PBKDF2_SALT, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST);
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns `iv:authTag:ciphertext` in hex.
 */
export function encrypt(plaintext: string): string {
	const key = deriveKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an `iv:authTag:ciphertext` hex string using AES-256-GCM.
 */
export function decrypt(encrypted: string): string {
	const key = deriveKey();
	const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');
	const iv = Buffer.from(ivHex, 'hex');
	const authTag = Buffer.from(authTagHex, 'hex');
	const ciphertext = Buffer.from(ciphertextHex, 'hex');
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
