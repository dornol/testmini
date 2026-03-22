import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, approvalHistory } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
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
			if (!tc) return err('Test case not found');

			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

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
					userId: creator,
					comment: approvalComment ?? null
				});
			});

			return ok({ success: true, testCaseId: tcId, fromStatus, toStatus });
		}
	);
}
