import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
	db: { query: { projectMember: { findFirst: vi.fn() } } }
}));

vi.mock('$lib/server/db/schema', () => ({
	projectMember: { projectId: 'project_id', userId: 'user_id' }
}));

vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { parseJsonBody } from './auth-utils';

describe('parseJsonBody', () => {
	it('should parse valid JSON body', async () => {
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title: 'Hello' })
		});

		const result = await parseJsonBody(request);
		expect(result).toEqual({ title: 'Hello' });
	});

	it('should throw 400 for invalid JSON', async () => {
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not valid json{'
		});

		await expect(parseJsonBody(request)).rejects.toThrow();
	});

	it('should throw 413 when content-length exceeds 1MB', async () => {
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': String(2 * 1024 * 1024) // 2MB
			},
			body: JSON.stringify({ data: 'x' })
		});

		await expect(parseJsonBody(request)).rejects.toThrow();
	});

	it('should allow requests at exactly 1MB', async () => {
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': String(1024 * 1024) // exactly 1MB
			},
			body: JSON.stringify({ data: 'x' })
		});

		const result = await parseJsonBody(request);
		expect(result).toEqual({ data: 'x' });
	});

	it('should allow requests without content-length header', async () => {
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ok: true })
		});

		const result = await parseJsonBody(request);
		expect(result).toEqual({ ok: true });
	});

	it('should parse empty object body', async () => {
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		const result = await parseJsonBody(request);
		expect(result).toEqual({});
	});

	it('should parse array body', async () => {
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify([1, 2, 3])
		});

		const result = await parseJsonBody(request);
		expect(result).toEqual([1, 2, 3]);
	});
});
