import type { RequestHandler } from './$types';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '$lib/server/mcp/server';
import { authenticateApiKey } from '$lib/server/api-key-auth';

type McpSession = {
	projectId: number;
	transport: WebStandardStreamableHTTPServerTransport;
	lastSeenAt: number;
};

const sessions = new Map<string, McpSession>();
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 1000;

function pruneSessions(now = Date.now()) {
	for (const [id, session] of sessions) {
		if (now - session.lastSeenAt > SESSION_TTL_MS) {
			sessions.delete(id);
		}
	}

	while (sessions.size > MAX_SESSIONS) {
		const oldest = sessions.keys().next().value as string | undefined;
		if (!oldest) break;
		sessions.delete(oldest);
	}
}

async function getOrCreateTransport(projectId: number, sessionId?: string) {
	pruneSessions();

	if (sessionId) {
		const session = sessions.get(sessionId);
		if (!session) {
			return { status: 404 as const };
		}
		if (session.projectId !== projectId) {
			return { status: 403 as const };
		}
		session.lastSeenAt = Date.now();
		return { transport: session.transport };
	}

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: () => crypto.randomUUID(),
		onsessioninitialized: (id) => {
			sessions.set(id, { projectId, transport, lastSeenAt: Date.now() });
			pruneSessions();
		},
		onsessionclosed: (id) => {
			sessions.delete(id);
		}
	});

	const server = createMcpServer(projectId);
	await server.connect(transport);

	return { transport };
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
	const transportResult = await getOrCreateTransport(auth.projectId, sessionId);
	if ('status' in transportResult && transportResult.status === 403) {
		return new Response(JSON.stringify({ error: 'Forbidden' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	if ('status' in transportResult && transportResult.status === 404) {
		return new Response(JSON.stringify({ error: 'MCP session not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return transportResult.transport.handleRequest(request);
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
