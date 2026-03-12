import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResources } from './resources';
import { registerTestCaseTools } from './tools/test-cases';
import { registerTestRunTools } from './tools/test-runs';
import { registerTagTools } from './tools/tags';
import { registerGroupTools } from './tools/groups';
import { registerTestSuiteTools } from './tools/test-suites';
import { registerTestPlanTools } from './tools/test-plans';
import { registerTemplateTools } from './tools/templates';
import { registerRequirementTools } from './tools/requirements';
import { registerIssueLinkTools } from './tools/issue-links';
import { registerExploratoryTools } from './tools/exploratory';
import { registerCommentTools } from './tools/comments';
import { registerApprovalTools } from './tools/approval';

/**
 * Creates an MCP server scoped to a specific project (authenticated via API key).
 */
export function createMcpServer(projectId: number) {
	const server = new McpServer({
		name: 'testmini',
		version: '1.0.0'
	});

	// ── Resources ─────────────────────────────────────────
	registerResources(server, projectId);

	// ── Tools ─────────────────────────────────────────────
	registerTestCaseTools(server, projectId);
	registerTestRunTools(server, projectId);
	registerTagTools(server, projectId);
	registerGroupTools(server, projectId);
	registerTestSuiteTools(server, projectId);
	registerTestPlanTools(server, projectId);
	registerTemplateTools(server, projectId);
	registerRequirementTools(server, projectId);
	registerIssueLinkTools(server, projectId);
	registerExploratoryTools(server, projectId);
	registerCommentTools(server, projectId);
	registerApprovalTools(server, projectId);

	return server;
}
