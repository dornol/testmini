import { mkdir, writeFile, readFile, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');

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
	const filePath = join(UPLOAD_DIR, objectKey);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, data);
}

export async function getFile(objectKey: string): Promise<Buffer> {
	const filePath = join(UPLOAD_DIR, objectKey);
	return readFile(filePath);
}

export async function deleteFile(objectKey: string): Promise<void> {
	const filePath = join(UPLOAD_DIR, objectKey);
	try {
		await unlink(filePath);
	} catch {
		// File already deleted or doesn't exist
	}
}

export async function fileExists(objectKey: string): Promise<boolean> {
	try {
		await stat(join(UPLOAD_DIR, objectKey));
		return true;
	} catch {
		return false;
	}
}
