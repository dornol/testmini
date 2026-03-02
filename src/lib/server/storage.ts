import { mkdir, writeFile, readFile, unlink, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const UPLOAD_DIR = resolve(process.cwd(), 'data', 'uploads');

function safePath(objectKey: string): string {
	const filePath = resolve(UPLOAD_DIR, objectKey);
	if (!filePath.startsWith(UPLOAD_DIR + '/')) {
		throw new Error('Invalid object key');
	}
	return filePath;
}

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function generateObjectKey(
	referenceType: string,
	referenceId: number,
	fileName: string
): string {
	const uuid = randomUUID();
	const safe = sanitizeFileName(fileName);
	return `${referenceType.toLowerCase()}/${referenceId}/${uuid}_${safe}`;
}

export async function saveFile(objectKey: string, data: Buffer): Promise<void> {
	const filePath = safePath(objectKey);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, data);
}

export async function getFile(objectKey: string): Promise<Buffer> {
	return readFile(safePath(objectKey));
}

export async function deleteFile(objectKey: string): Promise<void> {
	try {
		await unlink(safePath(objectKey));
	} catch {
		// File already deleted or doesn't exist
	}
}

export async function fileExists(objectKey: string): Promise<boolean> {
	try {
		await stat(safePath(objectKey));
		return true;
	} catch {
		return false;
	}
}
