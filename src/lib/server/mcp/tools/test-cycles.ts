import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCycle } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import { eq, and, sql } from 'drizzle-orm';
import { createTestCycleSchema, updateTestCycleSchema } from '$lib/schemas/test-cycle.schema';

function firstValidationError(error: { issues: Array<{ message: string }> }): string {
	return error.issues[0]?.message ?? 'Invalid test cycle';
}

export function registerTestCycleTools(server: McpServer, projectId: number) {
	server.tool('list-test-cycles', 'List all test cycles for the project', {}, async () => {
		const cycles = await db.query.testCycle.findMany({
			where: eq(testCycle.projectId, projectId)
		});

		return ok(cycles);
	});

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
			const cycleNumber = (maxRow?.maxNum ?? 0) + 1;

			const parsed = createTestCycleSchema.safeParse({
				name,
				cycleNumber,
				startDate,
				endDate
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const [created] = await db
				.insert(testCycle)
				.values({
					projectId,
					name: parsed.data.name,
					cycleNumber: parsed.data.cycleNumber,
					status: parsed.data.status ?? 'PLANNED',
					startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
					endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
					createdBy: creator
				})
				.returning();

			if (!created) return err('Failed to create test cycle');
			return ok(created);
		}
	);

	server.tool(
		'delete-test-cycle',
		'Delete a test cycle by ID',
		{ testCycleId: mcpPositiveIdSchema.describe('Test cycle ID') },
		async ({ testCycleId }) => {
			const c = await db.query.testCycle.findFirst({
				where: and(eq(testCycle.id, testCycleId), eq(testCycle.projectId, projectId))
			});
			if (!c) return err('Test cycle not found');

			const [deleted] = await db
				.delete(testCycle)
				.where(and(eq(testCycle.id, testCycleId), eq(testCycle.projectId, projectId)))
				.returning({ id: testCycle.id });
			if (!deleted) return err('Test cycle not found');
			return ok({ success: true, deletedId: testCycleId });
		}
	);

	server.tool(
		'update-test-cycle',
		'Update a test cycle',
		{
			testCycleId: mcpPositiveIdSchema.describe('Test cycle ID'),
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

			const parsed = updateTestCycleSchema.safeParse({
				name,
				status,
				startDate,
				endDate
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const updates: Record<string, unknown> = {};
			if (parsed.data.name !== undefined) updates.name = parsed.data.name;
			if (parsed.data.status !== undefined) updates.status = parsed.data.status;
			if (parsed.data.startDate !== undefined)
				updates.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
			if (parsed.data.endDate !== undefined)
				updates.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;

			if (Object.keys(updates).length === 0) return err('No fields to update');

			const [updated] = await db
				.update(testCycle)
				.set(updates)
				.where(and(eq(testCycle.id, testCycleId), eq(testCycle.projectId, projectId)))
				.returning();
			if (!updated) return err('Test cycle not found');
			return ok(updated);
		}
	);
}
