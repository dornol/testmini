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
import { registerModuleTools } from './tools/modules';
import { registerReleaseTools } from './tools/releases';
import { registerTestCycleTools } from './tools/test-cycles';
import { registerReportTools } from './tools/reports';
import { registerSharedDataSetTools } from './tools/shared-datasets';
import { registerEnvironmentTools } from './tools/environments';
import { registerWebhookTools } from './tools/webhooks';
import { registerCustomFieldTools } from './tools/custom-fields';
import { registerSavedFilterTools } from './tools/saved-filters';
import { registerNotificationTools } from './tools/notifications';
import { registerAuditLogTools } from './tools/audit-logs';

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
	registerModuleTools(server, projectId);
	registerReleaseTools(server, projectId);
	registerTestCycleTools(server, projectId);
	registerReportTools(server, projectId);
	registerSharedDataSetTools(server, projectId);
	registerEnvironmentTools(server, projectId);
	registerWebhookTools(server, projectId);
	registerCustomFieldTools(server, projectId);
	registerSavedFilterTools(server, projectId);
	registerNotificationTools(server, projectId);
	registerAuditLogTools(server, projectId);

	return server;
}
