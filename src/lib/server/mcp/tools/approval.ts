import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, testCase, approvalHistory } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export function registerApprovalTools(server: McpServer, projectId: number) {
	server.tool(
		'update-approval-status',
		'Update test case approval status (DRAFT → IN_REVIEW → APPROVED/REJECTED)',
		{
			testCaseId: z.number().describe('Test case ID'),
			toStatus: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED']).describe('New approval status'),
			comment: z.string().optional().describe('Approval comment')
		},
		async ({ testCaseId: tcId, toStatus, comment: approvalComment }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, tcId), eq(testCase.projectId, projectId))
			});
			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const fromStatus = tc.approvalStatus ?? 'DRAFT';

			await db.transaction(async (tx) => {
				await tx
					.update(testCase)
					.set({ approvalStatus: toStatus })
					.where(eq(testCase.id, tcId));

				await tx.insert(approvalHistory).values({
					testCaseId: tcId,
					fromStatus,
					toStatus,
					userId: proj.createdBy,
					comment: approvalComment ?? null
				});
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, testCaseId: tcId, fromStatus, toStatus }) }] };
		}
	);
}
