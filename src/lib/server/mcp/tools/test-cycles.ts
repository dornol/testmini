import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, testCycle } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export function registerTestCycleTools(server: McpServer, projectId: number) {
	server.tool(
		'list-test-cycles',
		'List all test cycles for the project',
		{},
		async () => {
			const cycles = await db.query.testCycle.findMany({
				where: eq(testCycle.projectId, projectId)
			});

			return { content: [{ type: 'text' as const, text: JSON.stringify(cycles, null, 2) }] };
		}
	);

	server.tool(
		'create-test-cycle',
		'Create a new test cycle',
		{
			name: z.string().describe('Test cycle name'),
			startDate: z.string().optional().describe('Start date (ISO 8601)'),
			endDate: z.string().optional().describe('End date (ISO 8601)')
		},
		async ({ name, startDate, endDate }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [maxRow] = await db
				.select({ maxNum: sql<number>`coalesce(max(${testCycle.cycleNumber}), 0)` })
				.from(testCycle)
				.where(eq(testCycle.projectId, projectId));

			const [created] = await db
				.insert(testCycle)
				.values({
					projectId,
					name,
					cycleNumber: (maxRow?.maxNum ?? 0) + 1,
					startDate: startDate ? new Date(startDate) : null,
					endDate: endDate ? new Date(endDate) : null,
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'delete-test-cycle',
		'Delete a test cycle by ID',
		{ testCycleId: z.number().describe('Test cycle ID') },
		async ({ testCycleId }) => {
			const c = await db.query.testCycle.findFirst({
				where: and(eq(testCycle.id, testCycleId), eq(testCycle.projectId, projectId))
			});
			if (!c)
				return {
					content: [{ type: 'text' as const, text: 'Test cycle not found' }],
					isError: true
				};

			await db.delete(testCycle).where(eq(testCycle.id, testCycleId));
			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify({ success: true, deletedId: testCycleId })
					}
				]
			};
		}
	);
}
