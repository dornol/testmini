import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCycle } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, buildUpdates } from '../helpers';
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

			return ok(cycles);
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
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

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
					createdBy: creator
				})
				.returning();

			return ok(created);
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
			if (!c) return err('Test cycle not found');

			await db.delete(testCycle).where(eq(testCycle.id, testCycleId));
			return ok({ success: true, deletedId: testCycleId });
		}
	);

	server.tool(
		'update-test-cycle',
		'Update a test cycle',
		{
			testCycleId: z.number().describe('Test cycle ID'),
			name: z.string().optional().describe('New name'),
			status: z.string().optional().describe('New status'),
			startDate: z.string().optional().describe('New start date (ISO)'),
			endDate: z.string().optional().describe('New end date (ISO)')
		},
		async ({ testCycleId, name, status, startDate, endDate }) => {
			const c = await db.query.testCycle.findFirst({
				where: and(eq(testCycle.id, testCycleId), eq(testCycle.projectId, projectId))
			});
			if (!c) return err('Test cycle not found');

			const updates: Record<string, unknown> = {};
			if (name !== undefined) updates.name = name;
			if (status !== undefined) updates.status = status;
			if (startDate !== undefined) updates.startDate = new Date(startDate);
			if (endDate !== undefined) updates.endDate = new Date(endDate);

			const [updated] = await db.update(testCycle).set(updates).where(eq(testCycle.id, testCycleId)).returning();
			return ok(updated);
		}
	);
}
