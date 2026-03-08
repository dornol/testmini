import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	mockEnv,
	mockSend,
	mockMkdir,
	mockWriteFile,
	mockReadFile,
	mockUnlink,
	mockStat
} = vi.hoisted(() => {
	const mockEnv: Record<string, string | undefined> = {};
	const mockSend = vi.fn();
	return {
		mockEnv,
		mockSend,
		mockMkdir: vi.fn().mockResolvedValue(undefined),
		mockWriteFile: vi.fn().mockResolvedValue(undefined),
		mockReadFile: vi.fn().mockResolvedValue(Buffer.from('file-content')),
		mockUnlink: vi.fn().mockResolvedValue(undefined),
		mockStat: vi.fn().mockResolvedValue({})
	};
});

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

vi.mock('@aws-sdk/client-s3', () => ({
	S3Client: function S3Client() {
		return { send: mockSend };
	},
	PutObjectCommand: function PutObjectCommand(p: Record<string, unknown>) {
		return { ...p, _type: 'Put' };
	},
	GetObjectCommand: function GetObjectCommand(p: Record<string, unknown>) {
		return { ...p, _type: 'Get' };
	},
	DeleteObjectCommand: function DeleteObjectCommand(p: Record<string, unknown>) {
		return { ...p, _type: 'Delete' };
	},
	HeadObjectCommand: function HeadObjectCommand(p: Record<string, unknown>) {
		return { ...p, _type: 'Head' };
	}
}));

vi.mock('node:fs/promises', () => ({
	mkdir: (...args: unknown[]) => mockMkdir(...args),
	writeFile: (...args: unknown[]) => mockWriteFile(...args),
	readFile: (...args: unknown[]) => mockReadFile(...args),
	unlink: (...args: unknown[]) => mockUnlink(...args),
	stat: (...args: unknown[]) => mockStat(...args)
}));

import {
	generateObjectKey,
	saveFile,
	getFile,
	deleteFile,
	fileExists,
	isS3Enabled
} from './storage';

describe('storage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete mockEnv.S3_BUCKET;
		delete mockEnv.S3_ENDPOINT;
		delete mockEnv.S3_REGION;
		delete mockEnv.S3_ACCESS_KEY_ID;
		delete mockEnv.S3_SECRET_ACCESS_KEY;
	});

	// -----------------------------------------------------------------------
	// generateObjectKey
	// -----------------------------------------------------------------------
	describe('generateObjectKey', () => {
		it('should generate key with lowercase reference type, id, and sanitized filename', () => {
			const key = generateObjectKey('TESTCASE', 42, 'my file (1).png');
			expect(key).toMatch(/^testcase\/42\/[0-9a-f-]+_my_file__1_.png$/);
		});

		it('should sanitize special characters in filename', () => {
			const key = generateObjectKey('EXECUTION', 1, 'test@file#name.txt');
			expect(key).toMatch(/^execution\/1\/[0-9a-f-]+_test_file_name\.txt$/);
		});

		it('should replace non-ASCII characters with underscores', () => {
			const key = generateObjectKey('TESTCASE', 5, '한글파일.pdf');
			expect(key).toMatch(/^testcase\/5\/[0-9a-f-]+_.*\.pdf$/);
			// Korean characters should be replaced
			expect(key).not.toMatch(/[가-힣]/);
		});

		it('should preserve dots, hyphens, and underscores in filenames', () => {
			const key = generateObjectKey('FAILURE', 10, 'my_file-name.v2.tar.gz');
			expect(key).toMatch(/^failure\/10\/[0-9a-f-]+_my_file-name\.v2\.tar\.gz$/);
		});

		it('should generate unique keys for the same input', () => {
			const key1 = generateObjectKey('TESTCASE', 1, 'file.txt');
			const key2 = generateObjectKey('TESTCASE', 1, 'file.txt');
			expect(key1).not.toBe(key2);
		});

		it('should handle empty filename', () => {
			const key = generateObjectKey('TESTCASE', 1, '');
			expect(key).toMatch(/^testcase\/1\/[0-9a-f-]+_$/);
		});

		it('should handle filename with only special characters', () => {
			const key = generateObjectKey('TESTCASE', 1, '!!!@@@###');
			expect(key).toMatch(/^testcase\/1\/[0-9a-f-]+__+$/);
		});

		it('should handle very long filenames', () => {
			const longName = 'a'.repeat(500) + '.txt';
			const key = generateObjectKey('TESTCASE', 1, longName);
			expect(key).toContain('.txt');
			expect(key.startsWith('testcase/1/')).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// isS3Enabled
	// -----------------------------------------------------------------------
	describe('isS3Enabled', () => {
		it('returns false when no env vars are set', () => {
			expect(isS3Enabled()).toBe(false);
		});

		it('returns false when only S3_BUCKET is set', () => {
			mockEnv.S3_BUCKET = 'test-bucket';
			expect(isS3Enabled()).toBe(false);
		});

		it('returns false when only S3_ENDPOINT is set', () => {
			mockEnv.S3_ENDPOINT = 'http://localhost:9000';
			expect(isS3Enabled()).toBe(false);
		});

		it('returns true when both S3_BUCKET and S3_ENDPOINT are set', () => {
			mockEnv.S3_BUCKET = 'test-bucket';
			mockEnv.S3_ENDPOINT = 'http://localhost:9000';
			expect(isS3Enabled()).toBe(true);
		});

		it('returns false when S3_BUCKET is empty string', () => {
			mockEnv.S3_BUCKET = '';
			mockEnv.S3_ENDPOINT = 'http://localhost:9000';
			expect(isS3Enabled()).toBe(false);
		});

		it('returns false when S3_ENDPOINT is empty string', () => {
			mockEnv.S3_BUCKET = 'test-bucket';
			mockEnv.S3_ENDPOINT = '';
			expect(isS3Enabled()).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Local filesystem mode
	// -----------------------------------------------------------------------
	describe('local filesystem mode', () => {
		describe('saveFile', () => {
			it('creates parent directories recursively', async () => {
				await saveFile('testcase/1/abc.txt', Buffer.from('hello'));
				expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
			});

			it('writes the correct data to the resolved path', async () => {
				const data = Buffer.from('hello world');
				await saveFile('testcase/1/abc.txt', data);
				expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining('testcase/1/abc.txt'), data);
			});

			it('does not use S3', async () => {
				await saveFile('testcase/1/abc.txt', Buffer.from('x'));
				expect(mockSend).not.toHaveBeenCalled();
			});

			it('rejects directory traversal with ../', async () => {
				await expect(saveFile('../../../etc/passwd', Buffer.from('x'))).rejects.toThrow(
					'Invalid object key'
				);
			});

			it('rejects directory traversal with absolute path component', async () => {
				// resolve() with an absolute second arg replaces the first
				await expect(saveFile('/etc/passwd', Buffer.from('x'))).rejects.toThrow(
					'Invalid object key'
				);
			});

			it('propagates filesystem write errors', async () => {
				mockWriteFile.mockRejectedValueOnce(new Error('ENOSPC'));
				await expect(saveFile('testcase/1/abc.txt', Buffer.from('x'))).rejects.toThrow('ENOSPC');
			});

			it('handles empty buffer', async () => {
				const data = Buffer.alloc(0);
				await saveFile('testcase/1/empty.bin', data);
				expect(mockWriteFile).toHaveBeenCalledWith(expect.any(String), data);
			});

			it('handles large buffer', async () => {
				const data = Buffer.alloc(1024); // 1 KB
				await saveFile('testcase/1/large.bin', data);
				expect(mockWriteFile).toHaveBeenCalledWith(expect.any(String), data);
			});
		});

		describe('getFile', () => {
			it('reads from the local filesystem and returns a Buffer', async () => {
				const result = await getFile('testcase/1/abc.txt');
				expect(Buffer.isBuffer(result)).toBe(true);
				expect(result).toEqual(Buffer.from('file-content'));
			});

			it('does not use S3', async () => {
				await getFile('testcase/1/abc.txt');
				expect(mockSend).not.toHaveBeenCalled();
			});

			it('rejects directory traversal', async () => {
				await expect(getFile('../../etc/shadow')).rejects.toThrow('Invalid object key');
			});

			it('propagates filesystem read errors (file not found)', async () => {
				mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
				await expect(getFile('testcase/1/missing.txt')).rejects.toThrow('ENOENT');
			});
		});

		describe('deleteFile', () => {
			it('calls unlink on the resolved path', async () => {
				await deleteFile('testcase/1/abc.txt');
				expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('testcase/1/abc.txt'));
			});

			it('does not use S3', async () => {
				await deleteFile('testcase/1/abc.txt');
				expect(mockSend).not.toHaveBeenCalled();
			});

			it('swallows ENOENT errors (file already deleted)', async () => {
				mockUnlink.mockRejectedValueOnce(new Error('ENOENT'));
				await expect(deleteFile('testcase/1/abc.txt')).resolves.toBeUndefined();
			});

			it('swallows any error from unlink', async () => {
				mockUnlink.mockRejectedValueOnce(new Error('EPERM'));
				await expect(deleteFile('testcase/1/abc.txt')).resolves.toBeUndefined();
			});

			it('swallows traversal errors (catch-all behavior)', async () => {
				// deleteFile has a try/catch that swallows ALL errors including traversal
				await expect(deleteFile('../../etc/important')).resolves.toBeUndefined();
				expect(mockUnlink).not.toHaveBeenCalled();
			});
		});

		describe('fileExists', () => {
			it('returns true when stat succeeds', async () => {
				expect(await fileExists('testcase/1/abc.txt')).toBe(true);
				expect(mockStat).toHaveBeenCalledWith(expect.stringContaining('testcase/1/abc.txt'));
			});

			it('returns false when stat throws', async () => {
				mockStat.mockRejectedValueOnce(new Error('ENOENT'));
				expect(await fileExists('testcase/1/abc.txt')).toBe(false);
			});

			it('does not use S3', async () => {
				await fileExists('testcase/1/abc.txt');
				expect(mockSend).not.toHaveBeenCalled();
			});

			it('returns false for traversal paths (caught by error handler)', async () => {
				// fileExists catches all errors and returns false, including traversal errors
				expect(await fileExists('../../etc/passwd')).toBe(false);
				expect(mockStat).not.toHaveBeenCalled();
			});
		});
	});

	// -----------------------------------------------------------------------
	// S3 mode
	// -----------------------------------------------------------------------
	describe('S3 mode', () => {
		beforeEach(() => {
			mockEnv.S3_BUCKET = 'test-bucket';
			mockEnv.S3_ENDPOINT = 'http://localhost:9000';
			mockEnv.S3_REGION = 'us-east-1';
			mockEnv.S3_ACCESS_KEY_ID = 'minioadmin';
			mockEnv.S3_SECRET_ACCESS_KEY = 'minioadmin';
		});

		describe('saveFile', () => {
			it('sends PutObjectCommand with correct bucket, key, and body', async () => {
				const data = Buffer.from('hello');
				await saveFile('testcase/1/abc.txt', data);
				expect(mockSend).toHaveBeenCalledWith(
					expect.objectContaining({
						Bucket: 'test-bucket',
						Key: 'testcase/1/abc.txt',
						Body: data,
						_type: 'Put'
					})
				);
			});

			it('does not touch the local filesystem', async () => {
				await saveFile('testcase/1/abc.txt', Buffer.from('hello'));
				expect(mockMkdir).not.toHaveBeenCalled();
				expect(mockWriteFile).not.toHaveBeenCalled();
			});

			it('handles empty buffer', async () => {
				const data = Buffer.alloc(0);
				await saveFile('testcase/1/empty.bin', data);
				expect(mockSend).toHaveBeenCalledWith(
					expect.objectContaining({ Body: data, _type: 'Put' })
				);
			});

			it('propagates S3 errors', async () => {
				mockSend.mockRejectedValueOnce(new Error('AccessDenied'));
				await expect(saveFile('testcase/1/abc.txt', Buffer.from('x'))).rejects.toThrow(
					'AccessDenied'
				);
			});

			it('does not apply safePath validation (S3 keys are not filesystem paths)', async () => {
				// S3 mode should not reject keys that look like traversal in local mode
				await saveFile('some/deep/nested/key.txt', Buffer.from('x'));
				expect(mockSend).toHaveBeenCalled();
			});
		});

		describe('getFile', () => {
			it('sends GetObjectCommand and returns buffer from response body', async () => {
				const bodyBytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
				mockSend.mockResolvedValueOnce({
					Body: { transformToByteArray: () => Promise.resolve(bodyBytes) }
				});
				const result = await getFile('testcase/1/abc.txt');
				expect(result).toEqual(Buffer.from(bodyBytes));
				expect(mockSend).toHaveBeenCalledWith(
					expect.objectContaining({
						Bucket: 'test-bucket',
						Key: 'testcase/1/abc.txt',
						_type: 'Get'
					})
				);
			});

			it('does not touch the local filesystem', async () => {
				mockSend.mockResolvedValueOnce({
					Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(0)) }
				});
				await getFile('testcase/1/abc.txt');
				expect(mockReadFile).not.toHaveBeenCalled();
			});

			it('propagates S3 NoSuchKey errors', async () => {
				mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));
				await expect(getFile('testcase/1/missing.txt')).rejects.toThrow('NoSuchKey');
			});

			it('handles empty file from S3', async () => {
				mockSend.mockResolvedValueOnce({
					Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(0)) }
				});
				const result = await getFile('testcase/1/empty.bin');
				expect(result).toEqual(Buffer.alloc(0));
			});

			it('handles binary data correctly', async () => {
				const binaryData = new Uint8Array([0x00, 0xff, 0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
				mockSend.mockResolvedValueOnce({
					Body: { transformToByteArray: () => Promise.resolve(binaryData) }
				});
				const result = await getFile('testcase/1/image.png');
				expect(result).toEqual(Buffer.from(binaryData));
				expect(result.length).toBe(6);
			});
		});

		describe('deleteFile', () => {
			it('sends DeleteObjectCommand with correct bucket and key', async () => {
				await deleteFile('testcase/1/abc.txt');
				expect(mockSend).toHaveBeenCalledWith(
					expect.objectContaining({
						Bucket: 'test-bucket',
						Key: 'testcase/1/abc.txt',
						_type: 'Delete'
					})
				);
			});

			it('does not touch the local filesystem', async () => {
				await deleteFile('testcase/1/abc.txt');
				expect(mockUnlink).not.toHaveBeenCalled();
			});

			it('propagates S3 errors (unlike local mode which swallows)', async () => {
				mockSend.mockRejectedValueOnce(new Error('AccessDenied'));
				await expect(deleteFile('testcase/1/abc.txt')).rejects.toThrow('AccessDenied');
			});
		});

		describe('fileExists', () => {
			it('returns true when HeadObjectCommand succeeds', async () => {
				mockSend.mockResolvedValueOnce({});
				expect(await fileExists('testcase/1/abc.txt')).toBe(true);
				expect(mockSend).toHaveBeenCalledWith(
					expect.objectContaining({
						Bucket: 'test-bucket',
						Key: 'testcase/1/abc.txt',
						_type: 'Head'
					})
				);
			});

			it('returns false when HeadObjectCommand throws NotFound', async () => {
				mockSend.mockRejectedValueOnce(new Error('NotFound'));
				expect(await fileExists('testcase/1/abc.txt')).toBe(false);
			});

			it('returns false for any error (treats all errors as not-found)', async () => {
				mockSend.mockRejectedValueOnce(new Error('NetworkError'));
				expect(await fileExists('testcase/1/abc.txt')).toBe(false);
			});

			it('does not touch the local filesystem', async () => {
				mockSend.mockResolvedValueOnce({});
				await fileExists('testcase/1/abc.txt');
				expect(mockStat).not.toHaveBeenCalled();
			});
		});
	});

	// -----------------------------------------------------------------------
	// Mode switching (ensure no cross-contamination)
	// -----------------------------------------------------------------------
	describe('mode switching', () => {
		it('uses local filesystem when S3 env vars are removed after being set', async () => {
			// Start with S3 enabled
			mockEnv.S3_BUCKET = 'test-bucket';
			mockEnv.S3_ENDPOINT = 'http://localhost:9000';
			expect(isS3Enabled()).toBe(true);

			// Remove S3 env vars (simulates runtime config change)
			delete mockEnv.S3_BUCKET;
			delete mockEnv.S3_ENDPOINT;
			expect(isS3Enabled()).toBe(false);

			// saveFile should use local filesystem
			await saveFile('testcase/1/abc.txt', Buffer.from('x'));
			expect(mockWriteFile).toHaveBeenCalled();
		});

		it('operations are mutually exclusive between S3 and local', async () => {
			// Local mode: no S3 calls
			await saveFile('testcase/1/file.txt', Buffer.from('local'));
			expect(mockWriteFile).toHaveBeenCalledTimes(1);
			expect(mockSend).not.toHaveBeenCalled();

			vi.clearAllMocks();

			// S3 mode: no local calls
			mockEnv.S3_BUCKET = 'bucket';
			mockEnv.S3_ENDPOINT = 'http://localhost:9000';
			await saveFile('testcase/1/file.txt', Buffer.from('s3'));
			expect(mockSend).toHaveBeenCalledTimes(1);
			expect(mockWriteFile).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// Path security (directory traversal)
	// -----------------------------------------------------------------------
	describe('path security', () => {
		it('rejects ../ traversal in saveFile', async () => {
			await expect(saveFile('../../../etc/passwd', Buffer.from('x'))).rejects.toThrow(
				'Invalid object key'
			);
		});

		it('rejects ../ traversal in getFile', async () => {
			await expect(getFile('../../etc/shadow')).rejects.toThrow('Invalid object key');
		});

		it('deleteFile swallows traversal errors (catch-all)', async () => {
			// deleteFile's catch block swallows all errors
			await expect(deleteFile('../../etc/important')).resolves.toBeUndefined();
		});

		it('fileExists returns false for traversal paths', async () => {
			// fileExists catches all errors and returns false
			expect(await fileExists('../../etc/passwd')).toBe(false);
		});

		it('rejects absolute paths', async () => {
			await expect(saveFile('/etc/passwd', Buffer.from('x'))).rejects.toThrow(
				'Invalid object key'
			);
		});

		it('rejects encoded traversal (..%2F does not bypass after resolve)', async () => {
			// resolve() handles this, but the key contains literal encoded chars
			// which resolve() treats as regular filename characters — this is actually safe
			// because resolve won't decode URL-encoded strings
			const key = '..%2F..%2Fetc/passwd';
			// This might or might not throw depending on how resolve handles it
			// The important thing is it stays within UPLOAD_DIR
			try {
				await saveFile(key, Buffer.from('x'));
				// If it doesn't throw, verify the write path is inside UPLOAD_DIR
				const writtenPath = mockWriteFile.mock.calls[0]?.[0] as string;
				expect(writtenPath).toContain('data/uploads');
			} catch (e) {
				expect((e as Error).message).toBe('Invalid object key');
			}
		});

		it('allows nested subdirectories within upload dir', async () => {
			await saveFile('testcase/1/subdir/deep/file.txt', Buffer.from('ok'));
			expect(mockWriteFile).toHaveBeenCalled();
		});
	});
});
