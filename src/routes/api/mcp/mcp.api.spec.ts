import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuthenticateApiKey = vi.fn();
const mockConnect = vi.fn();

type TransportOptions = {
	onsessioninitialized?: (id: string) => void;
	onsessionclosed?: (id: string) => void;
};

type MockTransport = {
	handleRequest: ReturnType<typeof vi.fn>;
};

const createdTransports: MockTransport[] = [];
const createdTransportOptions: TransportOptions[] = [];

vi.mock('$lib/server/api-key-auth', () => ({
	authenticateApiKey: mockAuthenticateApiKey
}));

vi.mock('$lib/server/mcp/server', () => ({
	createMcpServer: vi.fn(() => ({
		connect: mockConnect
	}))
}));

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
	WebStandardStreamableHTTPServerTransport: vi.fn().mockImplementation(function (
		this: MockTransport,
		options: TransportOptions
	) {
		this.handleRequest = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
		const transport = {
			handleRequest: this.handleRequest
		};
		createdTransportOptions.push(options);
		createdTransports.push(transport);
	})
}));

const { POST } = await import('./+server');

function makeRequest(sessionId?: string): Request {
	return new Request('http://localhost:5173/api/mcp', {
		method: 'POST',
		headers: sessionId ? { 'mcp-session-id': sessionId } : undefined,
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
	});
}

describe('/api/mcp POST', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
		createdTransports.length = 0;
		createdTransportOptions.length = 0;
	});

	it('should return 401 when API key authentication fails', async () => {
		mockAuthenticateApiKey.mockResolvedValue(null);

		const response = await POST({ request: makeRequest() } as never);
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toBe('Unauthorized');
		expect(createdTransports).toHaveLength(0);
	});

	it('should reuse an existing MCP session for the same authenticated project', async () => {
		mockAuthenticateApiKey.mockResolvedValue({ projectId: 1, keyId: 1 });

		const initialResponse = await POST({ request: makeRequest() } as never);
		await initialResponse.text();
		createdTransportOptions[0].onsessioninitialized?.('session-project-1');

		const response = await POST({ request: makeRequest('session-project-1') } as never);

		expect(response.status).toBe(200);
		expect(createdTransports).toHaveLength(1);
		expect(createdTransports[0].handleRequest).toHaveBeenCalledTimes(2);
		expect(mockConnect).toHaveBeenCalledTimes(1);
	});

	it('should reject an existing MCP session when the API key belongs to another project', async () => {
		mockAuthenticateApiKey.mockResolvedValueOnce({ projectId: 1, keyId: 1 });

		const initialResponse = await POST({ request: makeRequest() } as never);
		await initialResponse.text();
		createdTransportOptions[0].onsessioninitialized?.('session-project-swap');

		mockAuthenticateApiKey.mockResolvedValueOnce({ projectId: 2, keyId: 2 });

		const response = await POST({ request: makeRequest('session-project-swap') } as never);
		const data = await response.json();

		expect(response.status).toBe(403);
		expect(data.error).toBe('Forbidden');
		expect(createdTransports).toHaveLength(1);
		expect(createdTransports[0].handleRequest).toHaveBeenCalledTimes(1);
		expect(mockConnect).toHaveBeenCalledTimes(1);
	});

	it('should reject an unknown MCP session id instead of creating a new session', async () => {
		mockAuthenticateApiKey.mockResolvedValue({ projectId: 1, keyId: 1 });

		const response = await POST({ request: makeRequest('missing-session') } as never);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe('MCP session not found');
		expect(createdTransports).toHaveLength(0);
		expect(mockConnect).not.toHaveBeenCalled();
	});

	it('should expire idle MCP sessions', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-09T00:00:00Z'));
		mockAuthenticateApiKey.mockResolvedValue({ projectId: 1, keyId: 1 });

		const initialResponse = await POST({ request: makeRequest() } as never);
		await initialResponse.text();
		createdTransportOptions[0].onsessioninitialized?.('stale-session');

		vi.setSystemTime(new Date('2026-07-09T00:31:00Z'));
		const response = await POST({ request: makeRequest('stale-session') } as never);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe('MCP session not found');
		expect(createdTransports).toHaveLength(1);
		expect(createdTransports[0].handleRequest).toHaveBeenCalledTimes(1);
		expect(mockConnect).toHaveBeenCalledTimes(1);
	});
});
