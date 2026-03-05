import { db } from '$lib/server/db';
import { projectApiKey } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

/**
 * Hash an API key using SHA-256.
 */
export function hashApiKey(key: string): string {
	return createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key: "tmk_" + 32 random hex chars.
 */
export function generateApiKey(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	const hex = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `tmk_${hex}`;
}

/**
 * Authenticate a request by Bearer API key.
 * Returns { projectId, keyId } on success, null on failure.
 */
export async function authenticateApiKey(
	request: Request
): Promise<{ projectId: number; keyId: number } | null> {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}

	const key = authHeader.slice(7).trim();
	if (!key.startsWith('tmk_')) {
		return null;
	}

	const keyHash = hashApiKey(key);

	const record = await db.query.projectApiKey.findFirst({
		where: eq(projectApiKey.keyHash, keyHash)
	});

	if (!record) {
		return null;
	}

	// Update lastUsedAt asynchronously (fire-and-forget)
	db.update(projectApiKey)
		.set({ lastUsedAt: new Date() })
		.where(eq(projectApiKey.id, record.id))
		.catch(() => {});

	return { projectId: record.projectId, keyId: record.id };
}
