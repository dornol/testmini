import { mkdir, writeFile, readFile, unlink, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';

// ---------------------------------------------------------------------------
// S3 client (lazy-initialized)
// ---------------------------------------------------------------------------

let s3Client: import('@aws-sdk/client-s3').S3Client | null = null;

function getS3(): import('@aws-sdk/client-s3').S3Client {
	if (!s3Client) {
		throw new Error('S3 client not initialized');
	}
	return s3Client;
}

function getS3Bucket(): string {
	return env.S3_BUCKET!;
}

export function isS3Enabled(): boolean {
	return !!(env.S3_BUCKET && env.S3_ENDPOINT);
}

async function initS3(): Promise<void> {
	if (s3Client) return;
	const { S3Client } = await import('@aws-sdk/client-s3');
	s3Client = new S3Client({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION || 'us-east-1',
		credentials: {
			accessKeyId: env.S3_ACCESS_KEY_ID || '',
			secretAccessKey: env.S3_SECRET_ACCESS_KEY || ''
		},
		forcePathStyle: true // Required for MinIO and most S3-compatible stores
	});
}

// ---------------------------------------------------------------------------
// Local filesystem helpers
// ---------------------------------------------------------------------------

const UPLOAD_DIR = resolve(process.cwd(), 'data', 'uploads');

function safePath(objectKey: string): string {
	const filePath = resolve(UPLOAD_DIR, objectKey);
	if (!filePath.startsWith(UPLOAD_DIR + '/')) {
		throw new Error('Invalid object key');
	}
	return filePath;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
	if (isS3Enabled()) {
		await initS3();
		const { PutObjectCommand } = await import('@aws-sdk/client-s3');
		await getS3().send(
			new PutObjectCommand({
				Bucket: getS3Bucket(),
				Key: objectKey,
				Body: data
			})
		);
		return;
	}

	const filePath = safePath(objectKey);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, data);
}

export async function getFile(objectKey: string): Promise<Buffer> {
	if (isS3Enabled()) {
		await initS3();
		const { GetObjectCommand } = await import('@aws-sdk/client-s3');
		const res = await getS3().send(
			new GetObjectCommand({
				Bucket: getS3Bucket(),
				Key: objectKey
			})
		);
		return Buffer.from(await res.Body!.transformToByteArray());
	}

	return readFile(safePath(objectKey));
}

export async function deleteFile(objectKey: string): Promise<void> {
	if (isS3Enabled()) {
		await initS3();
		const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
		await getS3().send(
			new DeleteObjectCommand({
				Bucket: getS3Bucket(),
				Key: objectKey
			})
		);
		return;
	}

	try {
		await unlink(safePath(objectKey));
	} catch {
		// File already deleted or doesn't exist
	}
}

export async function fileExists(objectKey: string): Promise<boolean> {
	if (isS3Enabled()) {
		await initS3();
		const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
		try {
			await getS3().send(
				new HeadObjectCommand({
					Bucket: getS3Bucket(),
					Key: objectKey
				})
			);
			return true;
		} catch {
			return false;
		}
	}

	try {
		await stat(safePath(objectKey));
		return true;
	} catch {
		return false;
	}
}
