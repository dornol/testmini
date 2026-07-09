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

import { parseJsonBody, parseJsonObjectBody } from './auth-utils';

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

	it.each(['abc', '-1', '1.5', 'Infinity', '9007199254740992'])(
		'should throw 400 when content-length is invalid: %s',
		async (contentLength) => {
			const request = new Request('http://localhost/api/test', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': contentLength
				},
				body: JSON.stringify({ ok: true })
			});

			await expect(parseJsonBody(request)).rejects.toMatchObject({ status: 400 });
		}
	);

	it('should throw 413 while streaming when body exceeds 1MB without content-length', async () => {
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ data: 'x'.repeat(1024 * 1024) })
		});

		await expect(parseJsonBody(request)).rejects.toMatchObject({ status: 413 });
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

describe('parseJsonObjectBody', () => {
	it('should parse plain object bodies', async () => {
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title: 'Hello' })
		});

		const result = await parseJsonObjectBody(request);
		expect(result).toEqual({ title: 'Hello' });
	});

	it.each([
		['array', [1, 2, 3]],
		['null', null],
		['string', 'hello']
	])('should throw 400 for non-object JSON body: %s', async (_label, body) => {
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});

		await expect(parseJsonObjectBody(request)).rejects.toMatchObject({ status: 400 });
	});
});
