import type { RequestHandler } from './$types';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '$lib/server/mcp/server';
import { authenticateApiKey } from '$lib/server/api-key-auth';

const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

async function getOrCreateTransport(projectId: number, sessionId?: string) {
	if (sessionId && sessions.has(sessionId)) {
		return sessions.get(sessionId)!;
	}

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: () => crypto.randomUUID(),
		onsessioninitialized: (id) => {
			sessions.set(id, transport);
		},
		onsessionclosed: (id) => {
			sessions.delete(id);
		}
	});

	const server = createMcpServer(projectId);
	await server.connect(transport);

	return transport;
}

async function handleMcpRequest(request: Request): Promise<Response> {
	const auth = await authenticateApiKey(request);
	if (!auth) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const sessionId = request.headers.get('mcp-session-id') ?? undefined;
	const transport = await getOrCreateTransport(auth.projectId, sessionId);

	return transport.handleRequest(request);
}

export const GET: RequestHandler = async ({ request }) => {
	return handleMcpRequest(request);
};

export const POST: RequestHandler = async ({ request }) => {
	return handleMcpRequest(request);
};

export const DELETE: RequestHandler = async ({ request }) => {
	return handleMcpRequest(request);
};
