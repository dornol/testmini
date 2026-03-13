import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import crypto from 'node:crypto';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	projectWebhook: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		url: 'url',
		secret: 'secret',
		events: 'events',
		enabled: 'enabled',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	webhookDeliveryLog: {
		id: 'id',
		webhookId: 'webhook_id',
		event: 'event',
		url: 'url',
		requestBody: 'request_body',
		statusCode: 'status_code',
		responseBody: 'response_body',
		success: 'success',
		errorMessage: 'error_message',
		attempt: 'attempt',
		duration: 'duration',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

// Mock db.insert for delivery log writes
const mockInsertValues = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
mockDb.insert = vi.fn().mockReturnValue({ values: mockInsertValues });

const { sendProjectWebhooks, RETRY_DELAYS } = await import('./webhooks');

// Zero out retry delays for fast tests
RETRY_DELAYS[0] = 0;
RETRY_DELAYS[1] = 0;
RETRY_DELAYS[2] = 0;

const sampleWebhook = {
	id: 1,
	projectId: 1,
	name: 'Slack #testing',
	url: 'https://hooks.example.com/webhook',
	secret: null,
	events: [] as string[],
	enabled: true,
	createdBy: 'user-1',
	createdAt: new Date()
};

describe('sendProjectWebhooks', () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
		vi.stubGlobal('fetch', fetchSpy);
		// Re-setup insert mock after clearAllMocks
		mockDb.insert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('should send POST to webhook URL when matching event', async () => {
		mockSelectResult(mockDb, [sampleWebhook]);

		await sendProjectWebhooks(1, 'TEST_RUN_COMPLETED', {
			title: 'Run done',
			message: 'Sprint 1 completed'
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, opts] = fetchSpy.mock.calls[0];
		expect(url).toBe('https://hooks.example.com/webhook');
		expect(opts.method).toBe('POST');
		expect(opts.headers['Content-Type']).toBe('application/json');
		expect(opts.headers['User-Agent']).toBe('testmini-webhook/1.0');

		const body = JSON.parse(opts.body);
		expect(body.event).toBe('TEST_RUN_COMPLETED');
		expect(body.projectId).toBe(1);
		expect(body.data.title).toBe('Run done');
		expect(body.data.message).toBe('Sprint 1 completed');
		expect(body.timestamp).toBeDefined();
	});

	it('should send to webhooks with empty events array (subscribes to all)', async () => {
		mockSelectResult(mockDb, [{ ...sampleWebhook, events: [] }]);

		await sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'TC-0001 failed' });

		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('should send to webhooks whose events array includes the event', async () => {
		mockSelectResult(mockDb, [
			{ ...sampleWebhook, id: 1, events: ['TEST_RUN_COMPLETED'] },
			{ ...sampleWebhook, id: 2, events: ['TEST_FAILED'] }
		]);

		await sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'Failed' });

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url] = fetchSpy.mock.calls[0];
		expect(url).toBe('https://hooks.example.com/webhook');
	});

	it('should skip webhooks that do not match the event', async () => {
		mockSelectResult(mockDb, [
			{ ...sampleWebhook, events: ['COMMENT_ADDED'] }
		]);

		await sendProjectWebhooks(1, 'TEST_RUN_COMPLETED', { title: 'Done', message: 'Done' });

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('should not fetch when no webhooks exist', async () => {
		mockSelectResult(mockDb, []);

		await sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'Failed' });

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('should include HMAC signature header when secret is set', async () => {
		const secret = 'my-secret-key';
		mockSelectResult(mockDb, [{ ...sampleWebhook, secret }]);

		await sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'Failed' });

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [, opts] = fetchSpy.mock.calls[0];
		const sig = opts.headers['X-Webhook-Signature'];
		expect(sig).toBeDefined();
		expect(sig).toMatch(/^sha256=[a-f0-9]+$/);

		// Verify HMAC is correct
		const expectedSig = crypto
			.createHmac('sha256', secret)
			.update(opts.body)
			.digest('hex');
		expect(sig).toBe(`sha256=${expectedSig}`);
	});

	it('should not include signature header when secret is null', async () => {
		mockSelectResult(mockDb, [{ ...sampleWebhook, secret: null }]);

		await sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'Failed' });

		const [, opts] = fetchSpy.mock.calls[0];
		expect(opts.headers['X-Webhook-Signature']).toBeUndefined();
	});

	it('should not throw when fetch fails (fire-and-forget, retries exhausted)', async () => {
		mockSelectResult(mockDb, [sampleWebhook]);
		fetchSpy.mockRejectedValue(new Error('Network error'));

		await expect(
			sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'Failed' })
		).resolves.toBeUndefined();

		// 3 attempts (initial + 2 retries)
		expect(fetchSpy).toHaveBeenCalledTimes(3);
	});

	it('should not throw when fetch returns non-ok response (retries exhausted)', async () => {
		mockSelectResult(mockDb, [sampleWebhook]);
		fetchSpy.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

		await expect(
			sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'Failed' })
		).resolves.toBeUndefined();

		// 3 attempts
		expect(fetchSpy).toHaveBeenCalledTimes(3);
	});

	it('should not throw when DB query fails', async () => {
		mockDb.select.mockImplementation(() => {
			throw new Error('DB connection failed');
		});

		await expect(
			sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'Failed' })
		).resolves.toBeUndefined();
	});

	it('should send to multiple webhooks in parallel', async () => {
		mockSelectResult(mockDb, [
			{ ...sampleWebhook, id: 1, url: 'https://hook1.example.com' },
			{ ...sampleWebhook, id: 2, url: 'https://hook2.example.com' },
			{ ...sampleWebhook, id: 3, url: 'https://hook3.example.com' }
		]);

		await sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'Failed' });

		expect(fetchSpy).toHaveBeenCalledTimes(3);
		const urls = fetchSpy.mock.calls.map((c: unknown[]) => c[0]);
		expect(urls).toContain('https://hook1.example.com');
		expect(urls).toContain('https://hook2.example.com');
		expect(urls).toContain('https://hook3.example.com');
	});

	it('should continue sending to other webhooks when one fails', async () => {
		mockSelectResult(mockDb, [
			{ ...sampleWebhook, id: 1, url: 'https://hook1.example.com' },
			{ ...sampleWebhook, id: 2, url: 'https://hook2.example.com' }
		]);

		fetchSpy.mockImplementation((url: string) => {
			if (url === 'https://hook1.example.com') {
				return Promise.reject(new Error('Timeout'));
			}
			return Promise.resolve(new Response('ok', { status: 200 }));
		});

		await sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'Failed' });

		// hook1: 3 retries (all fail), hook2: 1 success = 4 total
		expect(fetchSpy).toHaveBeenCalledTimes(4);
	});

	it('should log delivery to database', async () => {
		mockSelectResult(mockDb, [sampleWebhook]);

		await sendProjectWebhooks(1, 'TEST_RUN_COMPLETED', { title: 'Done', message: 'Done' });

		expect(mockDb.insert).toHaveBeenCalled();
	});

	it('should stop retrying after first success', async () => {
		mockSelectResult(mockDb, [sampleWebhook]);

		// First call fails, second succeeds
		fetchSpy
			.mockRejectedValueOnce(new Error('Temporary'))
			.mockResolvedValueOnce(new Response('ok', { status: 200 }));

		await sendProjectWebhooks(1, 'TEST_FAILED', { title: 'Fail', message: 'Failed' });

		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});
});
